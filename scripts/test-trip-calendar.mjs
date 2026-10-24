import assert from "node:assert/strict";
import { adjacentTripDay, localDateKey, nearestTripDay, tripDayDate } from "../src/lib/trip-calendar.ts";

assert.equal(tripDayDate("2026-12-31", 2, "2026-09-18"), "2027-01-01");
assert.equal(tripDayDate("2026-01-01", 0, "2026-09-18"), "2025-12-31");
assert.equal(tripDayDate("2024-02-28", 2, "2026-09-18"), "2024-02-29");
assert.equal(tripDayDate(null, 1, "2026-09-18"), "2026-09-18");
assert.equal(tripDayDate(null, 2, "2026-09-18"), "2026-09-19");
assert.equal(nearestTripDay("2026-03-07", [0,1,2,3,4], "2026-03-09"), 3, "DST cannot change the calendar offset");
assert.equal(nearestTripDay(null, [0,1,2], "2026-09-18"), 1);
assert.equal(nearestTripDay("2026-10-01", [1,2,4], "2026-09-18"), 1);
assert.equal(nearestTripDay("2026-10-01", [1,2,4], "2026-12-31"), 4);
assert.equal(nearestTripDay(null, [], "2026-09-18"), null);
assert.equal(adjacentTripDay([0,1,4], 1, 1), 4, "navigation follows existing days");
assert.equal(adjacentTripDay([0,1,4], 0, -1), undefined);
assert.equal(adjacentTripDay([0,1,4], 4, 1), undefined);
assert.equal(adjacentTripDay([], null, 1), undefined);
for (const zone of ["Asia/Seoul", "America/Los_Angeles"]) {
  process.env.TZ = zone;
  assert.equal(localDateKey(new Date(2026,8,18,0,1)), "2026-09-18");
}
console.log("Trip calendar: local today, DST, year/leap boundaries, day zero and bounded navigation passed");
