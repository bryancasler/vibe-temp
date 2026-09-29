// ?labs: the chart's lines turn green where their own values are touch grass
// weather (daylight, 65-75°F or 18-24°C), in place of the leaf; a line that is
// too warm keeps its colour while the other goes green. Labs stays in the
// address. Needs the site on port 4800.
// Usage: node tests/browser/labs.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
const browser = await launch();

// Picks three moments from the chart's own data, then reads what colour each line is drawn there:
// "sun": the sun line is touch grass weather; "shadeOnly": the shade line is, and the sun line too warm;
// "neither": a daylight moment below the range. Each is the middle of a run of five such points,
// with the lines well apart, away from the marks.
const read = (page) =>
  page.evaluate(() => {
    const ch = Chart.getChart(document.getElementById("vibeChart"));
    const { scales, chartArea } = ch;
    const sun = ch.data.datasets[0].data;
    const shade = ch.data.datasets[1].data;
    const day = ch._isDayByHour || [];
    const [lo, hi] = /°C/.test(document.body.innerText.slice(0, 4000)) && sun.every((v) => v < 45) ? [18, 24] : [65, 75];
    const inR = (v) => v >= lo && v <= hi;
    const x = (i) => scales.x.getPixelForValue(i);
    const shown = (i) => x(i) > chartArea.left + 20 && x(i) < chartArea.right - 20;
    const apart = (i) => Math.abs(scales.y.getPixelForValue(sun[i]) - scales.y.getPixelForValue(shade[i])) > 10;
    const run = (test) => {
      for (let i = 2; i < sun.length - 2; i++) {
        if (!shown(i) || !apart(i)) continue;
        if ([-2, -1, 0, 1, 2].every((d) => test(i + d))) return i;
      }
      return null;
    };
    const picks = {
      sun: run((i) => day[i] && inR(sun[i])),
      shadeOnly: run((i) => day[i] && inR(shade[i]) && sun[i] > hi + 1),
      neither: run((i) => day[i] && sun[i] < lo - 1 && shade[i] < lo - 1),
    };
    const canvas = ch.canvas;
    const ratio = canvas.width / canvas.getBoundingClientRect().width;
    const px = canvas.getContext("2d");
    const hex = (h) => {
      const n = parseInt(h.trim().replace("#", ""), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const colours = {
      green: hex(getComputedStyle(document.documentElement).getPropertyValue("--leaf")),
      sun: hex(JSON.parse(localStorage.getItem("vibe.v1.chartColors") || "null")?.sun?.start || "#ffb86b"),
      shade: hex(JSON.parse(localStorage.getItem("vibe.v1.chartColors") || "null")?.shade?.start || "#6ea8fe"),
    };
    // The colour nearest one of the three, within 3px of where the line runs, at point i or a fraction on
    // from it (the line's height read straight between the points).
    const colourAt = (i, data) => {
      const j = Math.floor(i);
      const f = i - j;
      const v = f ? data[j] + (data[j + 1] - data[j]) * f : data[j];
      const cx = Math.round(x(i) * ratio);
      const cy = Math.round(scales.y.getPixelForValue(v) * ratio);
      let best = null;
      for (let dy = -3 * ratio; dy <= 3 * ratio; dy++) {
        const [r, g, b] = px.getImageData(cx, cy + dy, 1, 1).data;
        for (const [name, c] of Object.entries(colours)) {
          const d = Math.hypot(r - c[0], g - c[1], b - c[2]);
          if (!best || d < best.d) best = { name, d };
        }
      }
      return best && best.d < 60 ? best.name : "other";
    };
    // Each line's colour, the same at five spots from a point before to a point after, or "mixed".
    const at = (i) => {
      if (i === null) return null;
      const one = (data) => {
        const seen = new Set([-1, -0.5, 0, 0.5, 1].map((d) => colourAt(i + d, data)));
        return seen.size === 1 ? [...seen][0] : `mixed ${[...seen].join("/")}`;
      };
      return { sun: one(sun), shade: one(shade) };
    };
    return {
      picks,
      sun: at(picks.sun),
      shadeOnly: at(picks.shadeOnly),
      neither: at(picks.neither),
      leafMarks: (ch._touchGrassPositions || []).length,
      leafPills: (ch._pillLayout || []).length - (ch._pawLayout || []).length,
      legendGreen: !!document.querySelector(".dog-legend-green"),
      legendLeaf: !!document.querySelector(".dog-legend-leaf"),
    };
  });

const open = async (path, o = {}) => {
  const { page, t0, errors } = await openApp(browser, { size: "desktop", scheme: "dark", path, storage: { "vibe.v1.dogs": "true" }, ...o });
  await waitForChart(page, t0);
  await page.waitForTimeout(500);
  return { page, errors };
};

// Labs on
{
  const { page, errors } = await open("?labs");
  const r = await read(page);
  expect("the day has a stretch of each kind to test", r.picks.sun !== null && r.picks.shadeOnly !== null && r.picks.neither !== null, JSON.stringify(r.picks));
  expect("where the sun line is touch grass weather, it turns green", r.sun?.sun === "green", JSON.stringify(r.sun));
  expect(
    "where only the shade is, the shade line turns green and the sun line keeps its colour",
    r.shadeOnly?.shade === "green" && r.shadeOnly?.sun === "sun",
    JSON.stringify(r.shadeOnly)
  );
  expect("below the range both keep their colours", r.neither?.sun === "sun" && r.neither?.shade === "shade", JSON.stringify(r.neither));
  expect("no leaf, and no leaf time", r.leafMarks === 0 && r.leafPills === 0, `${r.leafMarks} ${r.leafPills}`);
  expect("the legend shows the green line, not the leaf", r.legendGreen && !r.legendLeaf);
  // Labs stays in the address: after a highlight is shared, and after the ZIP is cleared.
  const b = await page.locator("#vibeChart").boundingBox();
  const y = b.y + b.height * 0.45;
  await page.mouse.move(b.x + b.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width * (0.3 + 0.03 * i), y);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const shared = await page.evaluate(() => location.search);
  expect("a shared highlight's link keeps labs", /start=/.test(shared) && /[?&]labs=1/.test(shared), shared);
  await page.locator("#chartLocation").fill("90012");
  await page.locator("#chartLocation").press("Enter");
  await page.waitForTimeout(1000);
  await page.locator("#zipClearBtn").click();
  await page.waitForTimeout(800);
  const cleared = await page.evaluate(() => location.search);
  expect("clearing the ZIP keeps labs", /[?&]labs/.test(cleared), cleared);
  await page.evaluate(() => document.getElementById("useDefaultsBtn").click());
  await page.waitForTimeout(800);
  const reset = await page.evaluate(() => location.search);
  expect("going back to the defaults keeps labs", /[?&]labs/.test(reset), reset);
  expect("no errors (labs)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// Labs on, in °C: the same moments go green.
{
  const { page, errors } = await open("?labs&unit=C");
  const r = await read(page);
  expect("in °C, the sun line turns green in the same weather", r.sun?.sun === "green", JSON.stringify(r));
  expect("in °C, only the shade line where only the shade qualifies", r.shadeOnly?.shade === "green" && r.shadeOnly?.sun === "sun", JSON.stringify(r.shadeOnly));
  expect("no errors (°C)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// Labs off: no green, the leaf is back; ?labs=0 is off too.
for (const path of ["", "?labs=0"]) {
  const { page, errors } = await open(path);
  const r = await read(page);
  expect(
    `${path || "without labs"}: the lines keep their colours and the leaf is there`,
    r.sun?.sun === "sun" && r.shadeOnly?.shade === "shade" && r.leafMarks > 0 && r.legendLeaf && !r.legendGreen,
    JSON.stringify(r)
  );
  expect(`no errors (${path || "without labs"})`, errors.length === 0, errors.join(" | "));
  await page.context().close();
}

await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("all passed");
