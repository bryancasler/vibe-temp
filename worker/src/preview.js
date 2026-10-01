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

/**
 * The card's numbers from an Open-Meteo forecast (timeformat=unixtime,
 * timezone=auto, fahrenheit, mph): now, the next 24 hours, and touch grass.
 */
export function previewData(forecast, nowSec) {
  const hourly = forecast.hourly;
  const times = hourly.time;
  const zone = forecast.timezone || "UTC";
  const points = [];
  for (let i = 0; i < times.length; i++) {
    const f = feelAt(hourly, i);
    if (f) points.push({ t: times[i], ...f, day: hourly.is_day?.[i] === 1, code: hourly.weathercode?.[i] });
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
  return {
    zone,
    nowSec,
    sunF: Math.round(now.sun),
    shadeF: Math.round(now.shade),
    // Night has no sun term: the two read the same, and the card says so.
    night: !isDayNow,
    condition: hourNow && Number.isFinite(hourNow.code) ? VibeWeather.conditionLabel(hourNow.code, isDayNow) : "",
    series: next.map((p) => ({ t: p.t, sun: p.sun, shade: p.shade, day: p.day })),
    grass: touchGrassLine(next, nowSec, zone),
  };
}

/** One line on touch grass weather in the next 24 hours, or a fallback. */
function touchGrassLine(series, nowSec, zone) {
  const ok = (p) => p.day && [p.sun, p.shade].some((v) => v >= TOUCH_GRASS.min && v <= TOUCH_GRASS.max);
  const ahead = series.filter((p) => p.t >= nowSec - H);
  const startI = ahead.findIndex(ok);
  if (startI < 0) return "No touch grass weather in the next 24 hours";
  let endI = startI;
  while (endI + 1 < ahead.length && ok(ahead[endI + 1])) endI++;
  const end = ahead[endI].t + H;
  if (ahead[startI].t <= nowSec) return `Touch grass weather until ${clock(end, zone)}`;
  return `Touch grass weather from ${clock(ahead[startI].t, zone)} to ${clock(end, zone)}`;
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
  return `As of ${stamp(d.nowSec, d.zone)}. ${d.grass}.`;
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

/** A: the two temperatures, huge. */
export function cardA(zip, place, d) {
  const big = (label, v, color) => `<div style="display:flex;flex-direction:column;align-items:flex-start;flex:1">
      <div style="display:flex;font-size:30px;font-weight:700;letter-spacing:3px;color:${color}">${label}</div>
      <div style="display:flex;font-size:170px;font-weight:800;color:${color};line-height:1">${v}°F</div>
    </div>`;
  const temps = d.night
    ? big("NIGHT · SUN OR SHADE", d.shadeF, C.shade)
    : `${big("IN THE SUN", d.sunF, C.sun)}${big("IN THE SHADE", d.shadeF, C.shade)}`;
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:56px 64px;background:${C.bg};font-family:Inter">
    ${header(zip, place, d)}
    <div style="display:flex;width:100%">${temps}</div>
    <div style="display:flex;align-items:center;font-size:34px;font-weight:700;color:#15803d">
      <div style="display:flex;width:22px;height:22px;border-radius:11px;background:${C.grass};margin-right:16px"></div>${escapeHtml(d.grass)}${d.condition ? `<span style="color:${C.muted};font-weight:400;margin-left:16px">· ${escapeHtml(d.condition)}</span>` : ""}
    </div>
  </div>`;
}

/** B: the next 24 hours as the chart draws them, the temperatures beside. */
export function cardB(zip, place, d) {
  const W = 760;
  const Hh = 300;
  const s = d.series;
  const vals = s.flatMap((p) => [p.sun, p.shade]);
  const lo = Math.floor(Math.min(...vals, TOUCH_GRASS.min) / 5) * 5 - 5;
  const hi = Math.ceil(Math.max(...vals, TOUCH_GRASS.max) / 5) * 5 + 5;
  const t0 = s[0].t;
  const t1 = s[s.length - 1].t;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => Hh - ((v - lo) / (hi - lo)) * Hh;
  const path = (k) => s.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const nights = [];
  for (let i = 0; i + 1 < s.length; i++) if (!s[i].day) nights.push(`<rect x="${x(s[i].t)}" y="0" width="${x(s[i + 1].t) - x(s[i].t) + 0.5}" height="${Hh}" fill="#e2e8f0"/>`);
  const band = `<rect x="0" y="${y(TOUCH_GRASS.max)}" width="${W}" height="${y(TOUCH_GRASS.min) - y(TOUCH_GRASS.max)}" fill="${C.grass}" fill-opacity="0.18"/>`;
  const nx = x(d.nowSec);
  const ticks = [6, 12, 18].map((h) => {
    const t = t0 + h * H;
    return `<div style="display:flex;position:absolute;left:${x(t) - 60}px;width:120px;justify-content:center;font-size:24px;color:${C.muted}">${escapeHtml(clock(t, d.zone).replace(":00", ""))}</div>`;
  });
  const svg = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">${nights.join("")}${band}
    <path d="${path("shade")}" fill="none" stroke="${C.shade}" stroke-width="6" stroke-linejoin="round"/>
    <path d="${path("sun")}" fill="none" stroke="${C.sun}" stroke-width="7" stroke-linejoin="round"/>
    <line x1="${nx}" y1="0" x2="${nx}" y2="${Hh}" stroke="${C.grass}" stroke-width="4" stroke-dasharray="10 8"/>
    <circle cx="${nx}" cy="${y(d.sunF)}" r="10" fill="${C.sun}"/><circle cx="${nx}" cy="${y(d.shadeF)}" r="9" fill="${C.shade}"/></svg>`;
  const side = (label, v, color) => `<div style="display:flex;flex-direction:column;margin-bottom:22px">
      <div style="display:flex;font-size:24px;font-weight:700;letter-spacing:2px;color:${color}">${label}</div>
      <div style="display:flex;font-size:92px;font-weight:800;color:${color};line-height:1">${v}°</div></div>`;
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:48px 56px;background:${C.bg};font-family:Inter">
    ${header(zip, place, d)}
    <div style="display:flex;align-items:flex-end;width:100%">
      <div style="display:flex;flex-direction:column;width:${W}px">
        <div style="display:flex">${svg}</div>
        <div style="display:flex;position:relative;height:34px;margin-top:8px">${ticks.join("")}</div>
      </div>
      <div style="display:flex;flex-direction:column;margin-left:48px">
        ${d.night ? side("SUN OR SHADE", d.shadeF, C.shade) : side("SUN", d.sunF, C.sun) + side("SHADE", d.shadeF, C.shade)}
      </div>
    </div>
  </div>`;
}

export const CARDS = { a: cardA, b: cardB };
