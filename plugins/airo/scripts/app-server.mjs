import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
export class CodexServer {
  constructor(command = 'codex', cwd, spawnImpl = spawn, disabled = []) {
    this.sequence = 0; this.pending = new Map(); this.notify = () => {}; this.request = async () => ({ decision: 'decline' });
    // Overrides are process-local; never rewrite the user's Codex settings or auth.
    const env = { ...process.env };
    for (const key of ['OPENAI_API_KEY','OPENAI_BASE_URL','OPENAI_ORG_ID','OPENAI_PROJECT_ID']) delete env[key];
    this.child = spawnImpl(command, ['app-server', '--stdio', '-c', 'mcp_servers={}', '-c', 'plugins={}', '-c', 'model_provider="openai"', '-c', 'model_providers={}',
      '-c', 'features.apps=false', '-c', 'features.shell_tool=false', '-c', 'features.apply_patch_freeform=false',
      '-c', 'web_search="disabled"', ...disabled.flatMap(override => ['-c',override])], { cwd, env, stdio: ['pipe','pipe','pipe'], windowsHide: true });
    this.child.stderr.on('data', () => {}); // Don't persist provider output or credentials.
    const rejectAll = () => { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex 실행 연결이 종료됐습니다.')); } this.pending.clear(); this.notify({ method: 'bridge/exited' }); };
    this.child.on('error', rejectAll); this.child.on('exit', rejectAll);
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', line => {
      let message; try { message = JSON.parse(line); } catch { return; }
      if (message.method && message.id !== undefined) {
        Promise.resolve(this.request(message)).then(result => this.write({ id: message.id, result }), () => this.write({ id: message.id, error: { code: -32603, message: 'AIRO tool request failed' } }));
      } else if (message.id !== undefined) {
        const waiting = this.pending.get(message.id); if (!waiting) return;
        clearTimeout(waiting.timer); this.pending.delete(message.id);
        if (message.error) waiting.reject(new Error(message.error.message ?? 'Codex 요청 오류')); else waiting.resolve(message.result);
      } else this.notify(message);
    });
  }
  write(message) { if (!this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(message)+'\n'); }
  call(method, params = {}, timeout = 60000) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex ${method} 응답 시간이 지났습니다.`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer }); this.write({ id, method, params });
    });
  }
  async initialize() {
    await this.call('initialize', { clientInfo: { name: 'airo_web_chat', title: 'AIRO', version: '0.2.0' }, capabilities: { experimentalApi: true } });
    this.write({ method: 'initialized', params: {} });
  }
  async accountState() {
    const { account } = await this.call('account/read', { refreshToken: false });
    return !account ? 'login_required' : account.type === 'chatgpt' ? 'ready' : 'api_account';
  }
  close() { this.lines.close(); this.child.kill(); }
}

export async function isolatedCodexServer(command, cwd) {
  let server = new CodexServer(command,cwd);
  try {
    await server.initialize();
    const { config } = await server.call('config/read',{includeLayers:false});
    // Empty table overrides merge with config.toml. Explicitly disable every inherited
    // server/plugin before starting a model turn, including owner/admin integrations.
    const servers = Object.keys(config.mcp_servers ?? {}), plugins = Object.keys(config.plugins ?? {});
    const disabled = [
      ...(servers.length ? [`mcp_servers={${servers.map(name=>`${JSON.stringify(name)}={enabled=false,required=false}`).join(',')}}`] : []),
      ...(plugins.length ? [`plugins={${plugins.map(name=>`${JSON.stringify(name)}={enabled=false}`).join(',')}}`] : []),
    ];
    if (disabled.length) { server.close(); server = new CodexServer(command,cwd,spawn,disabled); await server.initialize(); }
    const status = await server.call('mcpServerStatus/list',{});
    if (status.data?.some(row => Object.keys(row.tools ?? {}).length > 0)) throw new Error('여행 전용 Codex 실행을 분리하지 못했습니다.');
    return server;
  } catch (error) { server.close(); throw error; }
}

export async function runCodexJob(server, job, worker, cwd, { timeoutMs = 540000 } = {}) {
  const payload = job.payload;
  const allowed = new Set(payload.tools.map(t => t.name));
  let output = '', threadId, turnId, stopped = false, failure, inFlight = false;
  let settle;
  const finished = new Promise(resolve => { settle = resolve; });
  let flushing = Promise.resolve();
  const flush = () => {
    if (inFlight || stopped) return flushing;
    inFlight = true;
    flushing = worker('progress', { jobId: job.id, text: output.slice(0,32000) }).finally(() => { inFlight = false; });
    return flushing;
  };
  const stop = error => { if (stopped) return; stopped = true; failure = error; settle(); if (threadId && turnId) void server.call('turn/interrupt', { threadId, turnId }).catch(() => {}); };
  server.request = async message => {
    if (message.method !== 'item/tool/call') {
      // This trip assistant has no reason to run local commands or read local files.
      if (/requestApproval/.test(message.method)) return { decision: 'decline' };
      if (/requestUserInput/.test(message.method)) return { answers: {} };
      throw new Error('Only AIRO itinerary tools are enabled');
    }
    const { tool, arguments: args, callId, threadId: requestedThread } = message.params;
    if (stopped || requestedThread !== threadId || !allowed.has(tool) || !args || Array.isArray(args) || typeof args !== 'object') return { success: false, contentItems: [{ type: 'inputText', text: '이 여행에 허용된 도구만 사용할 수 있습니다.' }] };
    for (;;) {
      if (stopped) throw new Error('JOB_STOPPED');
      let status;
      try { status = await worker('call', { jobId: job.id, callKey: callId, tool, arguments: args }); }
      catch (e) { stop(e); throw e; }
      if (status.state === 'done') return { success: status.result.success, contentItems: [{ type: 'inputText', text: JSON.stringify(status.result.success ? status.result.data : { error: status.result.error }) }] };
      await new Promise(resolve => setTimeout(resolve, 700));
    }
  };
  server.notify = message => {
    if (message.method === 'bridge/exited') { stop(new Error('Codex 실행이 종료됐습니다.')); return; }
    if (message.params?.threadId !== threadId) return;
    if (message.method === 'item/agentMessage/delta') output += message.params.delta ?? '';
    if (message.method === 'turn/started') turnId = message.params.turn.id;
    if (message.method === 'turn/completed') { failure = message.params.turn.error ? new Error(message.params.turn.error.message) : undefined; if (message.params.turn.status !== 'completed' && !failure) failure = new Error('Codex 대화가 중지됐습니다.'); settle(); }
  };
  const timer = setInterval(() => { if (threadId) void flush().catch(stop); }, 1500);
  const timeout = setTimeout(() => stop(new Error('Codex 응답 대기 시간이 지났습니다.')), timeoutMs);
  try {
    const thread = await server.call('thread/start', { cwd, ephemeral: true, sandbox: 'read-only', approvalPolicy: 'untrusted', selectedCapabilityRoots: [], environments: [],
      baseInstructions: payload.instructions, dynamicTools: payload.tools.map(t => ({ ...t, type: 'function', deferLoading: false })),
      config: { 'features.shell_tool': false, 'features.apply_patch_freeform': false, web_search: 'disabled' } });
    threadId = thread.thread.id;
    const context = JSON.stringify({ currentItinerary: payload.snapshot, previousConversation: payload.history });
    const turn = await server.call('turn/start', { threadId, input: [{ type: 'text', text: `참고 자료(JSON):\n${context}\n\n현재 사용자의 요청:\n${payload.message}`, text_elements: [] }] });
    turnId = turn.turn.id;
    await finished;
    if (failure) throw failure;
    await flushing; await flush(); await worker('complete', { jobId: job.id });
  } catch (error) {
    await flushing.catch(() => {});
    await worker('fail', { jobId: job.id, error: 'Codex가 요청을 마치지 못했습니다. 연결 상태와 변경된 일정을 확인해 주세요.' }).catch(() => {});
    throw error;
  } finally { stopped = true; clearInterval(timer); clearTimeout(timeout); server.request = async () => ({ decision: 'decline' }); server.notify = () => {}; }
}
