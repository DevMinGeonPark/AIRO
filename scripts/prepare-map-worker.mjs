import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, readFile } from 'node:fs/promises';

// MapLibre 6's module worker imports its shared sibling. Serve both locally,
// pinned to the installed package so private previews never depend on a CDN.
const dist = dirname(fileURLToPath(import.meta.resolve('maplibre-gl')));
const { version } = JSON.parse(await readFile(join(dist, '..', 'package.json'), 'utf8'));
const destination = new URL(`../public/vendor/maplibre/${version}/`, import.meta.url);
await mkdir(destination, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  await copyFile(join(dist, file), new URL(file, destination));
}
await copyFile(join(dist, '..', 'LICENSE.txt'), new URL('LICENSE.txt', destination));
console.log(`MapLibre ${version}: local module worker ready.`);
