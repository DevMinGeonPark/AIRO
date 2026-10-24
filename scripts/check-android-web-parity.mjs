#!/usr/bin/env node
// Read-only gate: a web UI change needs a native comparison before the next Android release.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const baseline = JSON.parse(await readFile(new URL('android/web-ui-reference.json', root), 'utf8'));
const changed = [];
for (const [path, expected] of Object.entries(baseline.sources)) {
  const actual = await readFile(new URL(path, root)).then(bytes => createHash('sha256').update(bytes).digest('hex')).catch(() => 'missing');
  if (actual !== expected) changed.push(path);
}
if (changed.length) {
  console.error(`Web UI changed since Android ${baseline.androidVersion} (${baseline.reviewedAt}). Review native behavior before updating this baseline:\n${changed.map(path => `- ${path}`).join('\n')}`);
  console.error(`Comparison record: ${fileURLToPath(new URL('docs/ops/ANDROID_WEB_PARITY.md', root))}`);
  process.exitCode = 1;
} else console.log(`Web reference matches Android ${baseline.androidVersion}: ${Object.keys(baseline.sources).length} reviewed sources.`);
