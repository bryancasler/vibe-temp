// The shared link's preview (worker/): its numbers come from the page's own
// model, its time is the place's own, and nothing from the address or the
// ZIP lookup reaches the HTML unescaped.
import test from "node:test";
import assert from "node:assert/strict";
import "../model.js";
import { forecastResponse } from "./browser/mock-apis.mjs";
import { CALIBRATION, REFLECTIVITY, DANGER_HI_F, previewData, previewDescription, stamp, card, previewTitle } from "../worker/src/preview.js";
import { previewTags, zipFrom, bucketOf } from "../worker/src/meta.js";

const NOW = Date.parse("2025-10-17T14:20:00-04:00") / 1000;
const url = new URL(
  "https://api.open-meteo.com/v1/forecast?latitude=38.92&longitude=-77.04&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,shortwave_radiation,direct_radiation,is_day,weathercode&daily=sunrise,sunset&timezone=auto&timeformat=unixtime&past_days=1&forecast_days=2"
);
const fc = forecastResponse(url, { nowUnix: NOW });
const d = previewData(fc, NOW);

test("the shade and sun figures are the model's, at the page's defaults", () => {
  const h = fc.hourly;
  const i = h.time.findIndex((t) => t === Math.floor(NOW / 3600) * 3600);
  const j = i + 1;
  const f = (NOW - h.time[i]) / 3600;
  const shade = (k) => globalThis.VibeModel.shadeVibeOf(h.temperature_2m[k], h.relative_humidity_2m[k], h.wind_speed_10m[k], CALIBRATION);
  const sun = (k) =>
    globalThis.VibeModel.sunVibeOf(
      shade(k),
      globalThis.VibeModel.solarFromUVandCloud(
        { uv_index: h.uv_index[k], uv_index_clear_sky: h.uv_index_clear_sky[k], is_day: h.is_day[k], cloud_cover: h.cloud_cover[k], shortwave_radiation: h.shortwave_radiation[k], direct_radiation: h.direct_radiation[k] },
        CALIBRATION
      ),
      REFLECTIVITY,
      CALIBRATION
    );
  assert.equal(d.shadeF, Math.round(shade(i) + (shade(j) - shade(i)) * f));
  assert.equal(d.sunF, Math.round(sun(i) + (sun(j) - sun(i)) * f));
  assert.ok(d.series.length >= 24);
});

test("the time stamp is the place's own, with its zone", () => {
  assert.equal(stamp(NOW, "America/New_York"), "Fri, Oct 17 · 2:20 PM EDT");
  assert.equal(stamp(NOW, "America/Los_Angeles"), "Fri, Oct 17 · 11:20 AM PDT");
});

test("only a five-digit ZIP is taken from the address", () => {
  const z = (q) => zipFrom(new URLSearchParams(q));
  assert.equal(z("zip=20009"), "20009");
  assert.equal(z("zip=%2020009%20"), "20009");
  for (const q of ["", "zip=2000", "zip=200099", "zip=20009%3Cscript%3E", "zip=abcde", "zip=20009-1234"]) assert.equal(z(q), null, q);
});

test("the tags: title without the site name, image 1200x630 on a ten-minute bucket, all escaped", () => {
  const place = `Evil "<script>alert(1)</script>", DC`;
  const tags = previewTags({ origin: "https://vibetemp.fun", pageUrl: 'https://vibetemp.fun/?zip=20009&x="><b>', zip: "20009", place, data: d });
  assert.ok(!/<script|"><b>/.test(tags), tags);
  assert.match(tags, /property="og:site_name" content="Vibe Temp"/);
  assert.ok(!/og:title" content="[^"]*Vibe Temp/.test(tags));
  assert.match(tags, new RegExp(`og:image" content="https://vibetemp.fun/og.png\\?zip=20009&amp;t=${bucketOf(NOW)}"`));
  assert.match(tags, /og:image:width" content="1200"/);
  assert.equal(previewTitle("20009", "Washington, DC", d), `20009 · Washington, DC: ${d.sunF}°F sun, ${d.shadeF}°F shade`);
});

test("the card carries the ZIP, the place and the time, escaped", () => {
  const html = card("20009", "A<b>&C", d);
  assert.ok(html.includes("20009") && html.includes("A&lt;b&gt;&amp;C") && html.includes("2:20 PM EDT"));
  assert.ok(!html.includes("A<b>"));
});

// The same forecast with one thing changed, from 10:20am.
const MORNING = Date.parse("2025-10-17T10:20:00-04:00") / 1000;
const with_ = (hourly) => previewData(forecastResponse(url, { nowUnix: MORNING, scenario: { hourly } }), MORNING);
const at = (h0, h1, over) => (u) => (u >= MORNING + h0 * 3600 && u < MORNING + h1 * 3600 ? over : null);

test("a calm day: touch grass, no alert", () => {
  const c = with_(() => null);
  assert.equal(c.alert, null);
  assert.match(c.grass, /^Touch grass (until \d|\d+ to \d+ [AP]M|noon)/);
});

test("storms: weather codes 95 to 99 only, with their hours", () => {
  const s = with_(at(5, 8, { weathercode: 95 }));
  assert.equal(s.alert.kind, "storm");
  assert.equal(s.alert.text, "Thunderstorms 4 to 7 PM");
  assert.equal(with_(at(5, 8, { weathercode: 99 })).alert.kind, "storm");
  assert.equal(with_(at(5, 8, { weathercode: 82 })).alert, null);
  assert.match(previewDescription(s), /Thunderstorms 4 to 7 PM\./);
});

test("dangerous heat from the NWS Danger level, 103°F heat index, not below", () => {
  // 95°F air: 50% humidity gives a heat index of about 107, 35% about 98.
  const hot = with_(at(2, 5, { temperature_2m: 95, relative_humidity_2m: 50 }));
  assert.equal(hot.alert.kind, "heat");
  assert.match(hot.alert.text, /^Dangerous heat 1 to 4 PM, heat index 10\d°F$/);
  assert.equal(with_(at(2, 5, { temperature_2m: 95, relative_humidity_2m: 35 })).alert, null);
  assert.equal(DANGER_HI_F, 103);
});

test("storms come before heat", () => {
  const both = with_((u) => ({ temperature_2m: 98, relative_humidity_2m: 55, ...(u >= MORNING + 5 * 3600 && u < MORNING + 6 * 3600 ? { weathercode: 96 } : {}) }));
  assert.equal(both.alert.kind, "storm");
});

test("a sunset label keeps out of the shading when it can", () => {
  // Storms from just after sunset to 1am shade the right of the sunset sun:
  // the label goes to its left, where it is clear of the lines too.
  const storm = with_(at(8, 14, { weathercode: 95 }));
  const html = card("20009", "Washington, DC", storm);
  const m = html.match(/left:(\d+)px;top:(\d+)px;width:(\d+)px;height:30px[^>]*>Sunset/);
  const sunX = Number(html.match(/<circle cx="([\d.]+)" cy="[\d.]+" r="21"/)?.[1]);
  assert.ok(m && Number(m[1]) + Number(m[3]) <= sunX, `${m?.slice(1)} vs sun at ${sunX}`);
});
