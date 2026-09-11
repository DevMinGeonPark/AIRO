import sharp from 'sharp';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

// The artwork and transparency come from GPT Image. These are size/format
// exports only; retain the generated alpha and never recreate logo geometry.
await mkdir('public/brand', { recursive: true });
await mkdir('assets/brand/previous/before-swift', { recursive: true });
for (const file of ['src/app/icon.svg', 'src/app/favicon.ico', 'src/app/apple-icon.png', 'public/brand/airo-mark.svg']) {
  const name = file.replaceAll('/', '-');
  await copyFile(file, `assets/brand/previous/before-swift/${name}`, 1).catch(error => {
    if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error;
  });
}

const exports = [];
for (const [kind, width, height] of [['mark', 512, 512], ['lockup', 960, undefined]]) {
  const source = `assets/source/airo-swift-${kind}-transparent-gpt.png`;
  const metadata = await sharp(source).metadata();
  if (!metadata.hasAlpha) throw new Error(`${source} must retain generated transparency`);
  const pipeline = sharp(source).trim({ threshold: 10 }).resize({
    width, height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  const name = kind === 'lockup' ? 'airo-logo-swift-gpt' : 'airo-mark-swift-gpt';
  const png = await pipeline.png().toBuffer();
  await writeFile(`public/brand/${name}.png`, png);
  await sharp(png).webp({ lossless: true }).toFile(`public/brand/${name}.webp`);
  const output = await sharp(png).metadata();
  exports.push({ kind, source, width: output.width, height: output.height, alpha: output.hasAlpha });
}

// The favicon uses the same generated alpha mask as the web logo. Its SVG
// defines the approved blue ink and black tile; PNG/ICO are format exports.
const icon = await readFile('public/brand/airo-mark-swift-gpt.png');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><filter id="white"><feColorMatrix type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0"/></filter><mask id="swift" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><image x="32" y="32" width="448" height="448" filter="url(#white)" href="data:image/png;base64,${icon.toString('base64')}"/></mask></defs><rect width="512" height="512" fill="#0A0A0A"/><rect width="512" height="512" fill="#86A5FF" mask="url(#swift)"/></svg>\n`;
await writeFile('src/app/icon.svg', svg);
await writeFile('public/brand/airo-mark.svg', svg);
await sharp(Buffer.from(svg)).resize(180, 180).png().toFile('src/app/apple-icon.png');
const sizes = [16, 32, 48, 64];
const images = await Promise.all(sizes.map(size => sharp(Buffer.from(svg)).resize(size, size).ensureAlpha().png().toBuffer()));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const position = 6 + i * 16;
  header[position] = sizes[i]; header[position + 1] = sizes[i];
  header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(images[i].length, position + 8);
  header.writeUInt32LE(offset, position + 12);
  offset += images[i].length;
}
await writeFile('src/app/favicon.ico', Buffer.concat([header, ...images]));
const record = JSON.parse(await readFile('assets/brand/airo-swift-web-outputs.json', 'utf8'));
await writeFile('assets/brand/airo-swift-web-outputs.json', JSON.stringify({ ...record, exports }, null, 2) + '\n');
console.log(JSON.stringify(exports));
