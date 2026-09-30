// ?demo: a made-up week that walks the chart through every state it can
// show (Bryan, 2026-09-30). It answers the page's own weather requests
// (Open-Meteo's forecast and air quality, the Weather Service's storms) from
// a timeline built here around the real clock, so everything the page draws
// comes through the same code as a real forecast. Off without ?demo.
//
// The week, day by day (today is day 0):
//   -2, -1  cold, snow two days ago (the winter salt note)
//    0      mild, with rain two hours from now (opens on 6 Hours)
//    1      extreme heat and humidity, sunny pavement, air unhealthy for
//           sensitive groups at midday, thunderstorms possible late afternoon
//    2      touch grass weather in the sun and the shade, windy afternoon
//    3      bitter cold with snow (DC's Extreme Cold Alert level)
//    4      morning fog, drizzle, humid, unhealthy air in the evening
//    5      freezing rain at dawn, then clearing
//    6      warm and humid, thunderstorms likely in the evening
(function () {
  "use strict";
  let on = false;
  try {
    on = new URLSearchParams(location.search).has("demo");
  } catch (e) {
    on = false;
  }
  window.VibeDemo = { on };
  if (!on) return;

  const H = 3600;
  const ZONE = "America/New_York";

  /** Offset of ZONE at `unix`, in seconds (east positive). */
  function offsetSeconds(unix) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(unix * 1000));
    const g = (t) => Number(parts.find((p) => p.type === t).value);
    const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
    return Math.round(asUtc / 1000 - unix);
  }
  /** Unix seconds of local midnight on the day containing `unix`. */
  function localMidnight(unix) {
    const off = offsetSeconds(unix);
    const day = Math.floor((unix + off) / 86400) * 86400;
    return day - offsetSeconds(day - off);
  }
  const dayStart = (d) => localMidnight(localMidnight(today) + d * 86400 + 43200);

  const now = Math.floor(Date.now() / 1000);
  const today = localMidnight(now);

  // Each day's low (5am) and high (3pm), °F, and its daytime humidity.
  const DAYS = {
    "-3": [26, 34, 60],
    "-2": [25, 34, 70],
    "-1": [22, 33, 55],
    0: [50, 70, 55],
    1: [80, 99, 55],
    2: [56, 72, 45],
    3: [4, 17, 60],
    4: [38, 48, 95],
    5: [30, 45, 70],
    6: [70, 85, 65],
    7: [60, 74, 50],
    8: [58, 72, 50],
  };
  const dayOf = (t) => Math.round((localMidnight(t) - today) / 86400);
  const hourOf = (t) => Math.floor((t - localMidnight(t)) / H);
  const keyPoints = [];
  for (let d = -3; d <= 8; d++) {
    const [lo, hi] = DAYS[d];
    keyPoints.push([dayStart(d) + 5 * H, lo], [dayStart(d) + 15 * H, hi]);
  }
  // Between one day's low and high, or high and the next low, on a cosine.
  function tempAt(t) {
    for (let k = 0; k + 1 < keyPoints.length; k++) {
      const [t0, v0] = keyPoints[k];
      const [t1, v1] = keyPoints[k + 1];
      if (t >= t0 && t <= t1) return v0 + ((v1 - v0) * (1 - Math.cos((Math.PI * (t - t0)) / (t1 - t0)))) / 2;
    }
    return 60;
  }
  const daylight = (t) => {
    const h = (t - localMidnight(t)) / H;
    return h >= 7 && h < 19 ? Math.sin((Math.PI * (h - 7)) / 12) : 0;
  };

  // Everything out of the ordinary, hour by hour.
  function events(t) {
    const d = dayOf(t);
    const h = hourOf(t);
    const e = {};
    if (d === -2 && h >= 8 && h < 13) Object.assign(e, { code: 73, snow: 1.5, pop: 80, cloud: 100 });
    if (t >= now + 2 * H && t < now + 4 * H) Object.assign(e, { code: 63, rain: 2.5, pop: 85, cloud: 100 });
    if (d === 1 && h >= 16 && h < 19) Object.assign(e, { code: 95, rain: 6, pop: 70, cloud: 90, wind: 22 });
    if (d === 2 && h >= 12 && h < 18) Object.assign(e, { wind: h < 14 ? 18 : 28 });
    if (d === 3) Object.assign(e, { wind: 14 });
    if (d === 3 && h >= 10 && h < 15) Object.assign(e, { code: 73, snow: 1.2, pop: 80, cloud: 100 });
    if (d === 4 && h >= 5 && h < 10) Object.assign(e, { code: 45, cloud: 100 });
    if (d === 4 && h >= 12 && h < 16) Object.assign(e, { code: 51, rain: 0.4, pop: 60, cloud: 100 });
    if (d === 5 && h >= 4 && h < 9) Object.assign(e, { code: 66, rain: 1, pop: 70, cloud: 100 });
    if (d === 6 && h >= 18 && h < 21) Object.assign(e, { code: 95, rain: 4, pop: 70, cloud: 90, wind: 20 });
    return e;
  }
  // The Weather Service's storm words, by hour.
  function stormWord(t) {
    const d = dayOf(t);
    const h = hourOf(t);
    if (d === 1 && h >= 16 && h < 19) return "chance";
    if (d === 6 && h >= 18 && h < 21) return "likely";
    return null;
  }
  function aqiAt(t) {
    const d = dayOf(t);
    const h = hourOf(t);
    if (d === 1 && h >= 11 && h < 16) return 120;
    if (d === 4 && h >= 17 && h < 23) return 165;
    return d === 1 ? 85 : 38;
  }

  function hourValues(t) {
    const d = dayOf(t);
    const e = events(t);
    const sun = daylight(t);
    const cloud = e.cloud ?? (d === 4 ? 90 : d === 0 ? 35 : 15);
    const tempF = tempAt(t);
    const dayRh = DAYS[d] ? DAYS[d][2] : 55;
    const rh = Math.min(100, sun > 0 ? dayRh : dayRh + 15);
    const code = e.code ?? (cloud >= 90 ? 3 : cloud >= 50 ? 2 : cloud >= 20 ? 1 : 0);
    const shortwave = 850 * sun * (1 - (0.75 * cloud) / 100);
    return {
      temperature_2m: Math.round(tempF * 10) / 10,
      apparent_temperature: Math.round(tempF * 10) / 10,
      relative_humidity_2m: Math.round(rh),
      wind_speed_10m: e.wind ?? 6,
      cloud_cover: cloud,
      uv_index: Math.round(9 * sun * (1 - (0.6 * cloud) / 100) * 10) / 10,
      uv_index_clear_sky: Math.round(9 * sun * 10) / 10,
      shortwave_radiation: Math.round(shortwave),
      direct_radiation: Math.round(shortwave * 0.8 * (1 - cloud / 100)),
      is_day: sun > 0 ? 1 : 0,
      precipitation: e.rain ?? (e.snow ? e.snow / 2 : 0),
      precipitation_probability: e.pop ?? 5,
      weathercode: code,
      weather_code: code,
      snowfall: e.snow ?? 0,
    };
  }

  function forecast(q) {
    const start = dayStart(-Number(q.get("past_days") || 0));
    const end = dayStart(Number(q.get("forecast_days") || 7));
    const body = {
      latitude: Number(q.get("latitude")),
      longitude: Number(q.get("longitude")),
      timezone: ZONE,
      utc_offset_seconds: offsetSeconds(start),
      elevation: 20,
    };
    const hourly = { time: [] };
    const names = (q.get("hourly") || "").split(",").filter(Boolean);
    names.forEach((n) => (hourly[n] = []));
    for (let t = start; t < end; t += H) {
      const v = hourValues(t);
      hourly.time.push(t);
      names.forEach((n) => hourly[n].push(n in v ? v[n] : 0));
    }
    body.hourly = hourly;
    const u15 = Math.floor(now / 900) * 900;
    const a = Math.floor(u15 / H) * H;
    const f = (u15 - a) / H;
    const v0 = hourValues(a);
    const v1 = hourValues(a + H);
    const current = { time: u15, interval: 900 };
    for (const n of (q.get("current") || "").split(",").filter(Boolean)) {
      current[n] = n === "is_day" || n === "weathercode" ? v0[n] : Math.round((v0[n] + (v1[n] - v0[n]) * f) * 100) / 100;
    }
    body.current = current;
    const daily = { time: [], sunrise: [], sunset: [] };
    for (let d = -Number(q.get("past_days") || 0); d < Number(q.get("forecast_days") || 7); d++) {
      const s = dayStart(d);
      daily.time.push(s);
      daily.sunrise.push(s + 7 * H);
      daily.sunset.push(s + 19 * H);
    }
    body.daily = daily;
    return body;
  }

  function air(q) {
    const start = dayStart(-Number(q.get("past_days") || 0));
    const end = dayStart(Number(q.get("forecast_days") || 5));
    const hourly = { time: [], us_aqi: [] };
    for (let t = start; t < end; t += H) {
      hourly.time.push(t);
      hourly.us_aqi.push(aqiAt(t));
    }
    return { latitude: Number(q.get("latitude")), longitude: Number(q.get("longitude")), timezone: ZONE, hourly };
  }

  const iso = (unix) => new Date(unix * 1000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
  function stormGrid() {
    const values = [];
    for (let t = dayStart(-1); t < dayStart(8); t += H) {
      const w = stormWord(t);
      if (w) values.push({ validTime: `${iso(t)}/PT1H`, value: [{ coverage: w, weather: "thunderstorms", intensity: null }] });
    }
    return { properties: { updateTime: iso(now - 1800), weather: { values } } };
  }

  const json = (body) =>
    new Promise((resolve) =>
      setTimeout(() => resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })), 60)
    );
  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let url;
    try {
      url = new URL(typeof input === "string" ? input : input.url);
    } catch (e) {
      return realFetch(input, init);
    }
    if (url.host === "api.open-meteo.com") return json(forecast(url.searchParams));
    if (url.host === "air-quality-api.open-meteo.com") return json(air(url.searchParams));
    if (url.host === "api.weather.gov" && url.pathname.startsWith("/points/"))
      return json({ properties: { gridId: "LWX", gridX: 97, gridY: 71 } });
    if (url.host === "api.weather.gov" && url.pathname.startsWith("/gridpoints/")) return json(stormGrid());
    return realFetch(input, init);
  };

  // Says so on the page, with the way back to the real forecast.
  document.addEventListener("DOMContentLoaded", () => {
    const note = document.createElement("p");
    note.className = "demo-banner";
    note.setAttribute("role", "note");
    note.append("Demo: made-up weather that shows every state the chart can draw. ");
    const a = document.createElement("a");
    const params = new URLSearchParams(location.search);
    params.delete("demo");
    a.href = location.pathname + (params.toString() ? `?${params}` : "");
    a.textContent = "See the real forecast";
    note.append(a);
    document.body.prepend(note);
  });
})();
