// A shared link's preview (Bryan, 2026-10-01): what the page would show for a
// ZIP right now, worked out the same way the page does (model.js and the
// default calibration and surface), and drawn as a 1200×630 card. Pure, so
// tests/preview.test.mjs runs it in Node and the Worker renders it.
import "../../model.js";
import "../../weather.js";

const VibeModel = globalThis.VibeModel;
const VibeWeather = globalThis.VibeWeather;

// The page's defaults: scripts.js defaultCalibration, concrete underfoot.
export const CALIBRATION = Object.freeze({
  humidityCoeff: 1 / 15,
  humidityBaseline: 40,
  windCoeff: 0.7,
  solarCoeff: 8,
  reflectCoeff: 4,
  cloudExp: 0.7,
});
export const REFLECTIVITY = 0.3;
// Touch grass weather for people, in daylight (scripts.js touchGrassRange).
export const TOUCH_GRASS = { min: 65, max: 75 };

const H = 3600;

/** The sun and shade feel for one hour of an Open-Meteo hourly block. */
function feelAt(hourly, i) {
  const T = hourly.temperature_2m[i];
  const RH = hourly.relative_humidity_2m[i];
  const W = hourly.wind_speed_10m[i];
  if (![T, RH, W].every(Number.isFinite)) return null;
  const shade = VibeModel.shadeVibeOf(T, RH, W, CALIBRATION);
  const solar = VibeModel.solarFromUVandCloud(
    {
      uv_index: hourly.uv_index?.[i],
      uv_index_clear_sky: hourly.uv_index_clear_sky?.[i],
      is_day: hourly.is_day?.[i],
      cloud_cover: hourly.cloud_cover?.[i],
      shortwave_radiation: hourly.shortwave_radiation?.[i],
      direct_radiation: hourly.direct_radiation?.[i],
    },
    CALIBRATION
  );
  return { shade, sun: VibeModel.sunVibeOf(shade, solar, REFLECTIVITY, CALIBRATION) };
}

// Dangerous heat: the NWS heat index's Danger level (dogs.js NWS_DANGER_HI_F).
export const DANGER_HI_F = 103;
// Thunderstorms: the weather codes the page reads as storms (scripts.js).
export const isStormCode = (c) => Number.isFinite(c) && c >= 95 && c <= 99;

/**
 * The card's numbers from an Open-Meteo forecast (timeformat=unixtime,
 * timezone=auto, fahrenheit, mph): now, the next 24 hours, touch grass, and
 * the one alert that matters most, if any.
 */
export function previewData(forecast, nowSec) {
  const hourly = forecast.hourly;
  const times = hourly.time;
  const zone = forecast.timezone || "UTC";
  const points = [];
  for (let i = 0; i < times.length; i++) {
    const f = feelAt(hourly, i);
    if (!f) continue;
    points.push({
      t: times[i],
      ...f,
      day: hourly.is_day?.[i] === 1,
      code: hourly.weathercode?.[i],
      hi: VibeWeather.heatIndexOrNull(hourly.temperature_2m[i], hourly.relative_humidity_2m[i]),
    });
  }
  const at = (t) => {
    for (let k = 0; k + 1 < points.length; k++) {
      const a = points[k];
      const b = points[k + 1];
      if (t >= a.t && t <= b.t) {
        const f = (t - a.t) / (b.t - a.t);
        return { sun: a.sun + (b.sun - a.sun) * f, shade: a.shade + (b.shade - a.shade) * f };
      }
    }
    return null;
  };
  const now = at(nowSec);
  if (!now) return null;
  const next = points.filter((p) => p.t >= nowSec - H && p.t <= nowSec + 24 * H);
  const hourNow = points.filter((p) => p.t <= nowSec).at(-1);
  const isDayNow = hourNow ? hourNow.day : true;
  const series = next.map((p) => ({ ...p, grass: isGrass(p), storm: isStormCode(p.code), danger: p.hi !== null && p.hi >= DANGER_HI_F }));
  return {
    zone,
    nowSec,
    sunF: Math.round(now.sun),
    shadeF: Math.round(now.shade),
    // Night has no sun term: the two read the same, and the card says so.
    night: !isDayNow,
    condition: hourNow && Number.isFinite(hourNow.code) ? VibeWeather.conditionLabel(hourNow.code, isDayNow) : "",
    series,
    grass: touchGrassLine(series, nowSec, zone),
    alert: alertOf(series, nowSec, zone),
  };
}

const isGrass = (p) => p.day && [p.sun, p.shade].some((v) => v >= TOUCH_GRASS.min && v <= TOUCH_GRASS.max);

/** The first run of hours from now that `ok` holds for, as [start, end) seconds, or null. */
function firstRun(series, nowSec, ok) {
  const ahead = series.filter((p) => p.t + H > nowSec);
  const i = ahead.findIndex(ok);
  if (i < 0) return null;
  let j = i;
  while (j + 1 < ahead.length && ok(ahead[j + 1])) j++;
  return { from: ahead[i].t, to: ahead[j].t + H, hours: ahead.slice(i, j + 1) };
}

/** "until 3 PM" when it has begun, "1 to 6 PM" otherwise. */
function when(run, nowSec, zone) {
  const short = (t) => clock(t, zone).replace(":00", "").replace(/^12 PM$/, "noon").replace(/^12 AM$/, "midnight");
  if (run.from <= nowSec) return `until ${short(run.to)}`;
  const a = short(run.from);
  const b = short(run.to);
  // "1 to 6 PM" when both are in the same half of the day.
  return /[AP]M$/.test(a) && a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} to ${b}` : `${a} to ${b}`;
}

/** One line on touch grass weather in the next 24 hours. */
function touchGrassLine(series, nowSec, zone) {
  const run = firstRun(series, nowSec, (p) => p.grass);
  return run ? `Touch grass ${when(run, nowSec, zone)}` : "No touch grass weather in the next 24 hours";
}

/** The one alert worth the card: storms first, then dangerous heat. */
function alertOf(series, nowSec, zone) {
  const storm = firstRun(series, nowSec, (p) => p.storm);
  if (storm) return { kind: "storm", text: `Thunderstorms ${when(storm, nowSec, zone)}` };
  const heat = firstRun(series, nowSec, (p) => p.danger);
  if (heat) {
    const peak = Math.round(Math.max(...heat.hours.map((p) => p.hi)));
    return { kind: "heat", text: `Dangerous heat ${when(heat, nowSec, zone)}, heat index ${peak}°F` };
  }
  return null;
}

export function clock(sec, zone) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(sec * 1000));
}

/** "Thu, Oct 1 · 8:50 AM EDT", in the place's own zone. */
export function stamp(sec, zone) {
  const d = new Date(sec * 1000);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
  return `${day} · ${time}`;
}

export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The preview's title: short, specific, no site name (Apple TN3156). */
export function previewTitle(zip, place, d) {
  return `${zip} · ${place}: ${d.sunF}°F sun, ${d.shadeF}°F shade`;
}
export function previewDescription(d) {
  // With an alert, a day with no touch grass weather needn't say so too.
  const grass = d.alert && d.grass.startsWith("No ") ? "" : ` ${d.grass}.`;
  return `As of ${stamp(d.nowSec, d.zone)}.${d.alert ? ` ${d.alert.text}.` : ""}${grass}`;
}

const C = { ink: "#0f172a", muted: "#64748b", sun: "#f97316", shade: "#3b82f6", grass: "#22c55e", bg: "#ffffff", panel: "#f1f5f9" };

const SUN_ICON = `<svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="13" fill="${C.sun}"/>${[0, 45, 90, 135, 180, 225, 270, 315]
  .map((a) => {
    const r = (a * Math.PI) / 180;
    return `<line x1="${32 + Math.cos(r) * 19}" y1="${32 + Math.sin(r) * 19}" x2="${32 + Math.cos(r) * 28}" y2="${32 + Math.sin(r) * 28}" stroke="${C.sun}" stroke-width="5" stroke-linecap="round"/>`;
  })
  .join("")}</svg>`;

function header(zip, place, d) {
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%">
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;font-size:64px;font-weight:800;color:${C.ink};line-height:1">${escapeHtml(zip)}</div>
      <div style="display:flex;font-size:34px;font-weight:700;color:${C.muted};margin-top:10px">${escapeHtml(place)}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end">
      <div style="display:flex">${SUN_ICON}</div>
      <div style="display:flex;font-size:30px;font-weight:700;color:${C.ink};margin-top:10px">${escapeHtml(stamp(d.nowSec, d.zone))}</div>
    </div>
  </div>`;
}

const ALERT = {
  storm: { ink: "#ffffff", bg: "#475569", band: "#475569" },
  heat: { ink: "#ffffff", bg: "#b91c1c", band: "#dc2626" },
};

const BOLT = (fill) =>
  `<svg width="30" height="36" viewBox="0 0 24 30"><path d="M14 0 L2 17 H11 L8 30 L22 11 H13 Z" fill="${fill}"/></svg>`;
const THERMO = (fill) =>
  `<svg width="22" height="36" viewBox="0 0 16 30"><rect x="5" y="1" width="6" height="19" rx="3" fill="${fill}"/><circle cx="8" cy="23" r="6" fill="${fill}"/></svg>`;

/** The line under the header: the alert when there is one, touch grass otherwise. */
function noticeLine(d) {
  if (d.alert) {
    const c = ALERT[d.alert.kind];
    const icon = d.alert.kind === "storm" ? BOLT(c.ink) : THERMO(c.ink);
    return `<div style="display:flex;align-items:center;align-self:flex-start;background:${c.bg};color:${c.ink};border-radius:40px;padding:10px 26px 10px 20px;font-size:32px;font-weight:800">
      <div style="display:flex;margin-right:14px">${icon}</div>${escapeHtml(d.alert.text)}</div>`;
  }
  return `<div style="display:flex;align-items:center;font-size:34px;font-weight:800;color:#15803d">
    <div style="display:flex;width:24px;height:24px;border-radius:12px;background:${C.grass};margin-right:16px"></div>${escapeHtml(d.grass)}</div>`;
}

/** The next 24 hours as the chart draws them, the temperatures beside. */
export function card(zip, place, d) {
  const W = 760;
  const Hh = 250;
  const s = d.series;
  const vals = s.flatMap((p) => [p.sun, p.shade]);
  const lo = Math.floor(Math.min(...vals) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...vals) / 5) * 5 + 5;
  const t0 = s[0].t;
  const t1 = s[s.length - 1].t;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => Hh - ((v - lo) / (hi - lo)) * Hh;
  const path = (k) => s.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  // Hour by hour, as the page shades them: night grey, touch grass green and
  // the alert's hours in its colour, rising from the bottom.
  const defs = `<defs>${[["g", C.grass], ["storm", ALERT.storm.band], ["heat", ALERT.heat.band]]
    .map(([id, c]) => `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c}" stop-opacity="0.45"/><stop offset="1" stop-color="${c}" stop-opacity="0.06"/></linearGradient>`)
    .join("")}</defs>`;
  // Each run of like hours as one block, so no seams show between them.
  const runs = (fill, ok) => {
    const out = [];
    for (let i = 0; i + 1 < s.length; i++) {
      if (!ok(s[i])) continue;
      let j = i;
      while (j + 1 < s.length - 1 && ok(s[j + 1])) j++;
      out.push(`<rect x="${x(s[i].t).toFixed(1)}" y="0" width="${(x(s[j + 1].t) - x(s[i].t)).toFixed(1)}" height="${Hh}" fill="${fill}"/>`);
      i = j;
    }
    return out.join("");
  };
  const cells = [
    runs("#e2e8f0", (p) => !p.day),
    runs("url(#storm)", (p) => p.storm),
    runs("url(#heat)", (p) => !p.storm && p.danger),
    runs("url(#g)", (p) => !p.storm && !p.danger && p.grass),
  ];
  const nx = x(d.nowSec);
  const ticks = [6, 12, 18].map((h) => {
    const t = t0 + h * H;
    return `<div style="display:flex;position:absolute;left:${x(t) - 60}px;width:120px;justify-content:center;font-size:24px;color:${C.muted}">${escapeHtml(clock(t, d.zone).replace(":00", ""))}</div>`;
  });
  const svg = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">${defs}${cells.join("")}
    <path d="${path("shade")}" fill="none" stroke="${C.shade}" stroke-width="6" stroke-linejoin="round"/>
    <path d="${path("sun")}" fill="none" stroke="${C.sun}" stroke-width="7" stroke-linejoin="round"/>
    <line x1="${nx}" y1="0" x2="${nx}" y2="${Hh}" stroke="${C.ink}" stroke-width="3" stroke-dasharray="8 7"/>
    <circle cx="${nx}" cy="${y(d.sunF)}" r="10" fill="${C.sun}"/><circle cx="${nx}" cy="${y(d.shadeF)}" r="9" fill="${C.shade}"/></svg>`;
  const side = (label, v, color) => `<div style="display:flex;flex-direction:column;margin-bottom:18px">
      <div style="display:flex;font-size:24px;font-weight:700;letter-spacing:2px;color:${color}">${label}</div>
      <div style="display:flex;font-size:88px;font-weight:800;color:${color};line-height:1">${v}°</div></div>`;
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:44px 56px;background:${C.bg};font-family:Inter">
    ${header(zip, place, d)}
    ${noticeLine(d)}
    <div style="display:flex;align-items:flex-end;width:100%">
      <div style="display:flex;flex-direction:column;width:${W}px">
        <div style="display:flex">${svg}</div>
        <div style="display:flex;position:relative;height:30px;margin-top:6px">${ticks.join("")}</div>
      </div>
      <div style="display:flex;flex-direction:column;margin-left:48px">
        ${d.night ? side("SUN OR SHADE", d.shadeF, C.shade) : side("SUN", d.sunF, C.sun) + side("SHADE", d.shadeF, C.shade)}
      </div>
    </div>
  </div>`;
}
