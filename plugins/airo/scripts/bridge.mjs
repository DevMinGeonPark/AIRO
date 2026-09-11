/* global AIRO_COMPILED */
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, open as openFile, unlink } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { isolatedCodexServer, runCodexJob } from './app-server.mjs';
const ORIGIN = 'https://airo.dev-heptivision.com';
const root = join(homedir(), '.airo', 'codex');
const stateFile = join(root, 'device.json'), statusFile = join(root, 'status.json'), lockFile = join(root, 'worker.lock');
const compiled = typeof AIRO_COMPILED !== 'undefined' && AIRO_COMPILED;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(path) { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } }
async function save(path, value) { await writeFile(path, JSON.stringify(value), { mode: 0o600 }); }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }); child.on('error', () => {}); child.unref();
}
export async function launch() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  let state = await json(stateFile);
  const previous = await json(statusFile);
  const lock = await json(lockFile);
  const replace = !state || process.argv.includes('--reconnect') || previous?.state === 'revoked';
  if (replace && lock && alive(lock.pid)) throw new Error('기존 연결을 해제하고 잠시 후 다시 연결해 주세요.');
  if (replace) { state = { id: randomUUID(), key: randomBytes(32).toString('hex'), name: hostname().slice(0,80), origin: ORIGIN }; await save(stateFile, state); }
  if (!lock || !alive(lock.pid) || lock.deviceId !== state.id) {
    if (lock && alive(lock.pid) && lock.deviceId !== state.id) throw new Error('기존 연결에서 연결 해제를 마친 후 다시 시작해 주세요.');
    if (lock) await unlink(lockFile).catch(() => {});
    const command = process.execPath, args = [...(compiled ? [] : [fileURLToPath(import.meta.url)]), '--worker'];
    const codexArg = process.argv.indexOf('--codex'); if (codexArg !== -1 && process.argv[codexArg+1]) args.push('--codex', process.argv[codexArg+1]);
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }); child.unref();
  }
  const url = new URL('/connect/codex', ORIGIN); url.searchParams.set('device', state.id); url.searchParams.set('name', state.name); url.hash = new URLSearchParams({ key: state.key }).toString();
  const paired = previous?.deviceId === state.id && previous?.paired;
  const link = paired ? `${ORIGIN}/app/settings/ai` : url.href;
  openBrowser(link);
  console.log(JSON.stringify({ status: 'started', pairingCode: state.id.slice(0,8).toUpperCase(), url: link, message: '브라우저에서 AIRO 연결을 승인해 주세요. 연결 번호가 같은지 확인하세요.' }));
}
async function workerLoop() {
  const state = await json(stateFile); if (!state) throw new Error('연결 설정이 없습니다.');
  await mkdir(join(root, 'workspace'), { recursive: true, mode: 0o700 });
  let lock;
  try { lock = await openFile(lockFile, 'wx', 0o600); await lock.writeFile(JSON.stringify({ pid: process.pid, deviceId: state.id })); await lock.close(); }
  catch { return; }
  const previous = await json(statusFile);
  let server, shuttingDown = false, stateName = 'starting', paired = previous?.deviceId === state.id && Boolean(previous?.paired), currentJob;
  const worker = async (op, data = {}) => {
    const response = await fetch(`${ORIGIN}/api/bridge/worker`, { method: 'POST', headers: { Authorization: `Bearer ${state.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ op, id: state.id, data }), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? '연결 요청 오류');
    return result;
  };
  const shutdown = async () => { if (shuttingDown) return; shuttingDown = true; server?.close(); await unlink(lockFile).catch(() => {}); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
  let heartbeatRunning = false;
  const heartbeat = async () => {
    if (heartbeatRunning || shuttingDown) return;
    heartbeatRunning = true;
    try { await worker('heartbeat', { state: stateName }); paired = true; }
    catch (e) { if (paired && e.message === 'DEVICE_UNAUTHORIZED') { await save(statusFile, { deviceId: state.id, state: 'revoked', paired: false }); await shutdown(); } }
    finally { heartbeatRunning = false; }
    await save(statusFile, { pid: process.pid, deviceId: state.id, state: stateName, paired, updatedAt: new Date().toISOString() });
  };
  const timer = setInterval(() => void heartbeat().catch(() => {}), 10000);
  try {
    const arg = process.argv.indexOf('--codex');
    server = await isolatedCodexServer(arg === -1 ? 'codex' : process.argv[arg+1], join(root,'workspace'));
    for (;;) {
      stateName = await server.accountState(); await heartbeat();
      if (paired && stateName === 'ready') {
        try { currentJob = await worker('next'); }
        catch { await delay(5000); continue; } // Retry the idle poll after a temporary network outage.
        if (currentJob) { try { await runCodexJob(server,currentJob,worker,join(root,'workspace')); } catch {} currentJob = null; }
      }
      await delay(2000);
    }
  } catch {
    stateName = 'error'; await heartbeat().catch(() => {});
    if (currentJob) await worker('fail',{jobId:currentJob.id,error:'Codex 실행 연결이 종료됐습니다.'}).catch(()=>{});
  } finally { clearInterval(timer); server?.close(); await unlink(lockFile).catch(() => {}); }
}
if (compiled || import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  (process.argv.includes('--worker') ? workerLoop() : launch()).catch(error => { console.error(error.message); process.exitCode=1; });
}
