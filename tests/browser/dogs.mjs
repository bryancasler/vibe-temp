// Dogs mode's walk strip under the chart: good hours draw nothing, only the
// hours that need care (Bryan, 2026-09-30), and the legend names only those.
// Needs the site on port 4800.
// Usage: node tests/browser/dogs.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
const browser = await launch();
const NOW = "2025-10-17T10:20:00-04:00";
const nowUnix = new Date(NOW).getTime() / 1000;
// Rain from three hours on, for three hours: flagged hours among good ones.
const rain = {
  hourly: (u) =>
    u >= nowUnix + 3 * 3600 && u < nowUnix + 6 * 3600
      ? { precipitation: 1.2, precipitation_probability: 90, weathercode: 63, weather_code: 63 }
      : null,
};

// Counts the strip row's pixels by colour: the good green, the caution yellow, anything else drawn.
const strip = (page) =>
  page.evaluate(() => {
    const ch = Chart.getChart(document.getElementById("vibeChart"));
    const { chartArea } = ch;
    const ratio = ch.canvas.width / ch.canvas.getBoundingClientRect().width;
    const ctx = ch.canvas.getContext("2d");
    // The strip is 11px from 3px under the plot; its bars stand on its floor, so read just above it.
    const y = Math.floor((chartArea.bottom + 3 + 16 - 5 - 2) * ratio);
    const x0 = Math.round(chartArea.left * ratio);
    const w = Math.round((chartArea.right - chartArea.left) * ratio);
    const d = ctx.getImageData(x0, y, w, 1).data;
    const near = (i, [r, g, b]) => Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b) < 30;
    let good = 0;
    let caution = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      if (near(i, [0x7c, 0xae, 0x7a])) good++;
      else if (near(i, [0xd4, 0xa8, 0x53])) caution++;
    }
    const legend = [...document.querySelectorAll(".dog-legend-item")].map((li) => li.textContent.trim());
    return { good, caution, legend };
  });

for (const [name, scenario] of [["calm", {}], ["rain", rain]]) {
  const { page, t0, errors } = await openApp(browser, { now: NOW, size: "desktop", storage: { "vibe.v1.dogs": "true" }, scenario });
  await waitForChart(page, t0);
  await page.clock.runFor(2500);
  // Stay on 24 hours so the rain is in view either way.
  await page.click("#presetDefault");
  await page.clock.runFor(1500);
  const s = await strip(page);
  expect(`${name}: no green bars under the chart`, s.good === 0, `${s.good} green px`);
  expect(`${name}: no "Good for a walk" in the legend`, !s.legend.some((t) => /Good for a walk/.test(t)), s.legend.join(" | "));
  if (name === "rain") {
    expect("rain: the rainy hours still draw their bars", s.caution > 20, `${s.caution} yellow px`);
    expect("rain: the legend names them", s.legend.some((t) => /Rain, storms or poor air/.test(t)), s.legend.join(" | "));
  }
  expect(`${name}: no page errors`, errors.length === 0, errors.join("; "));
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
