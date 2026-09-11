import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

// Faithful size/format exports of the GPT Image monochrome master. The original
// stays in assets/source; no replacement paths or hand-drawn logo geometry.
const source = 'assets/source/airo-mark-refined-gpt.png';
const { data: luminance, info } = await sharp(source).resize(512, 512).greyscale().raw().toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < luminance.length; i++) {
  const alpha = Math.round(Math.max(0, Math.min(255, (luminance[i] - 16) * 255 / 224)));
  rgba[i * 4] = alpha ? 213 : 0; rgba[i * 4 + 1] = alpha ? 230 : 0; rgba[i * 4 + 2] = alpha ? 180 : 0;
  rgba[i * 4 + 3] = alpha;
}
await mkdir('public/brand', { recursive: true });
const mark = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
await writeFile('public/brand/airo-mark-refined-gpt.png', mark);
await sharp(mark).webp({ lossless: true }).toFile('public/brand/airo-mark-refined-gpt.webp');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${mark.toString('base64')}"/></svg>\n`;
await writeFile('src/app/icon.svg', svg);
await writeFile('public/brand/airo-mark.svg', svg);
const touchMark = await sharp(mark).resize(152).toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 4, background: '#0A0A0A' } }).composite([{ input: touchMark, left: 14, top: 14 }]).png().toFile('src/app/apple-icon.png');
const sizes = [16, 32, 48, 64];
const images = await Promise.all(sizes.map(size => sharp(mark).resize(size).png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const pos = 6 + i * 16;
  header[pos] = sizes[i]; header[pos + 1] = sizes[i];
  header.writeUInt16LE(1, pos + 4); header.writeUInt16LE(32, pos + 6);
  header.writeUInt32LE(images[i].length, pos + 8); header.writeUInt32LE(offset, pos + 12);
  offset += images[i].length;
}
await writeFile('src/app/favicon.ico', Buffer.concat([header, ...images]));
console.log('Refined GPT Image logo exported for the web, favicon and touch icon.');
