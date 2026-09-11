import assert from 'node:assert/strict';
import { readSavedPlaces, SAVED_KEY } from '../../AIRO/src/lib/saved-places.ts';

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite) throw new Error('Storage quota'); this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}
const previous = 'previous.saved.v1';
const store = new MemoryStorage({ [SAVED_KEY]: '["current","shared"]', [previous]: '["shared","earlier"]', 'app.preference': 'keep' });
assert.deepEqual(readSavedPlaces(store), ['current', 'shared', 'earlier']);
assert.equal(store.getItem(previous), null);
assert.equal(store.getItem('app.preference'), 'keep');
assert.deepEqual(JSON.parse(store.getItem(SAVED_KEY)), ['current', 'shared', 'earlier']);
assert.deepEqual(readSavedPlaces(store), ['current', 'shared', 'earlier']);
const full = new MemoryStorage({ [previous]: '["saved"]' });
full.failWrite = true;
assert.deepEqual(readSavedPlaces(full), ['saved']);
assert.equal(full.getItem(previous), '["saved"]');
assert.equal(full.getItem(SAVED_KEY), null);
for (const invalid of ['invalid JSON', '[1]', '{"ids":[]}']) {
  const broken = new MemoryStorage({ [previous]: invalid });
  assert.throws(() => readSavedPlaces(broken));
  assert.equal(broken.getItem(previous), invalid);
  assert.equal(broken.getItem(SAVED_KEY), null);
}
assert.deepEqual(readSavedPlaces(new MemoryStorage()), []);
console.log('AIRO storage: merged bookmarks, repeat reads, quota failure and malformed-data preservation passed');
