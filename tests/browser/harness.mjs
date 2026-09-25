// Opens Vibe Temp in Chromium against the mocks, with the page's clock set to
// a fixed moment in 2025 (the fixture's year).
//
// Needs the site served on http://localhost:4800 (python3 -m http.server 4800
// from the repo root) and Playwright, local or global (npm i -g playwright).

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { installMocks, PROFILES, ZIPS } from "./mock-apis.mjs";

export const BASE = process.env.VIBE_BASE || "http://localhost:4800/";
export { PROFILES, ZIPS };

export const VIEWPORTS = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 900 },
};

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    return require(join(execSync("npm root -g").toString().trim(), "playwright"));
  }
}
const { chromium } = loadPlaywright();

export async function launch() {
  return chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
}

const zoneOf = (lat, lon) => {
  for (const z of Object.values(ZIPS)) {
    if (z && Math.abs(z.lat - lat) < 0.2 && Math.abs(z.lon - lon) < 0.2) return z.zone;
  }
  return "America/New_York";
};

/**
 * @param {object} o
 * @param {string} o.now ISO instant the page's clock starts at
 * @param {"phone"|"desktop"} o.size
 * @param {"dark"|"light"} o.scheme the browser's preference (the app follows it)
 * @param {string} o.tz the viewer's time zone
 * @param {object|null} o.geo coordinates the browser reports, or null to deny
 * @param {object} o.storage localStorage entries to seed
 */
export async function openApp(browser, o = {}) {
  const {
    now = "2025-10-17T10:20:00-04:00",
    size = "phone",
    scheme = "dark",
    tz = "America/New_York",
    geo = { latitude: 38.9122, longitude: -77.0177 },
    profile = PROFILES.fast,
    scenario = {},
    storage = null,
    path = "",
    context: existing = null,
    goto = true,
  } = o;
  const context =
    existing ||
    (await browser.newContext({
      viewport: VIEWPORTS[size],
      deviceScaleFactor: size === "phone" ? 2 : 1,
      colorScheme: scheme,
      timezoneId: tz,
      locale: "en-US",
      geolocation: geo || undefined,
      permissions: geo ? ["geolocation"] : [],
      hasTouch: size === "phone",
      isMobile: false,
    }));
  const nowUnix = Math.floor(new Date(now).getTime() / 1000);
  let log = [];
  if (!existing) {
    await context.clock.install({ time: new Date(now) });
    log = await installMocks(context, { nowUnix, profile, scenario, zoneFor: zoneOf });
    context._mockLog = log;
    if (storage) {
      await context.addInitScript((entries) => {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      }, storage);
    }
  } else {
    log = existing._mockLog;
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.stack ? e.stack.split("\n")[0] : e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  let t0 = Date.now();
  if (goto) {
    t0 = Date.now();
    await page.goto(BASE + path, { waitUntil: "commit" });
  }
  return { context, page, log, errors, t0 };
}

/** Resolves when the chart is on screen with data; returns ms since t0. */
export async function waitForChart(page, t0, timeout = 60000) {
  await page.waitForFunction(
    () => {
      const c = document.querySelector("#vibeChart");
      const s = document.querySelector("#chartSkeleton");
      return (
        !!window.timelineState &&
        c &&
        getComputedStyle(c).display !== "none" &&
        (!s || getComputedStyle(s).display === "none")
      );
    },
    null,
    { timeout, polling: 25 }
  );
  return Date.now() - t0;
}

export async function shot(page, file) {
  await page.screenshot({ path: file, fullPage: true });
}
