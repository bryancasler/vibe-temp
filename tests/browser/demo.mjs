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
      more: document.querySelector(".dog-legend-more a")?.getAttribute("href"),
      now: document.getElementById("combinedLabel")?.textContent || "",
    }));
  await page.click("#presetSix");
  await page.clock.runFor(1500);
  const six = await legendNow();
  expect("6 hours: the legend leaves out the week's heat and cold", !six.items.some((l) => /Too hot|Too cold|Getting cold/.test(l)), six.items.join(" | "));
  expect("6 hours: the legend names the rain it draws", six.items.some((l) => /Rain, storms or poor air/.test(l)), six.items.join(" | "));
  expect("no explanation paragraphs, one link to them", six.notes === 0 && /^methodology\.html/.test(six.more || ""), JSON.stringify(six));
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
