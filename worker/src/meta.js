// The tags a shared link's preview reads (Bryan, 2026-10-01), per Apple's
// TN3156: og:title short and specific with no site name (og:site_name has
// it), og:image at least 900px wide, all in the HTML (previews run no
// JavaScript). Pure, so tests/preview.test.mjs checks them.
import { escapeHtml, previewDescription, previewTitle } from "./preview.js";

/** A five-digit ZIP from the address, or null. Nothing else gets through. */
export function zipFrom(params) {
  const z = (params.get("zip") || "").trim();
  return /^\d{5}$/.test(z) ? z : null;
}

/** The variant to draw: a or b, a by default. */
export function variantFrom(params, fallback = "a") {
  const v = params.get("v");
  return v === "a" || v === "b" ? v : fallback;
}

/** Ten-minute buckets: the image URL changes with them, so no cache serves an old one long. */
export const bucketOf = (sec) => Math.floor(sec / 600);

export function previewTags({ origin, pageUrl, zip, place, data, variant = "a" }) {
  const image = `${origin}/og.png?zip=${zip}&v=${variant}&t=${bucketOf(data.nowSec)}`;
  const title = previewTitle(zip, place, data);
  const desc = previewDescription(data);
  const tag = (attr, key, value) => `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  return [
    tag("property", "og:site_name", "Vibe Temp"),
    tag("property", "og:type", "website"),
    tag("property", "og:url", pageUrl),
    tag("property", "og:title", title),
    tag("property", "og:description", desc),
    tag("property", "og:image", image),
    tag("property", "og:image:width", "1200"),
    tag("property", "og:image:height", "630"),
    tag("property", "og:image:alt", `${title}. ${desc}`),
    tag("name", "twitter:card", "summary_large_image"),
  ].join("\n    ");
}
