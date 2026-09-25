// Time from navigation (or ZIP entry) to a visible chart, cold and warm,
// under simulated latencies. Usage: node tests/browser/timing.mjs [runs]
import { launch, openApp, waitForChart, PROFILES } from "./harness.mjs";

const runs = Number(process.argv[2] || 3);
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

async function scenario(browser, name, profileName, { zip = null } = {}) {
  const cold = [];
  const warm = [];
  const typed = [];
  for (let i = 0; i < runs; i++) {
    const storage = zip ? { vibeZip: zip } : null;
    const a = await openApp(browser, { profile: PROFILES[profileName], storage, geo: zip ? null : undefined });
    cold.push(await waitForChart(a.page, a.t0, 90000).catch(() => NaN));
    // Warm: same browser profile, a fresh load.
    const t1 = Date.now();
    await a.page.reload({ waitUntil: "commit" });
    warm.push(await waitForChart(a.page, t1, 90000).catch(() => NaN));
    // Typing a new ZIP once the page is up.
    await a.page.waitForTimeout(500);
    const before = await a.page.evaluate(() => (window.__ts = window.timelineState, 1));
    const input = a.page.locator("#chartLocation");
    await input.fill("");
    const t2 = Date.now();
    await input.pressSequentially("90012");
    await a.page
      .waitForFunction(() => window.timelineState && window.timelineState !== window.__ts, null, { timeout: 90000, polling: 25 })
      .then(() => typed.push(Date.now() - t2), () => typed.push(NaN));
    void before;
    await a.context.close();
  }
  const r = { name, profile: profileName, coldMs: median(cold), warmMs: median(warm), zipTypedMs: median(typed), cold, warm, typed };
  console.log(JSON.stringify(r));
  return r;
}

const browser = await launch();
const out = [];
for (const p of ["fast", "badProxy"]) {
  out.push(await scenario(browser, "geolocation", p));
  out.push(await scenario(browser, "saved ZIP", p, { zip: "20001" }));
}
await browser.close();
console.table(out.map(({ name, profile, coldMs, warmMs, zipTypedMs }) => ({ name, profile, coldMs, warmMs, zipTypedMs })));
