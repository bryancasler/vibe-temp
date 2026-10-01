// Vibe Temp's link previews (Bryan, 2026-10-01): a Cloudflare Worker in
// front of the GitHub Pages site. Staged, not deployed; see worker/README.md.
//   /?zip=20009   the page as GitHub Pages serves it, with that ZIP's preview tags
//   /og.png?zip=  the preview image, drawn from the ZIP's forecast right now
//   anything else passes straight through to GitHub Pages.
import { ImageResponse } from "workers-og";
import { CARDS, previewData } from "./preview.js";
import { previewTags, variantFrom, zipFrom } from "./meta.js";
import inter400 from "../fonts/inter-latin-400-normal.woff";
import inter700 from "../fonts/inter-latin-700-normal.woff";
import inter800 from "../fonts/inter-latin-800-normal.woff";

const FONTS = [
  { name: "Inter", data: inter400, weight: 400, style: "normal" },
  { name: "Inter", data: inter700, weight: 700, style: "normal" },
  { name: "Inter", data: inter800, weight: 800, style: "normal" },
];
const TIMEOUT_MS = 4000;
// The variant shared links draw until Bryan picks one (then remove the other).
const DEFAULT_VARIANT = "a";

// Both as the page asks for them (scripts.js lookUpZip and fetchForecast).
async function placeFor(zip) {
  const r = await fetch(`https://api.zippopotam.us/us/${zip}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cf: { cacheTtl: 86400 } });
  if (!r.ok) return null;
  const p = (await r.json()).places?.[0];
  if (!p) return null;
  const latitude = parseFloat(p.latitude);
  const longitude = parseFloat(p.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude, place: `${p["place name"]}, ${p["state abbreviation"]}` };
}

async function forecastFor({ latitude, longitude }) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(2),
    longitude: longitude.toFixed(2),
    hourly:
      "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,shortwave_radiation,direct_radiation,is_day,weathercode",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    timeformat: "unixtime",
    past_days: 1,
    forecast_days: 2,
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS), cf: { cacheTtl: 600 } });
  return r.ok ? r.json() : null;
}

async function previewFor(zip) {
  const place = await placeFor(zip);
  if (!place) return null;
  const forecast = await forecastFor(place);
  const data = forecast && previewData(forecast, Math.floor(Date.now() / 1000));
  return data ? { place: place.place, data } : null;
}

async function image(url, ctx) {
  const zip = zipFrom(url.searchParams);
  if (!zip) return new Response("Not found", { status: 404 });
  const cache = caches.default;
  const key = new Request(url.toString());
  const hit = await cache.match(key);
  if (hit) return hit;
  const p = await previewFor(zip);
  if (!p) return Response.redirect(`${url.origin}/apple-touch-icon.png`, 302);
  const res = new ImageResponse(CARDS[variantFrom(url.searchParams, DEFAULT_VARIANT)](zip, p.place, p.data), { width: 1200, height: 630, fonts: FONTS });
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "public, max-age=600");
  ctx.waitUntil(cache.put(key, out.clone()));
  return out;
}

async function page(request, url) {
  const origin = await fetch(request);
  const zip = zipFrom(url.searchParams);
  const html = (origin.headers.get("content-type") || "").includes("text/html");
  if (!zip || !html || !origin.ok) return origin;
  const p = await previewFor(zip).catch(() => null);
  if (!p) return origin;
  const tags = previewTags({ origin: url.origin, pageUrl: url.toString(), zip, place: p.place, data: p.data, variant: variantFrom(url.searchParams, DEFAULT_VARIANT) });
  const res = new HTMLRewriter()
    // The page's own generic tags give way to this ZIP's.
    .on('meta[property^="og:"], meta[name^="twitter:"]', { element: (e) => e.remove() })
    .on("head", { element: (e) => e.append(tags, { html: true }) })
    .transform(origin);
  const out = new Response(res.body, res);
  // Previews are fetched once per send; keep them fresh.
  out.headers.set("Cache-Control", "public, max-age=300");
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return fetch(request);
    if (url.pathname === "/og.png") return image(url, ctx);
    if (url.pathname === "/" || url.pathname === "/index.html") return page(request, url);
    return fetch(request);
  },
};
