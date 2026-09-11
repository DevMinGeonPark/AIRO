// Export data, never credentials. Source files and documents remain untouched.
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";

const source = resolve(process.env.PERSONAL_SOURCE ?? "../AIRO");
const output = resolve(process.env.EXPORT_DIR ?? ".private/exports");
await mkdir(output, { recursive: true, mode: 0o700 });
const read = (name) => readFile(join(source, "src/lib", name), "utf8");
const json = async (name) => JSON.parse(await read(name));
const evaluate = async (sourceText) => {
  const code = ts.transpileModule(sourceText, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
};
const tripSource = await read("trip.ts");
const budgetSource = await read("budget.ts");
const { trip } = await evaluate(tripSource.replace('import routesJson from "./routes.json";', "const routesJson = {};"));
const budget = await evaluate(budgetSource);
const budgetData = Object.fromEntries(Object.entries(budget).filter(([, value]) => typeof value !== "function"));
const dates = Object.fromEntries(trip.stops.map((s) => [s.day, s.date]));
budgetData.totalsByTier = Object.fromEntries(budget.TIERS.map(({ key }) => [key, budget.totals(key)]));
budgetData.daysByTier = Object.fromEntries(budget.TIERS.map(({ key }) => [key, budget.byDayBudget(key, dates)]));
const documents = [];
for (const name of (await readdir(dirname(source))).filter((name) => name.endsWith(".pdf")).sort()) {
  const bytes = await readFile(join(dirname(source), name));
  documents.push({ name, mime: "application/pdf", base64: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex") });
}
const exportTime = new Date().toISOString();
const positions = new Map();
const archive = {
  format: "airo-trip", version: 1, source_key: `personal:${trip.id}`, exported_at: exportTime,
  trip: { title: trip.title, start_date: "2026-09-19" },
  stops: trip.stops.map(({ id, mapQuery, ...stop }) => {
    const position = positions.get(stop.day) ?? 0; positions.set(stop.day, position + 1);
    return { ...stop, source_id: id, map_query: mapQuery ?? null, position };
  }), messages: [],
  data: { originalTrip: trip, budget: budgetData, food: await json("food.json"), photos: await json("photos.json"), routes: await json("routes.json"), documents, savedPlaceIds: [], sourceFiles: { "trip.ts": tripSource, "budget.ts": budgetSource } },
};
await writeFile(join(output, "personal-trip.json"), JSON.stringify(archive), { flag: "wx", mode: 0o600 });
// The existing deployment's demo trips/messages are exported separately so none disappear.
let demo;
try { demo = JSON.parse(await readFile(".demo-db.json", "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
for (const t of demo?.trips ?? []) {
  const value = { format: "airo-trip", version: 1, source_key: `demo:${t.id}`, exported_at: exportTime,
    trip: { title: t.title, start_date: t.start_date, created_at: t.created_at },
    stops: demo.stops.filter((s) => s.trip_id === t.id).map(({ id, trip_id: _tripId, ...s }) => { void _tripId; return { ...s, source_id: id }; }),
    messages: demo.messages.filter((m) => m.trip_id === t.id).map(({ role, content, created_at }) => ({ role, content, created_at })),
    data: { food: [], photos: {}, routes: {}, documents: [], savedPlaceIds: [], legacyUsage: (demo.usage ?? []).filter((u) => u.trip_id === t.id) },
  };
  await writeFile(join(output, `demo-${t.id}.json`), JSON.stringify(value), { flag: "wx", mode: 0o600 });
}
console.log(JSON.stringify({ output, stops: archive.stops.length, food: archive.data.food.length, routes: Object.keys(archive.data.routes).length, photos: Object.keys(archive.data.photos).length, documents: documents.length, demoTrips: demo?.trips.length ?? 0 }, null, 2));
