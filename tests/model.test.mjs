// The model against reference hours. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const M = require("../model.js");

// Vibe Temp's defaults (Advanced > Formula Calibration) and "Concrete (~0.3)".
const CAL = { humidityCoeff: 1 / 15, humidityBaseline: 40, windCoeff: 0.7, solarCoeff: 8, reflectCoeff: 4, cloudExp: 0.7 };
const R = 0.3;

function feels(h, extra = {}) {
  const shade = M.shadeVibeOf(h.T, h.RH, h.W, CAL);
  const solar = M.solarFromUVandCloud(
    { uv_index: h.uv, uv_index_clear_sky: h.uvc, cloud_cover: h.cc, is_day: h.isDay, ...extra },
    CAL
  );
  return { shade, sun: M.sunVibeOf(shade, solar, R, CAL), solar };
}

// Vibe Temp's own numbers before any change (cloud percentage only), from
// its scripts.js run in dcgoldens' harness on 2026-09-24
// (dcgoldens scripts/weather-check.ts VIBE_TEMP_REFS).
const VIBE_TEMP_REFS = [
  ["hot humid night (2025-07-29 00:00)", 81.4, 74, 3.2, 0, 0, 0, false, 81.4267, 81.4267],
  ["night with UV still > 0 (2025-04-13 20:00, after 19:43 sunset)", 58.2, 39, 3.2, 0.1, 0.1, 0, false, 55.8933, 55.8933],
  ["hot clear midday (2025-07-29 14:00)", 96.6, 52, 0.5, 7.7, 7.85, 2, true, 97.05, 105.5896],
  ["0% cloud, uv == clear-sky uv: solar exactly 1 (2025-07-29 19:00)", 91.3, 54, 2.8, 1.6, 1.6, 0, true, 90.2733, 99.4733],
  ["100% cloud at midday: lines coincide (2025-04-12 14:00)", 49.7, 69, 9.1, 0.95, 6.55, 100, true, 45.2633, 45.2633],
  ["99% cloud: reflect step (2025-04-12 18:00)", 50.2, 73, 4.5, 0.85, 2.1, 99, true, 49.25, 50.4727],
  ["missing clear-sky UV -> uv/10 fallback", 85, 60, 5, 6, null, 20, true, 82.8333, 87.2775],
  ["clear-sky UV = 0 in daylight, uv 0 (2025-04-09 07:00)", 30.3, 68, 0.9, 0, 0, 0, true, 31.5367, 31.5367],
  ["missing clear-sky UV, uv 11: clamped to 1", 95, 40, 0, 11, null, 0, true, 95, 104.2],
  ["cold clear afternoon (2025-01-22 15:00)", 21.4, 35, 3.8, 2.3, 2.3, 1, true, 18.4067, 27.2882],
  ["cold windy night (2025-01-22 04:00)", 15.1, 54, 7.5, 0, 0, 95, false, 10.7833, 10.7833],
  ["clear dawn, first daylight hour (2025-07-29 07:00)", 75.4, 92, 1.3, 0.15, 0.15, 12, true, 77.9567, 85.3432],
  ["mild partly cloudy, breezy (2025-04-13 15:00)", 61.9, 45, 13.5, 6.1, 6.3, 31, true, 52.7833, 58.3172],
  ["cloud null treated as 0%", 70, 40, 0, 5, 5, null, true, 70, 79.2],
  ["uv null treated as 0: no sun term", 70, 40, 0, null, 5, 0, true, 70, 70],
  ["is_day null treated as night", 70, 40, 0, 5, 5, 0, null, 70, 70],
  ["50% cloud, uv == uvc", 80, 40, 0, 4, 4, 50, true, 80, 84.2754],
  ["strong wind, dry heat", 90, 20, 20, 8, 8, 0, true, 74.6667, 83.8667],
];

test("without sunlight readings the model gives Vibe Temp's own numbers on all 18 reference hours", () => {
  for (const [label, T, RH, W, uv, uvc, cc, isDay, shade, sun] of VIBE_TEMP_REFS) {
    const f = feels({ T, RH, W, uv, uvc, cc, isDay });
    assert.ok(Math.abs(f.shade - shade) < 6e-5 && Math.abs(f.sun - sun) < 6e-5, `${label}: ${f.shade} ${f.sun}`);
  }
});

test("sun equals shade at night", () => {
  for (const [label, T, RH, W, uv, uvc, cc] of VIBE_TEMP_REFS) {
    for (const isDay of [0, false, null, undefined]) {
      const f = feels({ T, RH, W, uv, uvc, cc, isDay });
      assert.equal(f.sun, f.shade, label);
    }
  }
});
