import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const C = require("../curve.js");
const M = require("../model.js");

const CAL = { humidityCoeff: 1 / 15, humidityBaseline: 40, windCoeff: 0.7, solarCoeff: 8, reflectCoeff: 4, cloudExp: 0.7 };

// A year of the sun line as the chart plots it: 15-minute points on a
// straight line between hourly values, rounded to 0.1 (buildTimelineDataset).
function sunSeries() {
  const year = JSON.parse(readFileSync(new URL("./fixtures/dc-2025-hours.json", import.meta.url)));
  const hourly = year.rows.map(([T, RH, W, uv, uvc, cc, sw, dr, d]) => {
    const shade = M.shadeVibeOf(T, RH, W, CAL);
    const solar = M.solarFromUVandCloud({ uv_index: uv, uv_index_clear_sky: uvc, cloud_cover: cc, is_day: d ? 1 : 0, shortwave_radiation: sw, direct_radiation: dr }, CAL);
    return M.sunVibeOf(shade, solar, 0.3, CAL);
  });
  const pts = [];
  for (let i = 0; i < hourly.length - 1; i++) {
    for (let q = 0; q < 4; q++) pts.push({ x: i * 4 + q, y: Math.round((hourly[i] + ((hourly[i + 1] - hourly[i]) * q) / 4) * 10) / 10 });
  }
  return pts;
}

function maxOvershoot(pts, curveAt) {
  let worst = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const lo = Math.min(pts[i].y, pts[i + 1].y);
    const hi = Math.max(pts[i].y, pts[i + 1].y);
    for (let k = 1; k < 10; k++) {
      const v = curveAt(i, pts[i].x + ((pts[i + 1].x - pts[i].x) * k) / 10);
      worst = Math.max(worst, v - hi, lo - v);
    }
  }
  return worst;
}

const bez = (p0, c1, c2, p3, t) => (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t * t * c2 + t ** 3 * p3;

test("the monotone curve never leaves the range of the two points it joins (a year of 15-minute points)", () => {
  const pts = sunSeries();
  const s = C.slopes(pts);
  for (const smoothing of [1, 0.5, 0.1]) {
    const over = maxOvershoot(pts, (i, x) => C.valueAt(pts, s, x, smoothing));
    assert.ok(over < 1e-9, `smoothing ${smoothing}: overshoot ${over}`);
  }
});

test("for comparison, the old Catmull-Rom curve overshoots on the same points", () => {
  const pts = sunSeries();
  // The old drawing: control points at p1 + (p2 - p0) / 6 and p2 - (p3 - p1) / 6,
  // with x evenly spaced (t equals the x fraction).
  const over = maxOvershoot(pts, (i, x) => {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = (x - p1.x) / (p2.x - p1.x);
    return bez(p1.y, p1.y + (p2.y - p0.y) / 6, p2.y - (p3.y - p1.y) / 6, p2.y, t);
  });
  console.log(`  old curve's worst overshoot in 2025: ${over.toFixed(2)}°F`);
  assert.ok(over > 0.05);
});

test("it passes through every point, and smoothing 0 is a straight line", () => {
  const pts = [{ x: 0, y: 50 }, { x: 1, y: 60 }, { x: 1.4, y: 61 }, { x: 3, y: 55 }, { x: 4, y: 55 }];
  const s = C.slopes(pts);
  for (const p of pts) assert.equal(C.valueAt(pts, s, p.x), p.y);
  assert.ok(Math.abs(C.valueAt(pts, s, 2.2, 0) - 58) < 1e-9);
  assert.equal(C.valueAt(pts, s, -1), null);
});

test("two lines that meet share a slope, so the upper never dips under the lower", () => {
  const sun = [{ x: 0, y: 50 }, { x: 1, y: 50 }, { x: 2, y: 58 }, { x: 3, y: 59 }];
  const shade = [{ x: 0, y: 50 }, { x: 1, y: 50 }, { x: 2, y: 51 }, { x: 3, y: 52 }];
  const a = C.slopes(sun), b = C.slopes(shade);
  C.shareSlopesWhereEqual(sun, a, shade, b);
  for (let x = 0; x <= 3; x += 0.05) assert.ok(C.valueAt(sun, a, x) >= C.valueAt(shade, b, x) - 1e-9, `x ${x}`);
});

test("the forward reader reads the same curve as valueAt", () => {
  const pts = sunSeries().slice(0, 2000);
  const s = C.slopes(pts);
  const read = C.reader(pts, s, 0.7);
  for (let x = 0; x < 1990; x += 0.37) assert.ok(Math.abs(read(x) - C.valueAt(pts, s, x, 0.7)) < 1e-12, `x ${x}`);
});
