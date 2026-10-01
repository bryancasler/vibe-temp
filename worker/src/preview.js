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
    sunEvents: sunEventsIn(forecast.daily, series),
    grass: touchGrassLine(series, nowSec, zone),
    alert: alertOf(series, nowSec, zone),
  };
}

/** Sunrises and sunsets inside the chart's hours, with the sun line's value there. */
function sunEventsIn(daily, series) {
  if (!daily || series.length < 2) return [];
  const t0 = series[0].t;
  const t1 = series[series.length - 1].t;
  const out = [];
  for (const [kind, list] of [["Sunrise", daily.sunrise], ["Sunset", daily.sunset]]) {
    for (const t of list || []) {
      if (!Number.isFinite(t) || t <= t0 || t >= t1) continue;
      const k = series.findIndex((p, i) => i + 1 < series.length && p.t <= t && series[i + 1].t >= t);
      const a = series[k];
      const b = series[k + 1];
      out.push({ kind, t, sun: a.sun + ((b.sun - a.sun) * (t - a.t)) / (b.t - a.t) });
    }
  }
  return out.sort((x, y) => x.t - y.t);
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

function header(zip, place, d, logoSvg) {
  // The brand top right; the time sits under the place, where it reads with
  // the ZIP it belongs to (Bryan, 2026-10-01).
  const logo = logoSvg ? `<img src="data:image/svg+xml;base64,${toBase64(logoSvg)}" style="width:64px;height:64px;margin-left:18px"/>` : "";
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%">
    <div style="display:flex;flex-direction:column">
      <div style="display:flex;font-size:64px;font-weight:800;color:${C.ink};line-height:1">${escapeHtml(zip)}</div>
      <div style="display:flex;font-size:32px;font-weight:700;color:${C.muted};margin-top:10px">${escapeHtml(place)} · ${escapeHtml(stamp(d.nowSec, d.zone))}</div>
    </div>
    <div style="display:flex;align-items:center">
      <div style="display:flex;font-size:44px;font-weight:800;color:${C.ink}">VibeTemp</div>${logo}
    </div>
  </div>`;
}

/** Base64 of an ASCII string, in a Worker (btoa) or Node (Buffer). */
const toBase64 = (str) => (typeof btoa === "function" ? btoa(str) : Buffer.from(str).toString("base64"));

const ALERT = {
  storm: { ink: "#ffffff", bg: "#475569", band: "#475569" },
  heat: { ink: "#ffffff", bg: "#b91c1c", band: "#dc2626" },
};

const BOLT = (fill) =>
  `<svg width="30" height="36" viewBox="0 0 24 30"><path d="M14 0 L2 17 H11 L8 30 L22 11 H13 Z" fill="${fill}"/></svg>`;
const THERMO = (fill) =>
  `<svg width="22" height="36" viewBox="0 0 16 30"><rect x="5" y="1" width="6" height="19" rx="3" fill="${fill}"/><circle cx="8" cy="23" r="6" fill="${fill}"/></svg>`;

/** A small sun, with white around it so it stands off the line. */
function sunMark(cx, cy) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `<line x1="${(cx + Math.cos(r) * 13).toFixed(1)}" y1="${(cy + Math.sin(r) * 13).toFixed(1)}" x2="${(cx + Math.cos(r) * 19).toFixed(1)}" y2="${(cy + Math.sin(r) * 19).toFixed(1)}" stroke="${C.sun}" stroke-width="4" stroke-linecap="round"/>`;
    })
    .join("");
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="21" fill="#ffffff"/>${rays}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="9" fill="${C.sun}"/>`;
}

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
export function card(zip, place, d, logoSvg = "") {
  // The chart takes the width the temperatures leave, so they sit flush right.
  const SIDE = 190;
  const W = 1088 - SIDE - 36;
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
  // Hour by hour, as the page shades them: touch grass green and the alert's
  // hours in its colour, rising from the bottom. Night isn't shaded; the
  // sunrise and sunset suns on the line mark it (Bryan, 2026-10-01).
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
    <circle cx="${nx}" cy="${y(d.sunF)}" r="10" fill="${C.sun}"/><circle cx="${nx}" cy="${y(d.shadeF)}" r="9" fill="${C.shade}"/>
    ${d.sunEvents.map((e) => sunMark(x(e.t), y(e.sun))).join("")}</svg>`;
  // Each sun's label where it covers the lines least (Bryan, 2026-10-01):
  // above, below, or to either side of its sun, kept inside the chart, the
  // spot crossing the fewest stretches of either line winning (above first
  // on a full tie). The text is about 13px a character at this size.
  const LH = 30;
  const covers = (bx, by, bw) => {
    let n = 0;
    for (let px = bx; px <= bx + bw; px += 6) {
      const t = t0 + (px / W) * (t1 - t0);
      const k = s.findIndex((p, i) => i + 1 < s.length && p.t <= t && s[i + 1].t >= t);
      if (k < 0) continue;
      const f = (t - s[k].t) / (s[k + 1].t - s[k].t);
      for (const key of ["sun", "shade"]) {
        const ly = y(s[k][key] + (s[k + 1][key] - s[k][key]) * f);
        if (ly > by - 6 && ly < by + LH + 6) n++;
      }
    }
    return n;
  };
  // The shaded stretches (touch grass, storms, heat), as x ranges.
  const shaded = [];
  for (let i = 0; i + 1 < s.length; i++) {
    const p = s[i];
    if (!(p.storm || p.danger || p.grass)) continue;
    let j = i;
    while (j + 1 < s.length - 1 && (s[j + 1].storm || s[j + 1].danger || s[j + 1].grass)) j++;
    shaded.push([x(p.t), x(s[j + 1].t)]);
    i = j;
  }
  const onShade = (bx, bw) => shaded.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, bx + bw) - Math.max(a, bx)), 0);
  const labels = d.sunEvents.map((e) => {
    const text = `${e.kind} ${clock(e.t, d.zone)}`;
    const bw = text.length * 13 + 8;
    const cx = x(e.t);
    const cy = y(e.sun);
    const spots = [
      [cx - bw / 2, cy - 30 - LH],
      [cx - bw / 2, cy + 28],
      [cx - bw - 26, cy - LH / 2],
      [cx + 26, cy - LH / 2],
      [cx - bw - 10, cy - 26 - LH],
      [cx + 10, cy - 26 - LH],
      [cx - bw - 10, cy + 24],
      [cx + 10, cy + 24],
    ].map(([bx, by]) => [Math.min(W - bw, Math.max(0, bx)), Math.min(Hh - LH, Math.max(0, by))]);
    // Fewest line crossings first; among those, the least over shading, so
    // the label sits in the white when it can (Bryan, 2026-10-01).
    let best = spots[0];
    let bestScore = [Infinity, Infinity];
    for (const [bx, by] of spots) {
      // Never over the sun itself.
      if (bx < cx + 22 && bx + bw > cx - 22 && by < cy + 22 && by + LH > cy - 22) continue;
      const score = [covers(bx, by, bw), onShade(bx, bw)];
      if (score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) [best, bestScore] = [[bx, by], score];
    }
    return `<div style="display:flex;position:absolute;left:${best[0].toFixed(0)}px;top:${best[1].toFixed(0)}px;width:${bw}px;height:${LH}px;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:${C.ink}">${escapeHtml(text)}</div>`;
  });
  const side = (label, v, color) => `<div style="display:flex;flex-direction:column;margin-bottom:18px">
      <div style="display:flex;font-size:24px;font-weight:700;letter-spacing:2px;color:${color}">${label}</div>
      <div style="display:flex;font-size:88px;font-weight:800;color:${color};line-height:1">${v}°</div></div>`;
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:44px 56px;background:${C.bg};font-family:Inter">
    ${header(zip, place, d, logoSvg)}
    ${noticeLine(d)}
    <div style="display:flex;align-items:flex-end;width:100%">
      <div style="display:flex;flex-direction:column;width:${W}px">
        <div style="display:flex;position:relative">${svg}${labels.join("")}</div>
        <div style="display:flex;position:relative;height:30px;margin-top:6px">${ticks.join("")}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;width:${SIDE}px;margin-left:36px">
        ${d.night ? side("SUN OR SHADE", d.shadeF, C.shade) : side("SUN", d.sunF, C.sun) + side("SHADE", d.shadeF, C.shade)}
      </div>
    </div>
  </div>`;
}
