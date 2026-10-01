// Load performance on a throttled phone: first paint, largest paint, layout
// shift (and what moved), time to the chart. Mocked weather, real static
// files from port 4800 under a slow-4G-like link and 4x CPU slowdown.
// Usage: node tests/browser/perf.mjs [runs] [--json]
import { launch, openApp, waitForChart } from "./harness.mjs";

const runs = Number(process.argv[2] || 3);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const browser = await launch();
const out = [];
for (let i = 0; i < runs; i++) {
  const { context, page } = await openApp(browser, { size: process.env.SIZE || "phone", goto: false, storage: process.env.STORAGE ? JSON.parse(process.env.STORAGE) : null });
  await context.addInitScript(() => {
    window.__perf = { cls: 0, shifts: [], fcp: null, lcp: null, dcl: null };
    document.addEventListener("DOMContentLoaded", () => (window.__perf.dcl = Math.round(performance.now())));
    const name = (n) => (n && n.nodeType === 1 ? n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\s+/).join(".") : "") : "?");
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__perf.cls += e.value;
        window.__perf.shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), by: (e.sources || []).map((s) => name(s.node) + " " + Math.round(s.previousRect.y) + "->" + Math.round(s.currentRect.y) + " h" + Math.round(s.previousRect.height) + "->" + Math.round(s.currentRect.height)).slice(0, 5) });
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__perf.fcp = Math.round(e.startTime);
    }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((l) => {
      const e = l.getEntries().at(-1);
      window.__perf.lcp = { t: Math.round(e.startTime), el: name(e.element) };
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const t0 = Date.now();
  await page.goto("http://localhost:4800/", { waitUntil: "commit" });
  const chart = await waitForChart(page, t0, 90000);
  await page.waitForTimeout(3000);
  const p = await page.evaluate(() => {
    const blocking = performance.getEntriesByType("resource").filter((r) => r.renderBlockingStatus === "blocking").map((r) => r.name.split("/").pop());
    return { ...window.__perf, blocking };
  });
  out.push({ ...p, chart });
  await context.close();
}
await browser.close();
const r = (k) => median(out.map((o) => (typeof o[k] === "object" && o[k] ? o[k].t : o[k])));
const summary = { fcp: r("fcp"), lcp: r("lcp"), lcpEl: out[0].lcp?.el, dcl: r("dcl"), chart: r("chart"), cls: +median(out.map((o) => o.cls)).toFixed(4), blocking: out[0].blocking, shifts: out[0].shifts };
console.log(JSON.stringify(summary, null, 1));
