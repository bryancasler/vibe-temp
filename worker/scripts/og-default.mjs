// Draws og-default.png, the preview for a link with no ZIP (Bryan,
// 2026-10-01), from the same card the Worker draws for a ZIP.
// Usage: cd worker && npm run og-default
import { readFileSync, writeFileSync } from "node:fs";
import satori from "satori";
import { html } from "satori-html";
import { Resvg } from "@resvg/resvg-js";
import { card, genericData } from "../src/preview.js";

const here = (p) => new URL(p, import.meta.url);
const font = (w) => ({ name: "Inter", weight: w, style: "normal", data: readFileSync(here(`../fonts/inter-latin-${w}-normal.woff`)) });
const logo = readFileSync(here("../../favicon.svg"), "utf8");
const svg = await satori(html(card("", "", genericData(), logo, { generic: true })), {
  width: 1200,
  height: 630,
  fonts: [font(400), font(700), font(800)],
});
writeFileSync(here("../../og-default.png"), new Resvg(svg).render().asPng());
console.log("wrote og-default.png");
