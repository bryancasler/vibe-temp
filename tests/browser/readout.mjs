// The hover card: under the sun and shade numbers, one line of text that says
// how it feels and only what is out of the ordinary (Bryan, 2026-09-30): no
// 0% rain, no light breeze, no everyday humidity. Needs the site on port 4800.
// Usage: node tests/browser/readout.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
const browser = await launch();
const NOW = "2025-10-17T10:20:00-04:00";
const nowUnix = new Date(NOW).getTime() / 1000;
// Four hours on: rain likely and a strong wind.
const rough = {
  hourly: (u) =>
    u >= nowUnix + 3 * 3600 && u < nowUnix + 6 * 3600
      ? { precipitation: 1, precipitation_probability: 80, weathercode: 63, weather_code: 63, wind_speed_10m: 28 }
      : null,
};

// Hovers the point `hours` after now and returns the card's line and its paragraphs.
async function card(scenario, hours) {
  const { page, t0, errors } = await openApp(browser, { now: NOW, size: "desktop", scenario });
  await waitForChart(page, t0);
  await page.clock.runFor(2500);
  await page.click("#presetDefault");
  await page.clock.runFor(1500);
  const pt = await page.evaluate((ahead) => {
    const ch = Chart.getChart(document.getElementById("vibeChart"));
    const r = ch.canvas.getBoundingClientRect();
    const i = ch._rawLabels.findIndex((t) => t > window.timelineState.now) + ahead;
    return { x: r.left + ch.scales.x.getPixelForValue(i), y: r.top + ch.chartArea.top + 30 };
  }, hours * 4);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(200);
  const out = await page.evaluate(() => ({
    say: document.querySelector("#chartReadout .readout-say")?.textContent || "",
    paras: [...document.querySelectorAll("#chartReadout > p")].map((p) => p.className),
    bits: [...document.querySelectorAll("#chartReadout [data-bit]")].map((b) => b.dataset.bit),
  }));
  await page.context().close();
  return { ...out, errors };
}

{
  const c = await card({}, 4);
  expect("calm: one line under the numbers", c.paras.filter((p) => p !== "readout-when").length === 1, c.paras.join(","));
  expect("calm: starts with the sky and the feel", /^(Sunny|Mostly sunny|Partly cloudy|Overcast|Clear)[^.]*\. \S/.test(c.say), c.say);
  expect("calm: no typical readings (rain 0%, air, humidity, wind)", !/Rain 0%|0% chance|Air \d|Humidity|mph/.test(c.say), c.say);
  expect("calm: no page errors", c.errors.length === 0, c.errors.join("; "));
}
{
  const c = await card(rough, 4);
  expect("rough: the chance of rain is named", /80% chance of rain/.test(c.say), c.say);
  expect("rough: a strong wind is named", /Windy, 28 mph/.test(c.say), c.say);
  expect("rough: the rain is said once", !/rain likely/.test(c.say), c.say);
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
