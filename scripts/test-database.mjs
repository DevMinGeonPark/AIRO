import { readFileSync, readdirSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const container = "airo-migration-test";
const args = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "airo_test", "-v", "ON_ERROR_STOP=1", "-At"];
function sql(input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr); return result.stdout;
}
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const as = (id, query) => `set role authenticated; set request.jwt.claim.sub = '${id}'; ${query}`;
const check = (condition, message) => `do $$ begin if not (${condition}) then raise exception '${message}'; end if; end $$;`;
sql(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
`);
for (const migration of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) sql(readFileSync(`supabase/migrations/${migration}`, "utf8"));
sql(`insert into auth.users(id,email) values('${owner}','owner@example.test'),('${other}','other@example.test');`);
const fixture = JSON.parse(readFileSync(".private/exports/personal-trip.json", "utf8"));
const payload = quote(JSON.stringify(fixture));
const first = sql(as(owner, `select public.import_trip(${payload}::jsonb);`)).trim().split("\n").at(-1);
const imported = JSON.parse(first);
assert.equal(imported.imported, true);
const trip = imported.tripId;
sql(as(owner, `
${check(`(select count(*) from public.stops where trip_id='${trip}') = ${fixture.stops.length}`, "Stop count changed")}
${check(`(select count(*) from public.stops where trip_id='${trip}' and day=0) = 4`, "Day zero lost")}
${check(`(select data from public.trip_archives where trip_id='${trip}') = ${quote(JSON.stringify(fixture.data))}::jsonb`, "Archive data changed")}
update public.stops set note='edited after import' where trip_id='${trip}' and source_id='d0-1';
select public.import_trip(${payload}::jsonb);
${check(`(select count(*) from public.trips) = 1`, "Duplicate trip")}
${check(`(select note from public.stops where trip_id='${trip}' and source_id='d0-1') = 'edited after import'`, "Reimport overwrote edits")}
insert into public.saved_places(trip_id,place_id) values('${trip}', 'saved-test') on conflict do nothing;
insert into public.saved_places(trip_id,place_id) values('${trip}', 'saved-test') on conflict do nothing;
${check(`(select count(*) from public.saved_places) = 1`, "Duplicate bookmark")}
`));
sql(as(other, `
${check(`(select count(*) from public.trips) = 0`, "Other account can see trip")}
${check(`(select count(*) from public.stops) = 0`, "Other account can see stops")}
${check(`(select count(*) from public.trip_archives) = 0`, "Other account can see archive")}
${check(`(select count(*) from public.saved_places) = 0`, "Other account can see bookmarks")}
delete from public.trips where id='${trip}';
do $$ begin
  insert into public.saved_places(trip_id,place_id) values('${trip}','intruder');
  raise exception 'Cross-account bookmark write succeeded';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.trip_archives(trip_id,data) values('${trip}','{}');
  raise exception 'Cross-account archive write succeeded';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.reorder_stops('${trip}',0,array[]::uuid[]);
  raise exception 'Cross-account reorder succeeded';
exception when insufficient_privilege then null; end $$;
`));
sql(`set role anon; do $$ begin perform public.import_trip(${payload}::jsonb); raise exception 'Anonymous import succeeded'; exception when insufficient_privilege then null; end $$;`);
const broken = { ...fixture, source_key: "test:broken", stops: [...fixture.stops.slice(0, 2), { ...fixture.stops[2], lat: 200 }] };
sql(as(owner, `do $$ begin perform public.import_trip(${quote(JSON.stringify(broken))}::jsonb); raise exception 'Invalid import succeeded'; exception when check_violation then null; end $$;
${check(`(select count(*) from public.trips) = 1`, "Failed import left a trip")}
${check(`(select count(*) from public.stops) = ${fixture.stops.length}`, "Failed import left stops")}
${check(`exists(select 1 from public.trips where id='${trip}')`, "Other user deleted owner trip")}
insert into public.trips(user_id,title) values('${owner}','Second trip');`));

const concurrent = (title) => new Promise((resolve) => {
  const process = spawn("docker", args); let stderr = "";
  process.stderr.on("data", (chunk) => { stderr += chunk; }); process.stdout.resume();
  process.on("close", (code) => resolve({ code, stderr }));
  process.stdin.end(as(owner, `insert into public.trips(user_id,title) values('${owner}',${quote(title)});`));
});
const attempts = await Promise.all([concurrent("Concurrent A"), concurrent("Concurrent B")]);
assert.equal(attempts.filter((r) => r.code === 0).length, 1, "Concurrent creation must respect quota");
assert.match(attempts.find((r) => r.code !== 0).stderr, /무료 플랜/);
sql(as(owner, check("(select count(*) from public.trips) = 3", "Trip quota exceeded")));
sql(as(owner, `do $$ begin
  for i in 1..30 loop if not public.consume_chat_request('${trip}') then raise exception 'Quota ended early'; end if; end loop;
  if public.consume_chat_request('${trip}') then raise exception 'Quota was not enforced'; end if;
end $$;`));
console.log("database ok: full archive equality, day 0, idempotency, account isolation, anonymous denial, rollback, bookmarks, concurrent quota");
