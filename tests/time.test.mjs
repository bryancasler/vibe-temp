import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const T = createRequire(import.meta.url)("../time.js");
const NY = "America/New_York";
const iso = (ms) => new Date(ms).toISOString();

test("parts read the place's wall clock", () => {
  const p = T.parts(Date.parse("2025-10-17T14:20:00Z"), NY);
  assert.deepEqual([p.year, p.month, p.day, p.hour, p.minute, p.weekday], [2025, 10, 17, 10, 20, 5]);
  const la = T.parts(Date.parse("2025-10-17T14:20:00Z"), "America/Los_Angeles");
  assert.equal(la.hour, 7);
});

test("local midnight, including across daylight-saving changes", () => {
  assert.equal(iso(T.startOfDay(Date.parse("2025-10-17T14:20:00Z"), NY)), "2025-10-17T04:00:00.000Z");
  // 2025-11-02 is 25 hours long in New York; 2025-03-09 is 23.
  assert.equal(iso(T.startOfDay(Date.parse("2025-11-02T20:00:00Z"), NY)), "2025-11-02T04:00:00.000Z");
  assert.equal(iso(T.startOfDay(Date.parse("2025-11-02T20:00:00Z"), NY, 1)), "2025-11-03T05:00:00.000Z");
  assert.equal(iso(T.startOfDay(Date.parse("2025-03-09T20:00:00Z"), NY)), "2025-03-09T05:00:00.000Z");
  assert.equal(iso(T.startOfDay(Date.parse("2025-03-09T20:00:00Z"), NY, 1)), "2025-03-10T04:00:00.000Z");
  // A week from before a change lands on midnight after it.
  assert.equal(iso(T.startOfDay(Date.parse("2025-10-30T12:00:00Z"), NY, 7)), "2025-11-06T05:00:00.000Z");
});

test("hour starts and day keys work in a half-hour zone", () => {
  const ms = Date.parse("2025-10-17T10:50:00Z"); // 16:20 in Kolkata
  assert.equal(iso(T.startOfHour(ms, "Asia/Kolkata")), "2025-10-17T10:30:00.000Z");
  assert.equal(T.dayKey(Date.parse("2025-10-17T20:00:00Z"), "Asia/Kolkata"), "2025-10-18");
  assert.equal(T.dayKey(Date.parse("2025-10-17T20:00:00Z"), NY), "2025-10-17");
});

test("days between local dates", () => {
  assert.equal(T.daysBetween(Date.parse("2025-10-17T03:00:00Z"), Date.parse("2025-10-17T05:00:00Z"), NY), 1);
  assert.equal(T.daysBetween(Date.parse("2025-11-01T12:00:00Z"), Date.parse("2025-11-03T12:00:00Z"), NY), 2);
});

test("zone names are checked", () => {
  assert.ok(T.isValidZone(NY));
  assert.ok(!T.isValidZone("Not/AZone"));
  assert.ok(!T.isValidZone(""));
  assert.ok(!T.isValidZone(undefined));
});
