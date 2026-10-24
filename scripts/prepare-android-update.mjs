#!/usr/bin/env node
// Stage verified APKs first, then atomically replace discovery metadata last.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  output: { type: "string", default: join(root, "public/downloads") },
  notes: { type: "string" },
} });
if (!values.notes) throw new Error("Pass --notes PATH to a JSON array of release note strings.");
const notes = JSON.parse(await readFile(values.notes, "utf8"));
if (!Array.isArray(notes) || !notes.length || notes.length > 20 || notes.some(note => typeof note !== "string" || note.length > 500)) throw new Error("Invalid release notes");
const sdk = process.env.ANDROID_HOME || join(process.env.HOME, "Library/Android/sdk");
const buildTools = join(sdk, "build-tools/35.0.0");
const output = resolve(values.output);
const expectedCertificate = "bd90e7e94bb3dd54227270bff041c70dbeca6252d1ca579999f256155db50ed3";
let previous;
try { previous = JSON.parse(await readFile(join(output, "airo-android-latest.json"), "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const prepared = [];
for (const flavor of ["cloud", "demo"]) {
  const source = join(root, `android/app/build/outputs/apk/${flavor}/debug/app-${flavor}-debug.apk`);
  const badging = execFileSync(join(buildTools, "aapt"), ["dump", "badging", source], { encoding: "utf8" });
  const match = /^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m.exec(badging);
  const minSdk = Number(/^sdkVersion:'(\d+)'/m.exec(badging)?.[1]);
  if (!match || minSdk !== 26) throw new Error(`Invalid ${flavor} APK metadata`);
  const [, applicationId, code, version] = match;
  const baseVersion = version.replace(/-demo$/, "");
  if (applicationId !== `com.heptivision.airo${flavor === "demo" ? ".demo" : ""}` || !/^\d+\.\d+\.\d+$/.test(baseVersion) || version !== baseVersion + (flavor === "demo" ? "-demo" : "")) throw new Error("Wrong application or version");
  const signing = execFileSync(join(buildTools, "apksigner"), ["verify", "--verbose", "--print-certs", source], { encoding: "utf8" });
  const certificate = /Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/.exec(signing)?.[1];
  if (certificate !== expectedCertificate) throw new Error("Certificate changed; this development channel must keep the existing certificate.");
  execFileSync(join(buildTools, "zipalign"), ["-c", "-P", "16", "4", source]);
  const data = await readFile(source);
  if (data.length > 200 * 1024 * 1024) throw new Error("APK exceeds updater limit");
  const artifact = { flavor, buildType: "debug", applicationId, version, versionCode: Number(code), minSdk,
    file: `airo-android-${flavor}-${baseVersion}.apk`, bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"), signingCertificateSha256: certificate };
  const old = previous?.artifacts.find(item => item.flavor === flavor);
  if (old && (old.versionCode > artifact.versionCode || old.versionCode === artifact.versionCode && old.sha256 !== artifact.sha256)) throw new Error("Version code must increase for changed APKs; refusing downgrade/replacement.");
  prepared.push({ artifact, data, baseVersion });
}
if (prepared[0].baseVersion !== prepared[1].baseVersion || prepared[0].artifact.versionCode !== prepared[1].artifact.versionCode) throw new Error("Cloud and demo versions differ");
await mkdir(output, { recursive: true });
async function atomic(name, data) {
  const temporary = join(output, `.${name}.${process.pid}.tmp`);
  await writeFile(temporary, data);
  await rename(temporary, join(output, name));
}
for (const { artifact, data } of prepared) {
  try {
    await stat(join(output, artifact.file));
    const old = await readFile(join(output, artifact.file));
    if (createHash("sha256").update(old).digest("hex") !== artifact.sha256) throw new Error(`Refusing to overwrite published ${artifact.file}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await atomic(artifact.file, data);
  }
}
const manifest = {
  schemaVersion: 1,
  releasedAt: previous?.artifacts[0]?.versionCode === prepared[0].artifact.versionCode ? previous.releasedAt : new Date().toISOString(),
  signing: "Android development certificate; not a store release",
  releaseNotes: notes,
  artifacts: prepared.map(item => item.artifact),
};
const json = JSON.stringify(manifest, null, 2) + "\n";
await atomic(`airo-android-${prepared[0].baseVersion}.json`, json);
await atomic("airo-android-latest.json", json);
console.log(JSON.stringify({ output, ...manifest }, null, 2));
