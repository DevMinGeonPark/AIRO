import sharp from "sharp";
import { readFile, mkdir, stat } from "node:fs/promises";
const assets = JSON.parse(await readFile(new URL("../assets/imagegen-manifest.json", import.meta.url), "utf8"));
await mkdir(new URL("../public/gen/", import.meta.url), { recursive: true });
for (const asset of assets) {
  const source = new URL("../" + asset.source, import.meta.url);
  const output = new URL("../" + asset.output, import.meta.url);
  const width = asset.file.startsWith("day") ? 960 : asset.file === "feature-prep" ? 1000 : 1920;
  const pipeline = sharp(source.pathname);
  if (asset.file === "og-image") pipeline.resize(1200, 630, { fit: "cover" });
  else pipeline.resize({ width, withoutEnlargement: true });
  await pipeline.webp({ quality: asset.file === "hero-bg" ? 72 : 82, effort: 6 }).toFile(output.pathname);
  // JPEG maximizes social crawler compatibility; the same artwork remains available as WebP.
  if (asset.file === "og-image") await sharp(source.pathname).resize(1200, 630, { fit: "cover" }).jpeg({ quality: 86 }).toFile(new URL("../public/gen/og-image.jpg", import.meta.url).pathname);
  console.log(asset.output + ": " + Math.round((await stat(output)).size / 1024) + " KB");
}

