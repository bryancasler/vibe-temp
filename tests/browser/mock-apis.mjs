// Answers every host the app calls, from recorded data, so the browser checks
// run with no network. The weather is real: every hour of 2025 at
// 38.911,-76.986 (DC) from Open-Meteo's historical forecast, the fixture
// dcgoldens built for its own checks (tests/fixtures/dc-2025-hours.json,
// Open-Meteo data, CC BY 4.0). Rain, weather codes and air quality are not in
// it; they are made up from the cloud cover unless a scenario overrides them.
//
// Latencies are simulated. They make before/after timing comparable; they
// are not measurements of the real services.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "fixtures");
const year = JSON.parse(readFileSync(join(fixtures, "dc-2025-hours.json"), "utf8"));
const KEYS = year.keys; // tempF, rh, windMph, uv, uvClearSky, cloudPct, shortwave, direct, isDay

/** Chart.js 4.4.3 as jsDelivr serves it (the npm file, byte for byte). */
export function chartJsSource() {
  const cached = join(fixtures, "chart.umd.js");
  if (!existsSync(cached)) {
    execSync(
      `cd ${JSON.stringify(fixtures)} && npm pack chart.js@4.4.3 --silent && tar xzf chart.js-4.4.3.tgz package/dist/chart.umd.js && mv package/dist/chart.umd.js . && rm -rf package chart.js-4.4.3.tgz`,
      { stdio: "ignore" }
    );
  }
  return readFileSync(cached);
}

function hourAt(unix) {
  const i = Math.floor((unix - year.start) / 3600);
  const row = year.rows[Math.max(0, Math.min(year.rows.length - 1, i))];
  const o = {};
  KEYS.forEach((k, j) => (o[k] = row[j]));
  o.isDay = o.isDay === true || o.isDay === 1 ? 1 : 0;
  return o;
}

function codeFor(h) {
  if (h.cloudPct >= 90) return 3;
  if (h.cloudPct >= 50) return 2;
  if (h.cloudPct >= 20) return 1;
  return 0;
}

/** Offset of `zone` at `unix`, in seconds (east positive). */
function offsetSeconds(zone, unix) {
  const d = new Date(unix * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - d.getTime()) / 1000);
}

/** Unix seconds of local midnight in `zone` on the day containing `unix`. */
function localMidnight(zone, unix) {
  const off = offsetSeconds(zone, unix);
  const localDay = Math.floor((unix + off) / 86400) * 86400;
  // One correction pass covers a change of offset between midnight and now.
  return localDay - offsetSeconds(zone, localDay - off);
}

// Open-Meteo's local-time strings put one fixed offset on the whole series
// (the offset at the start), which is what timeformat=unixtime avoids.
function isoLocal(unix, fixedOffset) {
  return new Date((unix + fixedOffset) * 1000).toISOString().slice(0, 16);
}

/**
 * Builds a forecast response the way Open-Meteo shapes it, for any of the
 * variables asked for. `nowUnix` is the page's clock; `zone` stands in for
 * timezone=auto's pick (the place's own zone).
 */
export function forecastResponse(url, { nowUnix, zone = "America/New_York", scenario = {} } = {}) {
  const q = url.searchParams;
  const unixtime = q.get("timeformat") === "unixtime";
  const pastDays = Number(q.get("past_days") || 0);
  const days = Number(q.get("forecast_days") || 7);
  const start = localMidnight(zone, nowUnix) - pastDays * 86400;
  const end = localMidnight(zone, nowUnix) + days * 86400;
  const fixedOffset = offsetSeconds(zone, start);
  const stamp = (u) => (unixtime ? u : isoLocal(u, fixedOffset));
  const body = {
    latitude: Number(q.get("latitude")),
    longitude: Number(q.get("longitude")),
    generationtime_ms: 0.5,
    utc_offset_seconds: fixedOffset,
    timezone: zone,
    timezone_abbreviation: "",
    elevation: 20,
  };
  const value = (name, u) => {
    const h = hourAt(u);
    const over = scenario.hourly?.(u, h) || {};
    const pick = {
      temperature_2m: h.tempF,
      relative_humidity_2m: h.rh,
      apparent_temperature: h.tempF,
      wind_speed_10m: h.windMph,
      cloud_cover: h.cloudPct,
      uv_index: h.uv,
      uv_index_clear_sky: h.uvClearSky,
      shortwave_radiation: h.shortwave,
      direct_radiation: h.direct,
      is_day: h.isDay,
      precipitation: 0,
      precipitation_probability: 0,
      weathercode: codeFor(h),
      weather_code: codeFor(h),
      snowfall: 0,
    };
    const merged = { ...pick, ...over };
    return name in merged ? merged[name] : 0;
  };
  if (q.get("hourly")) {
    const names = q.get("hourly").split(",");
    const hourly = { time: [] };
    names.forEach((n) => (hourly[n] = []));
    for (let u = start; u < end; u += 3600) {
      hourly.time.push(stamp(u));
      names.forEach((n) => hourly[n].push(value(n, u)));
    }
    body.hourly = hourly;
  }
  if (q.get("current")) {
    const names = q.get("current").split(",");
    const u15 = Math.floor(nowUnix / 900) * 900;
    const a = Math.floor(u15 / 3600) * 3600;
    const f = (u15 - a) / 3600;
    const current = { time: stamp(u15), interval: 900 };
    names.forEach((n) => {
      const v0 = value(n, a);
      const v1 = value(n, a + 3600);
      current[n] =
        n === "is_day" || n === "weathercode" || n === "weather_code"
          ? v0
          : Math.round((v0 + (v1 - v0) * f) * 10) / 10;
    });
    body.current = current;
  }
  if (q.get("daily")) {
    const daily = { time: [], sunrise: [], sunset: [] };
    for (let u = start; u < end; u += 86400) {
      const date = new Date((u + offsetSeconds(zone, u + 43200)) * 1000).toISOString().slice(0, 10);
      const row = year.days.find((d) => d[0] === date);
      daily.time.push(unixtime ? u : date);
      daily.sunrise.push(row ? stamp(row[1]) : null);
      daily.sunset.push(row ? stamp(row[2]) : null);
    }
    body.daily = daily;
  }
  return body;
}

export function airQualityResponse(url, { nowUnix, zone = "America/New_York", scenario = {} } = {}) {
  const q = url.searchParams;
  const unixtime = q.get("timeformat") === "unixtime";
  const days = Number(q.get("forecast_days") || 5);
  const start = localMidnight(zone, nowUnix) - Number(q.get("past_days") || 0) * 86400;
  const end = localMidnight(zone, nowUnix) + days * 86400;
  const fixedOffset = offsetSeconds(zone, start);
  const hourly = { time: [], us_aqi: [] };
  for (let u = start; u < end; u += 3600) {
    hourly.time.push(unixtime ? u : isoLocal(u, fixedOffset));
    hourly.us_aqi.push(scenario.aqi ? scenario.aqi(u) : 40);
  }
  return { latitude: Number(q.get("latitude")), longitude: Number(q.get("longitude")), utc_offset_seconds: fixedOffset, timezone: zone, hourly };
}

export const ZIPS = {
  "20001": { place: "Washington", state: "DC", lat: 38.9122, lon: -77.0177, zone: "America/New_York" },
  "90012": { place: "Los Angeles", state: "CA", lat: 34.0614, lon: -118.2385, zone: "America/Los_Angeles" },
  "83814": { place: "Coeur d'Alene", state: "ID", lat: 47.6735, lon: -116.7812, zone: "America/Los_Angeles" },
  "<img>": null,
};

/** Latency profiles, in ms. "badProxy" is allorigins as seen on 2026-09-25. */
export const PROFILES = {
  fast: { openMeteo: 250, zip: 250, cdn: 150, allorigins: 1500, alloriginsFails: false, nws: 300 },
  badProxy: { openMeteo: 250, zip: 250, cdn: 150, allorigins: 12000, alloriginsFails: true, nws: 300 },
  slowOpenMeteo: { openMeteo: 9000, zip: 250, cdn: 150, allorigins: 1500, alloriginsFails: false, nws: 300 },
  hungOpenMeteo: { openMeteo: 15000, zip: 250, cdn: 150, allorigins: 1500, alloriginsFails: false, nws: 300 },
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Installs the mocks on a Playwright context. Returns a log of requests
 * (url, time) for assertions.
 */
export async function installMocks(context, { nowUnix, profile = PROFILES.fast, zoneFor = () => "America/New_York", scenario = {} } = {}) {
  const log = [];
  const chart = chartJsSource();
  const cors = { "access-control-allow-origin": "*" };
  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });

  // Anything else leaving the page is a bug in the app or the mocks.
  // Registered first because Playwright runs the last-registered match first.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    log.push({ host: "UNMOCKED", url: route.request().url(), at: Date.now() });
    route.abort("blockedbyclient");
  });
  await context.route(/^https:\/\/api\.open-meteo\.com\//, async (route) => {
    const url = new URL(route.request().url());
    log.push({ host: "open-meteo", url: url.toString(), at: Date.now() });
    await delay(profile.openMeteo);
    if (scenario.openMeteoStatus) return json(route, { error: true, reason: "mock" }, scenario.openMeteoStatus);
    const zone = zoneFor(Number(url.searchParams.get("latitude")), Number(url.searchParams.get("longitude")));
    json(route, forecastResponse(url, { nowUnix, zone, scenario }));
  });
  await context.route(/^https:\/\/air-quality-api\.open-meteo\.com\//, async (route) => {
    const url = new URL(route.request().url());
    log.push({ host: "air-quality", url: url.toString(), at: Date.now() });
    await delay(profile.openMeteo);
    if (scenario.airStatus) return json(route, { error: true }, scenario.airStatus);
    const zone = zoneFor(Number(url.searchParams.get("latitude")), Number(url.searchParams.get("longitude")));
    json(route, airQualityResponse(url, { nowUnix, zone, scenario }));
  });
  await context.route(/^https:\/\/api\.zippopotam\.us\//, async (route) => {
    const url = new URL(route.request().url());
    log.push({ host: "zippopotam", url: url.toString(), at: Date.now() });
    await delay(profile.zip);
    const zip = decodeURIComponent(url.pathname.split("/").pop());
    const z = ZIPS[zip];
    if (!z) return json(route, {}, 404);
    json(route, {
      "post code": zip,
      country: "United States",
      "country abbreviation": "US",
      places: [{ "place name": z.place, longitude: String(z.lon), state: "", "state abbreviation": z.state, latitude: String(z.lat) }],
    });
  });
  await context.route(/^https:\/\/cdn\.jsdelivr\.net\//, async (route) => {
    const url = route.request().url();
    log.push({ host: "jsdelivr", url, at: Date.now() });
    await delay(profile.cdn);
    if (!/chart\.js@4\.4\.3\/dist\/chart\.umd(\.min)?\.js$/.test(url)) return route.fulfill({ status: 404, headers: cors, body: "" });
    route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", headers: cors, body: chart });
  });
  await context.route(/^https:\/\/api\.allorigins\.win\//, async (route) => {
    log.push({ host: "allorigins", url: route.request().url(), at: Date.now() });
    await delay(profile.allorigins);
    if (profile.alloriginsFails) return route.fulfill({ status: 522, headers: cors, body: "" });
    json(route, { results: [{ name: "Washington", admin1: "District of Columbia" }] });
  });
  await context.route(/^https:\/\/api-inference\.huggingface\.co\//, async (route) => {
    log.push({ host: "huggingface", url: route.request().url(), at: Date.now() });
    route.abort("namenotresolved");
  });
  await context.route(/^https:\/\/api\.weather\.gov\//, async (route) => {
    const url = new URL(route.request().url());
    log.push({ host: "nws", url: url.toString(), at: Date.now() });
    await delay(profile.nws);
    const h = { "content-type": "application/geo+json", ...cors };
    if (scenario.nwsStatus) return route.fulfill({ status: scenario.nwsStatus, headers: h, body: "{}" });
    if (url.pathname.startsWith("/points/")) {
      return route.fulfill({
        status: 200,
        headers: h,
        body: JSON.stringify({
          properties: { gridId: "LWX", gridX: 97, gridY: 71, forecastGridData: "https://api.weather.gov/gridpoints/LWX/97,71" },
        }),
      });
    }
    if (url.pathname.startsWith("/gridpoints/")) {
      const updateTime = new Date((nowUnix - (scenario.nwsAgeHours ?? 1) * 3600) * 1000).toISOString();
      return route.fulfill({
        status: 200,
        headers: h,
        body: JSON.stringify({ properties: { updateTime, weather: { values: scenario.nwsWeather ? scenario.nwsWeather(nowUnix) : [] } } }),
      });
    }
    route.fulfill({ status: 404, headers: h, body: "{}" });
  });
  return log;
}
