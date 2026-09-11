import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && context.parentURL?.includes("/src/")) return next(`${specifier}.ts`, context);
    throw error;
  }
} });
const { parseArchive, archiveSchema, importArchiveSchema, importSavedSchema } = await import("../src/lib/archive.ts");
import { safeNext } from "../src/lib/auth-redirect.ts";
for (const file of readdirSync(".private/exports").filter((name) => name.endsWith(".json"))) {
  const original = JSON.parse(readFileSync(`.private/exports/${file}`, "utf8"));
  const archive = parseArchive(original);
  assert.equal(archive.format, "airo-trip");
  const previous = { ...original, format: "legacy-trip" };
  assert.deepEqual(importArchiveSchema.parse(previous), archive, "Earlier exports normalize without losing data");
  assert.equal(archiveSchema.safeParse(previous).success, false, "Only imports accept previous formats");
  assert.equal(importArchiveSchema.safeParse({ ...previous, version: 2 }).success, false);
  assert.equal(importArchiveSchema.safeParse({ ...previous, stops: [{ ...previous.stops[0], lat: 91 }] }).success, false);
  assert.equal(archive.stops.length, original.stops.length);
  assert.deepEqual(archive.data, original.data);
  for (const doc of archive.data.documents) assert.equal(createHash("sha256").update(Buffer.from(doc.base64, "base64")).digest("hex"), doc.sha256);
  assert.equal(archiveSchema.safeParse({ ...original, stops: [...original.stops, original.stops[0]] }).success, false);
  assert.equal(archiveSchema.safeParse({ ...original, stops: [{ ...original.stops[0], day: -1 }] }).success, false);
  assert.equal(archiveSchema.safeParse({ ...original, stops: [{ ...original.stops[0], lat: 91 }] }).success, false);
}
for (const format of ["airo-saved", "legacy-saved", "AIRO-saved"]) {
  assert.deepEqual(importSavedSchema.parse({ format, version: 1, ids: ["place-a"] }), { format: "airo-saved", version: 1, ids: ["place-a"] });
  assert.equal(importSavedSchema.safeParse({ format, version: 1, ids: [1] }).success, false);
}
assert.equal(importSavedSchema.safeParse({ format: "unknown", version: 1, ids: [] }).success, false);
for (const url of ["https://evil.example/app", "//evil.example/app", "/\\evil.example", "javascript:alert(1)", "/app/\n/evil", "/app/../../elsewhere"]) assert.equal(safeNext(url), "/app");
assert.equal(safeNext("/app/settings/import?from=personal"), "/app/settings/import?from=personal");
console.log("archive ok: all export fields, PDF checksums, invalid data, redirect confinement");
