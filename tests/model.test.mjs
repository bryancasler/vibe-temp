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

// Real DC hours from 2025 with the values of the direct-beam model Bryan
// approved for dcgoldens on 2026-09-24 (dcgoldens scripts/weather-check.ts
// BEAM_REFS), and vibe-temp's values before it (vt).
const BEAM_REFS = [
  { label: "2025-10-17 8am, clear first daylight hour", T: 41.4, RH: 68, W: 4.5, uv: 0.1, uvc: 0.1, cc: 0, isDay: true, sw: 32, dr: 17, shade: 40.1167, sun: 45.2903, vt: 49.3167 },
  { label: "2025-04-20 12pm, thin high cloud with the sun out", T: 74, RH: 52, W: 10, uv: 5.8, uvc: 6.5, cc: 98, isDay: true, sw: 827, dr: 615, shade: 67.8, sun: 74.4723, vt: 69.1002 },
  { label: "2025-04-13 10am, thin high cloud called 100%", T: 51.5, RH: 60, W: 11.9, uv: 3.15, uvc: 3.25, cc: 100, isDay: true, sw: 529, dr: 372, shade: 44.5033, sun: 51.1894, vt: 44.5033 },
  { label: "2025-04-19 12pm, bright overcast", T: 73.1, RH: 61, W: 9.9, uv: 2.4, uvc: 6.5, cc: 100, isDay: true, sw: 582, dr: 6, shade: 67.57, sun: 68.7951, vt: 67.57 },
  { label: "2025-12-28 12pm, grey overcast", T: 39.4, RH: 78, W: 6.5, uv: 1.1, uvc: 2.7, cc: 100, isDay: true, sw: 112, dr: 0, shade: 37.3833, sun: 37.3833, vt: 37.3833 },
  { label: "2025-07-29 2pm, hot clear afternoon", T: 96.6, RH: 52, W: 0.5, uv: 7.7, uvc: 7.85, cc: 2, isDay: true, sw: 916, dr: 735, shade: 97.05, sun: 105.0538, vt: 105.5896 },
  { label: "2025-07-29 11pm, night", T: 81.6, RH: 74, W: 1.1, uv: 0, uvc: 0, cc: 15, isDay: false, sw: 0, dr: 0, shade: 83.0967, sun: 83.0967, vt: 83.0967 },
  { label: "2025-01-09 5pm, no sunlight in a daylight hour", T: 29.7, RH: 38, W: 9.9, uv: 0.25, uvc: 0.25, cc: 0, isDay: true, sw: 0, dr: 0, shade: 22.6367, sun: 22.6367, vt: 31.8367 },
];
const beam = (r, over = {}) => feels(r, { shortwave_radiation: r.sw, direct_radiation: r.dr, ...over });

test("with sunlight readings it matches the direct-beam model on every reference hour", () => {
  for (const r of BEAM_REFS) {
    const f = beam(r);
    assert.ok(Math.abs(f.shade - r.shade) < 0.05 && Math.abs(f.sun - r.sun) < 0.05, `${r.label}: ${f.shade} ${f.sun}`);
  }
});

test("the sun-minus-shade gaps move as the handoff lists", () => {
  const want = [
    ["2025-10-17 8am", 9.2, 5.2],
    ["2025-04-20 12pm", 1.3, 6.7],
    ["2025-04-13 10am", 0, 6.7],
    ["2025-04-19 12pm", 0, 1.2],
    ["2025-12-28 12pm", 0, 0],
    ["2025-07-29 2pm", 8.5, 8.0],
  ];
  for (const [prefix, before, after] of want) {
    const r = BEAM_REFS.find((x) => x.label.startsWith(prefix));
    const old = feels(r);
    const now = beam(r);
    assert.equal(Math.round((old.sun - old.shade) * 10) / 10, before, `${prefix} before`);
    assert.equal(Math.round((now.sun - now.shade) * 10) / 10, after, `${prefix} after`);
  }
});

test("a missing radiation reading falls back to cloud cover, exactly as before", () => {
  const r = BEAM_REFS[1];
  for (const over of [{ direct_radiation: null }, { shortwave_radiation: undefined }, { shortwave_radiation: NaN }]) {
    assert.ok(Math.abs(beam(r, over).sun - r.vt) < 0.05);
  }
});

test("effective cloud: 0 at a clear beam share, 100 with no beam or no sunlight", () => {
  const e = M.effectiveCloudPct;
  assert.equal(e({ cloud_cover: 90, shortwave_radiation: 800, direct_radiation: 700 }), 0);
  assert.equal(e({ cloud_cover: 0, shortwave_radiation: 500, direct_radiation: 0 }), 100);
  assert.equal(e({ cloud_cover: 40, shortwave_radiation: 0, direct_radiation: 0 }), 100);
  assert.equal(e({ cloud_cover: 60, shortwave_radiation: null, direct_radiation: 300 }), 60);
  assert.equal(M.BEAM_SHARE_CLEAR, 0.85);
});

test("every hour of 2025: never NaN, sun never below shade, gap 0 or 1.2 to 9.2, 0 at night", async () => {
  const { readFileSync } = await import("node:fs");
  const year = JSON.parse(readFileSync(new URL("./fixtures/dc-2025-hours.json", import.meta.url)));
  let clearMiddays = 0;
  let moved = 0;
  for (const row of year.rows) {
    const [T, RH, W, uv, uvc, cc, sw, dr, isDay] = row;
    const h = { T, RH, W, uv, uvc, cc, isDay: isDay ? 1 : 0, sw, dr };
    const f = beam(h);
    const gap = f.sun - f.shade;
    assert.ok(Number.isFinite(f.sun) && Number.isFinite(f.shade));
    assert.ok(gap === 0 || (gap >= 1.2 - 1e-9 && gap <= 9.2 + 1e-9), `gap ${gap}`);
    if (!isDay) assert.equal(gap, 0);
    // Clear middays: a sun high enough for a clear-sky UV of 3+, little cloud.
    if (isDay && cc <= 10 && uvc >= 3 && uv / uvc > 0.9) {
      clearMiddays++;
      moved += Math.abs(f.sun - feels(h).sun);
    }
  }
  assert.ok(clearMiddays > 100 && moved / clearMiddays < 1, `clear middays ${clearMiddays}, mean move ${moved / clearMiddays}`);
});
