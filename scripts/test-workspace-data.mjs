import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
globalThis.fetch = async () => { throw new Error("Workspace tests must not contact live services"); };
const { playbackLegs, measurePath, pointOnPath } = await import("../src/lib/trip-playback.ts");
const { emptyExpenseBudget, expenseBudgetSchema, expenseTotals } = await import("../src/lib/expense-budget.ts");
const { archiveDataSchema } = await import("../src/lib/archive.ts");
const path = [[0, 0], [.001, 0], [.01, 0], [.01, .01]];
const lengths = measurePath(path);
assert.ok(Math.abs(pointOnPath(path, lengths, .25).position[0] - .005) < .00001, "distance weighted, not vertex weighted");
assert.deepEqual(pointOnPath(path, lengths, 0).position, path[0]);
assert.deepEqual(pointOnPath(path, lengths, 1).position, path.at(-1));
for (let step = 0; step <= 100; step++) {
  const [x, y] = pointOnPath(path, lengths, step / 100).position;
  assert.ok(y === 0 || Math.abs(x - .01) < 1e-12, "moving point stays on the L-shaped road");
}
assert.deepEqual(pointOnPath([[1, 1], [1, 1]], [0, 0], .7).position, [1, 1]);
const stops = [{ id: "A", lng: 0, lat: 0 }, { id: "B", lng: .01, lat: .01 }, { id: "C", lng: 1, lat: 1, mode: "flight" }];
assert.equal(playbackLegs(stops, []).missing, 1, "missing road is not replaced by a straight line");
const plan = playbackLegs(stops, [{ id: "A->B", coordinates: path }]);
assert.equal(plan.missing, 0); assert.equal(plan.legs.length, 2);
assert.deepEqual(plan.legs[0].path, path);
assert.deepEqual(plan.legs[1].path[0], [.01, .01]); assert.deepEqual(plan.legs[1].path.at(-1), [1, 1]);

const expense = { id: "00000000-0000-4000-8000-000000000050", name: "숙소", category: "stay", day: 1, amount: 120, currency: "EUR", exchangeRate: 1500, paid: true };
const budget = { ...emptyExpenseBudget(), reserve: 20000, entries: [expense] };
assert.deepEqual(expenseTotals(budget), { paid: 180000, planned: 0, total: 200000 });
assert.equal(expenseBudgetSchema.safeParse({ ...budget, entries: [expense, expense] }).success, false);
assert.equal(expenseBudgetSchema.safeParse({ ...budget, entries: [{ ...expense, currency: "KRW" }] }).success, false);
assert.equal(archiveDataSchema.safeParse({ expenseBudget: { broken: true } }).success, false);
assert.deepEqual(archiveDataSchema.parse(JSON.parse(JSON.stringify({ expenseBudget: budget }))).expenseBudget, budget, "budget export/import is lossless");

const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_auth_admin;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,supabase_auth_admin;
    grant execute on function auth.uid(),auth.jwt() to authenticated,anon;
    alter default privileges in schema public grant all on tables to authenticated;`);
  for (const file of readdirSync("supabase/migrations").filter(file => file.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8").replace('create extension if not exists "pgcrypto";', ""));
  }
  const owner = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into auth.users(id,email) values($1,'owner@fixture.test'),($2,'other@fixture.test')", [owner, other]);
  async function asUser(sub) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub, role: "authenticated" })]);
    await db.exec("set role authenticated");
  }
  const call = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.result;
  await asUser(owner);
  const { trip } = await call("select public.create_trip_once($1,null,$2) result", ["상용 기능 검증", "workspace-create"]);
  const save = (input, revision = input.revision) => call("select public.update_trip_budget($1,$2,$3) result", [trip.id, JSON.stringify(input), revision]);
  const place = { id: "osm:node:42", name: "광장 카페", lat: 41.89, lng: 12.49, day: 1, stopId: "", kind: "cafe", cuisine: "cafe", addr: "Fixture road", website: null };
  const bookmark = input => call("select public.save_trip_place($1,$2) result", [trip.id, JSON.stringify(input)]);
  const archive = () => call("select data result from public.trip_archives where trip_id=$1", [trip.id]);
  const preserved = { photos: { A: { image: "https://fixture.test/photo.jpg" } }, routes: {}, documents: [], originalTrip: { untouched: true } };
  await db.query("insert into public.trip_archives(trip_id,data) values($1,$2)", [trip.id, JSON.stringify(preserved)]);
  const first = await save(budget); assert.equal(first.revision, 1);
  await assert.rejects(save({ ...budget, reserve: 1 }), error => error.code === "40001", "stale tab cannot overwrite budget");
  await bookmark(place); await bookmark(place);
  assert.equal((await archive()).food.length, 1, "bookmark retry is idempotent");
  assert.equal((await db.query("select * from public.saved_places where trip_id=$1", [trip.id])).rows.length, 1);
  const second = await save({ ...first, entries: [{ ...expense, paid: false }] });
  assert.equal(second.revision, 2); assert.deepEqual((await archive()).food, [place]);
  for (const [key, value] of Object.entries(preserved)) assert.deepEqual((await archive())[key], value, `preserves ${key}`);
  for (const invalid of [
    { ...second, entries: [expense, expense] },
    { ...second, entries: [{ ...expense, amount: -1 }] },
    { ...second, entries: [{ ...expense, day: 1.5 }] },
    { ...second, entries: [{ ...expense, currency: "KRW" }] },
    { ...second, entries: [{ ...expense, exchangeRate: 0 }] },
    { ...second, entries: [{ ...expense, amount: 1e12 }] },
    { ...second, entries: [{ ...expense, paid: "yes" }] },
  ]) await assert.rejects(save(invalid), error => error.code === "22023");
  await assert.rejects(bookmark({ ...place, lat: 91 }), error => error.code === "22023");
  assert.equal((await archive()).expenseBudget.revision, 2, "failed saves roll back");
  await asUser(other);
  assert.equal(await archive(), undefined, "other account cannot read archive");
  await assert.rejects(save(second), error => error.code === "42501");
  await assert.rejects(bookmark(place), error => error.code === "42501");
  await db.exec("reset role; set role anon");
  await assert.rejects(save(second), error => error.code === "42501");
  await assert.rejects(bookmark(place), error => error.code === "42501");
  await asUser(owner);
  const fresh = await call("select public.create_trip_once($1,null,$2) result", ["자료 없는 새 여행", "workspace-empty"]);
  const initial = await call("select public.update_trip_budget($1,$2,0) result", [fresh.trip.id, JSON.stringify(emptyExpenseBudget())]);
  assert.equal(initial.revision, 1, "new trip needs no imported archive");
  console.log("Workspace data: roads/flight playback, expense conversion, import validation, account isolation, CAS, bookmark retries, archive preservation and new-trip budgets passed (local PostgreSQL).");
} finally { await db.close(); }
