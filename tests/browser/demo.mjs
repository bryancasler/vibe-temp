// ?demo: a made-up week that shows every state the chart can draw, from the
// page's own code with no weather requests leaving the page, under a banner,
// with its own storage. Needs the site on port 4800.
// Usage: node tests/browser/demo.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
const browser = await launch();

{
  const { page, t0, errors, log } = await openApp(browser, { size: "desktop", path: "?demo" });
  await waitForChart(page, t0);
  await page.clock.runFor(3000);
  const s = await page.evaluate(() => ({
    banner: document.querySelector(".demo-banner")?.textContent || "",
    active: document.querySelector(".preset-btn.active")?.id,
    legend: [...document.querySelectorAll(".dog-legend-item")].map((l) => l.textContent.trim()),
    keys: Object.keys(localStorage),
    codes: [...new Set(window.timelineState.weathercodeByHour)].sort((a, b) => a - b),
  }));
  expect("banner says the weather is made up", /made-up weather/.test(s.banner), s.banner);
  expect("rain in two hours opens on 6 Hours", s.active === "presetSix", s.active);
  // The whole week names every rating.
  await page.click("#presetWeek");
  await page.clock.runFor(2000);
  s.legend = await page.evaluate(() => [...document.querySelectorAll(".dog-legend-item")].map((l) => l.textContent.trim()));
  // Hours to skip tint the plot in the strip's colour: read each column's strip
  // colour, and the plot's colour near its top, away from the lines.
  const tint = await page.evaluate(() => {
    const ch = Chart.getChart(document.getElementById("vibeChart"));
    const { chartArea: a } = ch;
    const ctx = ch.canvas.getContext("2d");
    const r = ch.canvas.width / ch.canvas.getBoundingClientRect().width;
    const px = (x, y) => ctx.getImageData(Math.round(x * r), Math.round(y * r), 1, 1).data;
    const near = (d, [R, G, B]) => Math.hypot(d[0] - R, d[1] - G, d[2] - B) < 40;
    const sums = { hot: [], cold: [], none: [] };
    const coldLow = [];
    const coldTopA = [];
    for (let x = a.left + 2; x < a.right - 2; x += 3) {
      const strip = px(x, a.bottom + 3 + 16 - 5 - 2);
      const kind = near(strip, [0xd6, 0x48, 0x3a]) ? "hot" : near(strip, [0x02, 0x84, 0xc7]) ? "cold" : strip[3] < 50 ? "none" : null;
      if (!kind) continue;
      // Read near the strip, where the fade is strongest, and near the top.
      const p = px(x, a.bottom - 6);
      sums[kind].push(p[0] - p[2]);
      if (kind === "cold") {
        coldLow.push(p[3]);
        coldTopA.push(px(x, a.top + 4)[3]);
        (sums.coldCols ||= []).push({ low: p[3], top: px(x, a.top + 4)[3] });
        (sums.coldSum ||= []).push(p[0] + p[1] + p[2]);
      }
    }
    const mean = (v) => (v.length ? v.reduce((s, n) => s + n, 0) / v.length : null);
    return { hot: mean(sums.hot), cold: mean(sums.cold), none: mean(sums.none), lowAlpha: mean(coldLow), topAlpha: mean(coldTopA),
      // The strongest and weakest cold columns at the strip, and how much of each is left at the top.
      strong: (sums.coldCols || []).reduce((m, c) => (!m || c.low > m.low ? c : m), null),
      weak: (sums.coldCols || []).reduce((m, c) => (!m || c.low < m.low ? c : m), null), coldSpread: sums.coldSum ? Math.max(...sums.coldSum) - Math.min(...sums.coldSum) : null };
  });
  expect("too-hot hours tint the plot red", tint.hot !== null && tint.hot > tint.none + 8, JSON.stringify(tint));
  // The further past the line, the stronger and flatter: the weakest cold hour fades out toward the
  // top, the strongest keeps more of its tint there (Bryan, 2026-09-30).
  const kept = (c) => (c ? c.top / Math.max(1, c.low) : 0);
  expect("a mild hour fades up from the strip", tint.weak && kept(tint.weak) < 0.5, JSON.stringify(tint.weak));
  expect("an extreme hour is stronger and flatter", tint.strong && tint.strong.low > tint.weak.low + 20 && kept(tint.strong) > kept(tint.weak) + 0.3, JSON.stringify({ strong: tint.strong, weak: tint.weak }));
  // Weather emoji sit on the plot's top edge, none overlapping.
  const sky = await page.evaluate(() => {
    const ch = Chart.getChart(document.getElementById("vibeChart"));
    return { icons: ch._skyIcons || [], top: ch.chartArea.top };
  });
  const overlaps = sky.icons.filter((c, n) => n && c.x0 < sky.icons[n - 1].x1);
  expect("weather emoji don't overlap", sky.icons.length > 3 && overlaps.length === 0, `${sky.icons.length} icons, ${overlaps.length} overlapping`);
  expect("weather emoji sit on the chart's top edge", sky.icons.every((c) => Math.abs(c.bottom - sky.top) <= 2), JSON.stringify(sky.icons.slice(0, 3)));
  expect("the night shading shows through a band", tint.coldSpread !== null && tint.coldSpread > 20, JSON.stringify(tint));
  expect("too-cold hours tint the plot blue", tint.cold !== null && tint.cold < tint.none - 8, JSON.stringify(tint));
  const kinds = ["Getting warm", "Getting cold", "Rain, storms or poor air", "Too hot", "Too cold", "Storms or unhealthy air", "Paw to grass", "Touch grass"];
  const missing = kinds.filter((k) => !s.legend.some((l) => l.includes(k)));
  expect("week: every walk rating, the paw and touch grass appear", missing.length === 0, `missing: ${missing.join(", ")}`);
  const want = [45, 51, 63, 66, 73, 95];
  expect("fog, drizzle, rain, freezing rain, snow and storms in the week", want.every((c) => s.codes.includes(c)), s.codes.join(","));
  expect("no weather request leaves the page", !log.some((l) => /open-meteo|weather\.gov/.test(l.url || l)), log.map((l) => l.url || l).join(" "));
  expect("its own storage only", s.keys.length > 0 && s.keys.every((k) => !k.startsWith("vibe.v1.") || k === "vibe.v1.theme"), s.keys.join(","));
  // The legend names only what the view draws, then one link for the explanations.
  const legendNow = () =>
    page.evaluate(() => ({
      items: [...document.querySelectorAll(".dog-legend-item")].map((l) => l.textContent.trim()),
      notes: document.querySelectorAll(".dog-legend-note").length,
      more: document.querySelector(".chart-how a")?.getAttribute("href"),
      now: document.getElementById("combinedLabel")?.textContent || "",
    }));
  await page.click("#presetSix");
  await page.clock.runFor(1500);
  const six = await legendNow();
  expect("6 hours: the legend leaves out the week's heat and cold", !six.items.some((l) => /Too hot|Too cold|Getting cold/.test(l)), six.items.join(" | "));
  expect("6 hours: the legend names the rain it draws", six.items.some((l) => /Rain, storms or poor air/.test(l)), six.items.join(" | "));
  expect("no explanation paragraphs, one link to them", six.notes === 0 && /^methodology\.html/.test(six.more || ""), JSON.stringify(six));
  const links = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const leg = r("#dogLegend"), how = r(".chart-how a"), credit = r(".data-credit:not(.chart-how) a");
    return { below: how.top >= leg.bottom, rows: credit.top >= how.bottom, left: Math.abs(how.left - leg.left) < 2 && Math.abs(credit.left - leg.left) < 2 };
  });
  expect("the two links sit under the legend, left, one to a row", links.below && links.rows && links.left, JSON.stringify(links));
  expect("the Now card never says 'in sun'", !/in sun\b|in shade\b/.test(six.now), six.now);
  expect("demo: no page errors", errors.length === 0, errors.join("; "));
  await page.context().close();
}
{
  const { page, t0 } = await openApp(browser, { size: "desktop" });
  await waitForChart(page, t0);
  const s = await page.evaluate(() => ({ banner: !!document.querySelector(".demo-banner"), on: window.VibeDemo.on }));
  expect("without ?demo: no banner, demo off", !s.banner && s.on === false, JSON.stringify(s));
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
