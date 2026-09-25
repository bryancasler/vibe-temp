import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const W = createRequire(import.meta.url)("../weather.js");
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Reference values from dcgoldens scripts/weather-check.ts: the official NWS
// chart (rounded), and formula values for the adjustments.
test("heat index matches the NWS chart and the WPC formula", () => {
  for (const [t, rh, want] of [[80, 40, 80], [84, 70, 90], [88, 60, 95], [86, 90, 105], [98, 40, 105], [94, 55, 106], [92, 70, 112], [100, 45, 114], [110, 40, 136]]) {
    assert.equal(Math.round(W.heatIndexF(t, rh)), want, `${t}/${rh}`);
  }
  for (const [t, rh, want] of [[100, 10, 94.1225], [95, 5, 88.1768], [110, 8, 103.1046], [86, 90, 105.3944], [84, 95, 100.8817], [79, 100, 83.8005]]) {
    assert.ok(near(W.heatIndexF(t, rh), want, 0.02), `${t}/${rh}: ${W.heatIndexF(t, rh)}`);
  }
  assert.ok(near(W.heatIndexF(80, 40), 79.58, 0.005));
  assert.ok(near(W.heatIndexF(70, 50), 69.05, 0.005));
  assert.equal(W.heatIndexOrNull(null, 50), null);
  assert.equal(W.heatIndexOrNull(90, NaN), null);
  assert.equal(W.heatIndexOrNull(94.7, 40), Math.round(W.heatIndexF(94.7, 40)));
});

test("weather code words", () => {
  assert.equal(W.conditionLabel(0, true), "Sunny");
  assert.equal(W.conditionLabel(0, false), "Clear");
  assert.equal(W.conditionLabel(95), "Thunderstorms");
  assert.equal(W.conditionLabel(null), null);
  assert.equal(W.conditionLabel(4), null);
});
