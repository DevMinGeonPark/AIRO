-- A paired device can only consume web-requested jobs and return text/tool requests.
-- Actual itinerary tools run in the signed-in browser user's server request.
create table public.ai_devices (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null, name text not null check(length(name) between 1 and 80),
  state text not null default 'starting' check(state in ('starting','ready','login_required','api_account','error')),
  seen_at timestamptz, created_at timestamptz not null default now(), revoked_at timestamptz
);
create table public.ai_jobs (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.ai_devices(id), trip_id uuid not null references public.trips(id) on delete cascade,
  state text not null default 'queued' check(state in ('queued','running','completed','failed','cancelled')),
  payload jsonb not null, output text not null default '', error text,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes'
);
create unique index ai_one_active_trip on public.ai_jobs(trip_id) where state in ('queued','running');
create unique index ai_one_active_device on public.ai_jobs(device_id) where state in ('queued','running');
create table public.ai_calls (
  id uuid primary key default gen_random_uuid(), job_id uuid not null references public.ai_jobs(id) on delete cascade,
  call_key text not null, tool text not null, arguments jsonb not null,
  state text not null default 'pending' check(state in ('pending','executing','done')),
  result jsonb, started_at timestamptz, created_at timestamptz not null default now(), unique(job_id,call_key)
);
alter table public.ai_devices enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_calls enable row level security;
revoke all on public.ai_devices,public.ai_jobs,public.ai_calls from public,anon,authenticated;

create function public.ai_bridge(p_op text,p_id uuid default null,p_key text default null,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare who uuid:=auth.uid(); device public.ai_devices%rowtype; job public.ai_jobs%rowtype; call public.ai_calls%rowtype; out_data jsonb;
begin
  if octet_length(p_data::text)>131072 then raise exception '요청이 너무 큽니다.'; end if;
  if p_op like 'worker_%' then
    if p_key is null or p_key !~ '^[a-f0-9]{64}$' then raise exception 'DEVICE_UNAUTHORIZED'; end if;
    select * into device from public.ai_devices where id=p_id and revoked_at is null
      and key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex') for update;
    if not found then raise exception 'DEVICE_UNAUTHORIZED'; end if;
    if p_op='worker_heartbeat' then
      if coalesce(p_data->>'state','') not in ('starting','ready','login_required','api_account','error') then raise exception 'Invalid device state'; end if;
      update public.ai_devices set seen_at=now(),state=p_data->>'state' where id=device.id;
      update public.ai_jobs set state='failed',error='연결이 중단됐습니다. 변경된 일정을 확인한 후 다시 보내 주세요.'
        where device_id=device.id and state in ('queued','running') and expires_at<now();
      return jsonb_build_object('ok',true);
    end if;
    if p_op='worker_next' then
      if device.state<>'ready' then return null; end if;
      select * into job from public.ai_jobs where device_id=device.id and state='queued' and expires_at>now() order by created_at limit 1 for update skip locked;
      if not found then return null; end if;
      update public.ai_jobs set state='running' where id=job.id;
      return jsonb_build_object('id',job.id,'payload',job.payload);
    end if;
    select * into job from public.ai_jobs where id=(p_data->>'jobId')::uuid and device_id=device.id and state='running' and expires_at>now() for update;
    if not found then raise exception 'JOB_STOPPED'; end if;
    if p_op='worker_progress' then
      if length(coalesce(p_data->>'text',''))>32000 then raise exception '답변이 너무 깁니다.'; end if;
      update public.ai_jobs set output=p_data->>'text' where id=job.id;
      return jsonb_build_object('ok',true);
    elsif p_op='worker_call' then
      if length(coalesce(p_data->>'callKey','')) not between 1 and 200 or length(coalesce(p_data->>'tool','')) not between 1 and 60
        or coalesce(jsonb_typeof(p_data->'arguments'),'')<>'object' or octet_length((p_data->'arguments')::text)>16384 then raise exception 'Invalid tool request'; end if;
      if (select count(*) from public.ai_calls where job_id=job.id)>40 then raise exception '도구 실행 한도를 넘었습니다.'; end if;
      insert into public.ai_calls(job_id,call_key,tool,arguments) values(job.id,p_data->>'callKey',p_data->>'tool',p_data->'arguments') on conflict(job_id,call_key) do nothing;
      select * into call from public.ai_calls where job_id=job.id and call_key=p_data->>'callKey';
      if call.tool is distinct from p_data->>'tool' or call.arguments is distinct from p_data->'arguments' then raise exception 'Tool replay mismatch'; end if;
      if call.state='executing' and call.started_at<now()-interval '90 seconds' then
        update public.ai_calls set state='done',result='{"success":false,"error":"실행 결과를 확인하지 못했습니다. 일정을 확인하고 다시 요청하세요."}' where id=call.id returning * into call;
      end if;
      return jsonb_build_object('state',call.state,'result',call.result);
    elsif p_op in ('worker_complete','worker_fail') then
      if p_op='worker_complete' and exists(select 1 from public.ai_calls where job_id=job.id and state<>'done') then raise exception 'Tools still pending'; end if;
      update public.ai_jobs set state=case when p_op='worker_complete' then 'completed' else 'failed' end,
        error=case when p_op='worker_fail' then left(coalesce(p_data->>'error','Codex 실행을 완료하지 못했습니다.'),500) else null end where id=job.id;
      if length(job.output)>0 then insert into public.messages(trip_id,role,content) values(job.trip_id,'assistant',job.output); end if;
      return jsonb_build_object('ok',true);
    end if;
    raise exception 'Unknown worker operation';
  end if;
  -- Only an interactive AIRO login may pair devices, enqueue jobs or execute tools.
  if who is null or coalesce(auth.jwt()->>'client_id','')<>'' or coalesce(auth.jwt()->>'airo_key_id','')<>'' then raise exception '로그인이 필요합니다.'; end if;
  if p_op='devices' then
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'state',state,'seenAt',seen_at,'revokedAt',revoked_at) order by created_at desc),'[]') into out_data from public.ai_devices where user_id=who;
    return out_data;
  elsif p_op='pair' then
    if p_key is null or p_key !~ '^[a-f0-9]{64}$' or length(coalesce(p_data->>'name','')) not between 1 and 80 then raise exception '유효하지 않은 연결입니다.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(who::text,91));
    select * into device from public.ai_devices where id=p_id;
    if found then
      if device.user_id<>who or device.key_hash<>encode(sha256(convert_to(p_key,'UTF8')),'hex') or device.revoked_at is not null then raise exception '새 연결을 시작해 주세요.'; end if;
    else
      if (select count(*) from public.ai_devices where user_id=who and revoked_at is null)>=5 then raise exception '기존 연결을 해제한 후 다시 연결해 주세요.'; end if;
      insert into public.ai_devices(id,user_id,key_hash,name) values(p_id,who,encode(sha256(convert_to(p_key,'UTF8')),'hex'),p_data->>'name');
    end if;
    return jsonb_build_object('ok',true);
  elsif p_op='revoke' then
    update public.ai_devices set revoked_at=now() where id=p_id and user_id=who;
    update public.ai_jobs set state='cancelled',error='Codex 연결이 해제됐습니다.' where device_id=p_id and user_id=who and state in ('queued','running');
    return jsonb_build_object('ok',true);
  elsif p_op='enqueue' then
    select * into job from public.ai_jobs where id=p_id;
    if found then
      if job.user_id<>who or job.trip_id::text is distinct from p_data->>'tripId' or job.device_id::text is distinct from p_data->>'deviceId'
        or job.payload->>'message' is distinct from p_data->'payload'->>'message' then raise exception '요청이 일치하지 않습니다.'; end if;
      return jsonb_build_object('id',job.id);
    end if;
    if not exists(select 1 from public.trips where id=(p_data->>'tripId')::uuid and user_id=who) then raise exception '여행을 찾을 수 없습니다.'; end if;
    select * into device from public.ai_devices where id=(p_data->>'deviceId')::uuid and user_id=who and revoked_at is null for update;
    if not found or device.state<>'ready' or device.seen_at is null or device.seen_at<now()-interval '30 seconds' then raise exception 'Codex가 연결되어 있지 않습니다.'; end if;
    update public.ai_jobs set state='failed',error='응답 대기 시간이 지났습니다. 일정을 확인한 후 다시 보내 주세요.' where user_id=who and state in ('queued','running') and expires_at<now();
    if exists(select 1 from public.ai_jobs where (device_id=device.id or trip_id=(p_data->>'tripId')::uuid) and state in ('queued','running')) then raise exception '진행 중인 대화를 먼저 마쳐 주세요.'; end if;
    if length(coalesce(p_data->'payload'->>'message','')) not between 1 and 600 then raise exception '메시지는 600자까지 입력해 주세요.'; end if;
    if not public.consume_chat_request((p_data->>'tripId')::uuid) then raise exception '시간당 대화 한도에 도달했습니다.'; end if;
    insert into public.ai_jobs(id,user_id,device_id,trip_id,payload) values(p_id,who,device.id,(p_data->>'tripId')::uuid,p_data->'payload');
    insert into public.messages(trip_id,role,content) values((p_data->>'tripId')::uuid,'user',p_data->'payload'->>'message');
    return jsonb_build_object('id',p_id);
  end if;
  select * into job from public.ai_jobs where id=p_id and user_id=who for update;
  if not found then raise exception '대화를 찾을 수 없습니다.'; end if;
  if job.state in ('queued','running') and job.expires_at<now() then
    update public.ai_jobs set state='failed',error='응답 대기 시간이 지났습니다. 일정을 확인한 후 다시 보내 주세요.' where id=job.id returning * into job;
  end if;
  if job.state in ('queued','running') and not exists(select 1 from public.ai_devices where id=job.device_id and revoked_at is null and seen_at>now()-interval '45 seconds') then
    update public.ai_jobs set state='failed',error='Codex 연결이 끊겼습니다. 변경된 일정을 확인하고 다시 연결해 주세요.' where id=job.id returning * into job;
  end if;
  if p_op='status' then
    return jsonb_build_object('id',job.id,'state',job.state,'output',job.output,'error',job.error,
      'pending',exists(select 1 from public.ai_calls where job_id=job.id and state='pending'));
  elsif p_op='cancel' then
    update public.ai_jobs set state='cancelled',error='대화를 중지했습니다. 이미 반영된 일정은 유지됩니다.' where id=job.id and state in ('queued','running');
    return jsonb_build_object('ok',true);
  elsif p_op='take_call' then
    if job.state<>'running' or not exists(select 1 from public.ai_devices where id=job.device_id and revoked_at is null) then return null; end if;
    select * into call from public.ai_calls where job_id=job.id and state='pending' order by created_at limit 1 for update skip locked;
    if not found then return null; end if;
    update public.ai_calls set state='executing',started_at=now() where id=call.id;
    return jsonb_build_object('id',call.id,'tripId',job.trip_id,'tool',call.tool,'arguments',call.arguments);
  elsif p_op='finish_call' then
    update public.ai_calls set state='done',result=p_data->'result' where id=(p_data->>'callId')::uuid and job_id=job.id and state='executing';
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown operation';
end $$;
revoke all on function public.ai_bridge(text,uuid,text,jsonb) from public;
grant execute on function public.ai_bridge(text,uuid,text,jsonb) to anon,authenticated;
