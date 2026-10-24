import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile, cp, mkdir, readFile } from "node:fs/promises";

// Serve the worker, CJK maps and fallback fonts from this app. PDF bytes never
// go to a renderer service or third-party CDN.
const root = dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const destination = new URL(`../public/vendor/pdfjs/${version}/`, import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(join(root, "legacy/build/pdf.worker.min.mjs"), new URL("pdf.worker.min.mjs", destination));
await copyFile(join(root, "LICENSE"), new URL("LICENSE", destination));
for (const folder of ["cmaps", "standard_fonts", "wasm"]) await cp(join(root, folder), new URL(folder, destination), { recursive: true });
console.log(`PDF.js ${version}: local preview assets ready.`);
