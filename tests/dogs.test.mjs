// Dogs mode rules, against dcgoldens' own expected words and values
// (scripts/weather-check.ts). Run: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const D = require("../dogs.js");
const PT = require("../time.js");
const C = require("../curve.js");
const M = require("../model.js");

const ZONE = "America/New_York";
const H = 3600;
const localT = (date, hour) => {
  const [y, m, d] = date.split("-").map(Number);
  return PT.instantOf(ZONE, y, m, d, hour) / 1000;
};
const JULY = "2026-07-15";
const plus = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const hour = (t, o = {}) => ({
  t,
  date: PT.dayKey(t * 1000, ZONE),
  hour: PT.parts(t * 1000, ZONE).hour,
  tempF: 70,
  rh: 50,
  windMph: 5,
  uv: 0,
  isDay: true,
  pop: 0,
  code: 0,
  snowIn: 0,
  aqi: 30,
  storm: "none",
  ...o,
});
const range = (from, to, o) => {
  const out = [];
  for (let t = from; t < to; t += H) out.push(hour(t, typeof o === "function" ? o(t) : o));
  return out;
};

test("ranges read across midnight, to midnight, and as whole days", () => {
  const tJ = plus(JULY, 1);
  const fri = plus(JULY, 2);
  const one = (start, end) => D.describeRanges([{ start, end }], JULY, ZONE);
  assert.equal(one(localT(JULY, 22), localT(tJ, 2)), "today 10pm to 2am tomorrow");
  assert.equal(one(localT(JULY, 20), localT(tJ, 0)), "today 8pm to midnight");
  assert.equal(one(localT(JULY, 22), localT(fri, 0)), "today 10pm to midnight tomorrow");
  assert.equal(D.describeRanges([{ start: localT("2026-07-17", 22), end: localT("2026-07-18", 2) }], JULY, ZONE), "Friday 10pm to 2am Saturday");
  assert.equal(one(localT(tJ, 0), localT(fri, 0)), "all day tomorrow");
  assert.equal(one(localT(fri, 0), localT(plus(JULY, 4), 0)), "all day Friday and Saturday");
  assert.equal(D.describeRanges([{ start: localT("2026-03-08", 0), end: localT("2026-03-09", 0) }], "2026-03-06", ZONE), "all day Sunday");
  assert.equal(D.describeRanges([{ start: localT("2026-11-01", 0), end: localT("2026-11-02", 0) }], "2026-10-31", ZONE), "all day tomorrow");
  assert.equal(
    [one(localT(tJ, 1), localT(fri, 0)), one(localT(tJ, 0), localT(tJ, 23)), one(localT(tJ, 0), localT(fri, 9))].join(" | "),
    "tomorrow 1am to midnight | tomorrow 12am to 11pm | tomorrow 12am to 9am Friday"
  );
  const mixed = D.describeRanges(
    [
      { start: localT(JULY, 14), end: localT(JULY, 16) },
      { start: localT(tJ, 0), end: localT(fri, 0) },
      { start: localT(fri, 15), end: localT(fri, 17) },
    ],
    JULY,
    ZONE
  );
  assert.equal(mixed, "today 2pm to 4pm, all day tomorrow, Friday 3pm to 5pm");
  assert.equal(D.describeRanges([{ start: localT(fri, 0), end: localT(plus(JULY, 5), 0) }], JULY, ZONE), "all day Friday through Sunday");
});

test("walk ratings: each kind, and skips beat cautions beat good", () => {
  const t = localT(JULY, 14);
  const kind = (o) => D.classifyHour(hour(t, o)).kind;
  assert.equal(kind({}), "good");
  assert.equal(kind({ tempF: 86, rh: 50 }), "warm"); // heat index 89
  assert.equal(kind({ tempF: 80, rh: 20, uv: 2.6 }), "warm"); // sunny pavement: UV prints 3 (heat index 79)
  assert.equal(kind({ tempF: 80, rh: 20, uv: 2.4 }), "good");
  assert.equal(kind({ tempF: 81, rh: 20 }), "warm"); // heat index 79.7 prints 80: heat
  assert.equal(kind({ tempF: 31.4, windMph: 0 }), "cold");
  assert.equal(kind({ tempF: 31.6, windMph: 0 }), "good"); // prints 32°F: not below freezing
  assert.equal(kind({ pop: 50 }), "caution");
  assert.equal(kind({ storm: "chance" }), "caution");
  assert.equal(kind({ storm: "slight" }), "good");
  assert.equal(kind({ aqi: 101 }), "caution");
  assert.equal(kind({ tempF: 96, rh: 45 }), "too-hot"); // heat index 105
  assert.equal(kind({ tempF: 20, windMph: 10 }), "too-cold"); // wind chill 9
  assert.equal(kind({ tempF: 26, windMph: 8, pop: 60 }), "too-cold"); // wind chill 17, wet
  assert.equal(kind({ tempF: 26, windMph: 8, pop: 40 }), "cold");
  assert.equal(kind({ storm: "likely" }), "storms-air");
  assert.equal(kind({ aqi: 151 }), "storms-air");
  assert.equal(kind({ tempF: 96, rh: 45, storm: "likely", aqi: 180 }), "too-hot");
  assert.equal(kind({ tempF: 86, rh: 50, storm: "likely" }), "storms-air");
  assert.equal(kind({ tempF: null, rh: null, aqi: null, storm: null, pop: null }), "good"); // missing never flags
  assert.equal(D.walkWords(D.classifyHour(hour(t, { tempF: 86, rh: 50, uv: 7 }))), "Getting warm, be cautious: heat, sunny pavement");
});

test("walk times in words", () => {
  const tJ = plus(JULY, 1);
  const now = localT(JULY, 5) + 600;
  // Freezing all tomorrow: take care all day.
  const cold = range(localT(tJ, 0), localT(plus(JULY, 2), 0), { tempF: 28, windMph: 0, isDay: false });
  assert.equal(D.walkSummary(D.walkPlan(cold, tJ, now, ZONE), JULY, ZONE).sentence, "Take care all day tomorrow: no hour is free of flags (below freezing).");
  // Hot afternoon today: two windows.
  const day = range(localT(JULY, 0), localT(tJ, 0), (t) => {
    const h = PT.parts(t * 1000, ZONE).hour;
    return h >= 11 && h < 18 ? { tempF: 88, rh: 40 } : {}; // heat index 88
  });
  const s = D.walkSummary(D.walkPlan(day, JULY, now, ZONE), JULY, ZONE);
  assert.equal(s.sentence, "Best walk times today: 5am to 11am and 6pm to midnight.");
  assert.equal(s.note, "Other hours are flagged for heat.");
  // Nothing flagged.
  assert.equal(D.walkSummary(D.walkPlan(range(localT(JULY, 0), localT(tJ, 0), {}), JULY, now, ZONE), JULY, ZONE).sentence, "No weather flags for the rest of today, so any time works.");
  // Every hour a skip.
  const smoke = range(localT(JULY, 0), localT(tJ, 0), { aqi: 180 });
  assert.equal(D.walkSummary(D.walkPlan(smoke, JULY, now, ZONE), JULY, ZONE).sentence, "Every hour left today is flagged for unhealthy air. Keep outings to quick breaks.");
});

test("the cards, as dcgoldens words them", () => {
  const now = localT(JULY, 10) + 600;
  const hot = range(localT(JULY, 0), localT(plus(JULY, 3), 0), (t) => {
    const h = PT.parts(t * 1000, ZONE).hour;
    return h === 15 && PT.dayKey(t * 1000, ZONE) === JULY ? { tempF: 97, rh: 50, uv: 7 } : h >= 11 && h < 18 ? { tempF: 88, rh: 40, uv: 6 } : {};
  });
  const cards = D.dogSignals({ hours: hot, now, zone: ZONE, units: "F" });
  const heat = cards.find((c) => c.id === "heat");
  assert.match(heat.headline, /^Heat index 1\d\d°F today, at DC's (Extreme )?Heat Alert level$/);
  assert.equal(heat.level, "warning");
  assert.match(heat.detail, /2\.67 times the odds/);
  const pave = cards.find((c) => c.id === "pavement");
  // The next 24 hours only: tomorrow's afternoon is past them, and today's stretch ended.
  assert.equal(pave.headline, "Sunny pavement today 11am to 6pm");
  // Freezing night past midnight names where it ends; storms read the NWS words.
  const winter = range(localT(JULY, 0), localT(plus(JULY, 3), 0), (t) => {
    const h = PT.parts(t * 1000, ZONE).hour;
    const cold = h >= 20 || h < 9;
    return { tempF: cold ? 28 : 40, windMph: 0, isDay: !cold, storm: h >= 22 || h < 2 ? "chance" : "none" };
  });
  const w = D.dogSignals({ hours: winter, now: localT(JULY, 14) + 600, zone: ZONE, units: "F" });
  assert.equal(w.find((c) => c.id === "cold").headline, "Below freezing today 8pm to 9am tomorrow");
  assert.equal(w.find((c) => c.id === "storms").headline, "Thunderstorms possible today 10pm to 2am tomorrow, tomorrow 10pm to 2am Friday");
  assert.ok(w.find((c) => c.id === "cold").detail.startsWith("DC law counts anything below 32°F as extreme weather, when a dog can't be left outside for more than 15 minutes"));
  // Air: EPA categories for people.
  const air = D.airSignal([hour(now, { aqi: 61 })], "today");
  assert.equal(air.headline, "Air quality today: Moderate, AQI 61");
  assert.equal(D.airSignal([hour(now, { aqi: 120 })], "today").level, "caution");
  assert.equal(D.aqiWords(61), "61, Moderate");
  // Salt looks 48 hours back.
  const salt = D.dogSignals({ hours: range(now - 40 * H, now + 30 * H, (t) => (t < now - 30 * H && t > now - 34 * H ? { code: 73, tempF: 30 } : {})), now, zone: ZONE, units: "F" });
  assert.ok(salt.some((c) => c.id === "salt"));
  // °C prints whole degrees of the whole °F.
  assert.equal(D.formatTemp(31.4, "C"), "-1°C");
  assert.equal(D.formatTempDelta(36, "C"), "20°C");
});

test("the Weather Service's words: coverage, intervals, freshness", () => {
  assert.equal(D.coverageWord("slight_chance"), "slight");
  assert.equal(D.coverageWord("scattered"), "chance");
  assert.equal(D.coverageWord("numerous"), "likely");
  assert.equal(D.coverageWord("brand_new_word"), "chance");
  assert.equal(D.stormWordOf([{ weather: "rain_showers", coverage: "likely" }, { weather: "thunderstorms", coverage: "chance" }]), "chance");
  assert.equal(D.stormWordOf(null), "none");
  assert.deepEqual(D.validityInterval("2026-09-24T18:30:00+00:00/PT2H"), { start: Date.parse("2026-09-24T18:30:00Z") / 1000, end: Date.parse("2026-09-24T20:30:00Z") / 1000 });
  assert.equal(D.validityInterval("NOW/PT1H"), null);
  assert.equal(D.durationSeconds("P2DT10H"), 208800);
  assert.equal(D.durationSeconds("P1Y"), null);
  const grid = D.parseStormGrid({
    properties: {
      updateTime: "2026-09-24T15:00:00+00:00",
      weather: {
        values: [
          { validTime: "2026-09-24T18:30:00+00:00/PT2H", value: [{ weather: "thunderstorms", coverage: "chance" }] },
          { validTime: "2026-09-24T19:00:00+00:00/PT1H", value: [{ weather: "thunderstorms", coverage: "likely" }] },
          { validTime: "garbage", value: [] },
        ],
      },
    },
  });
  const t18 = Date.parse("2026-09-24T18:00:00Z") / 1000;
  assert.deepEqual(grid.hours, [[t18, 2], [t18 + H, 3], [t18 + 2 * H, 2]]);
  assert.throws(() => D.parsePoint({ properties: { gridId: "../x", gridX: 1, gridY: 1 } }));
  assert.deepEqual(D.parsePoint({ properties: { gridId: "LWX", gridX: 97, gridY: 71 } }), { gridId: "LWX", gridX: 97, gridY: 71 });
  const now = Date.parse("2026-09-24T20:00:00Z") / 1000;
  assert.ok(D.stormUpdateUsable("2026-09-24T15:00:00+00:00", now));
  assert.ok(!D.stormUpdateUsable("2026-09-24T07:00:00+00:00", now)); // 13 hours old
  assert.ok(!D.stormUpdateUsable("2026-09-24T22:00:00+00:00", now)); // 2 hours ahead
});

// Six real DC days of 2025 (dcgoldens scripts/fixtures/touch-grass-days-2025.json,
// 6am to 9pm, daylight by each hour's flag). dcgoldens reads the paw off its
// own curve (monotone through the hourly values); Vibe Temp reads it off the
// line it draws (monotone through 15-minute points on a straight line between
// the hours), so a minute can differ. Its expected picks: 16 Oct 9:29am 57,
// 29 July none (too warm), 22 Jan none, 5 March 6:59pm 58, 2 June none (smoke),
// 1 Jan 12pm 45.
test("paw to grass on six real DC days of 2025", () => {
  const fx = JSON.parse(readFileSync(new URL("./fixtures/paw-days-2025.json", import.meta.url)));
  const CAL = { humidityCoeff: 1 / 15, humidityBaseline: 40, windCoeff: 0.7, solarCoeff: 8, reflectCoeff: 4, cloudExp: 0.7 };
  const got = {};
  for (const [date, d] of Object.entries(fx.days)) {
    const hours = d.hours.map((row) => {
      const o = Object.fromEntries(fx.keys.map((k, i) => [k, row[i]]));
      return { ...o, code: null, snowIn: 0 };
    });
    // The sun line as Vibe Temp plots it: hourly values, then 15-minute points
    // on a straight line between them, rounded to 0.1, drawn as a monotone curve.
    const sunAt = hours.map((h) => {
      const shade = M.shadeVibeOf(h.tempF, h.rh, h.windMph, CAL);
      const solar = M.solarFromUVandCloud({ uv_index: h.uv, uv_index_clear_sky: h.uvClearSky, cloud_cover: h.cloudPct, is_day: h.isDay ? 1 : 0, shortwave_radiation: h.shortwave, direct_radiation: h.direct }, CAL);
      return M.sunVibeOf(shade, solar, 0.3, CAL);
    });
    const pts = [];
    hours.forEach((h, i) => {
      for (let q = 0; q < 4; q++) {
        if (i === hours.length - 1 && q > 0) break;
        const v = i < hours.length - 1 ? sunAt[i] + ((sunAt[i + 1] - sunAt[i]) * q) / 4 : sunAt[i];
        pts.push({ x: h.t + q * 900, y: Math.round(v * 10) / 10 });
      }
    });
    const s = C.slopes(pts);
    const r = D.scanPawToGrass({ hours, sunDays: [], readSun: (t) => C.valueAt(pts, s, t), from: hours[0].t, to: hours[hours.length - 1].t });
    got[date] = r.best ? `${D.formatClock(r.best.t, ZONE)} ${r.best.wholeF}` : `none (${r.reason})`;
  }
  assert.deepEqual(got, {
    "2025-10-16": "9:35am 57", // dcgoldens: 9:29am on its hourly curve
    "2025-07-29": "none (too-warm)",
    "2025-01-22": "none (no-good-hours)",
    "2025-03-05": "6:59pm 58",
    "2025-06-02": "none (no-good-hours)",
    "2025-01-01": "12pm 45",
  });
});

test("paw captions", () => {
  const now = localT(JULY, 10);
  const pick = { t: localT(plus(JULY, 1), 8) + 43 * 60, wholeF: 57 };
  assert.equal(D.pawCaption({ day: { best: pick }, week: { best: pick }, now, zone: ZONE, units: "F" }), "Paw to grass for Goldens: 8:43am tomorrow, 57°F in the sun.");
  assert.equal(
    D.pawCaption({ day: { best: null, reason: "too-warm" }, week: { best: { t: localT(plus(JULY, 2), 9) + 24 * 60, wholeF: 58 } }, now, zone: ZONE, units: "F" }),
    "No paw-to-grass time for Goldens in the next 24 hours. Every good daylight hour is 65°F or warmer in the sun. This week's best is 9:24am Friday."
  );
  assert.equal(
    D.pawCaption({ week: { best: { t: localT(plus(JULY, 5), 14) + 5 * 60, wholeF: 57 } }, now, zone: ZONE, units: "F", weekView: true, weekMarks: 3 }),
    "Paw to grass for Goldens this week: 2:05pm Monday, 57°F in the sun. A paw marks each day's best."
  );
});
