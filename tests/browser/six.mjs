// The 6 Hours view: always offered, and picked on load when the next 6 hours
// are changeable (rain, snow or storms start or stop, or the shade moves 8°F
// within 2 hours). A calm forecast opens on 24 hours; a view the viewer
// picked, or a link's ?days=, is left alone. Needs the site on port 4800.
// Usage: node tests/browser/six.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
const browser = await launch();
const NOW = "2025-10-17T10:20:00-04:00";
const nowUnix = new Date(NOW).getTime() / 1000;

// Rain from three hours on, for two hours.
const rain = {
  hourly: (u) =>
    u >= nowUnix + 3 * 3600 && u < nowUnix + 5 * 3600
      ? { precipitation: 1.2, precipitation_probability: 90, weathercode: 63, weather_code: 63 }
      : null,
};
// A cold front: the air drops 12°F over an hour, two hours on, and stays down.
const front = {
  hourly: (u, h) => (u >= nowUnix + 2 * 3600 ? { temperature_2m: h.tempF - 12, apparent_temperature: h.tempF - 12 } : null),
};
// Rain all day: wet the whole time, nothing changes.
const allDay = { hourly: () => ({ precipitation: 1, precipitation_probability: 90, weathercode: 61, weather_code: 61 }) };

const state = (page) =>
  page.evaluate(() => {
    const ch = Chart.getChart(document.getElementById("vibeChart"));
    const x = ch.scales.x;
    return {
      changeable: document.getElementById("chartBox").dataset.changeable,
      active: document.querySelector(".preset-btn.active")?.id,
      hours: ((x.max - x.min) * 15) / 60,
      min: x.min,
      six: !!document.getElementById("presetSix"),
      // The y range, and the lines' own range over the points in view.
      yMin: ch.scales.y.min,
      yMax: ch.scales.y.max,
      shown: (() => {
        const v = ch.data.datasets.slice(0, 2).flatMap((d) => d.data.slice(Math.floor(x.min), Math.ceil(x.max) + 1));
        return [Math.min(...v), Math.max(...v)];
      })(),
    };
  });

const open = async (o) => {
  const r = await openApp(browser, { now: NOW, ...o });
  await waitForChart(r.page, r.t0);
  await r.page.clock.runFor(2000);
  return r;
};

{
  const { page, errors } = await open({ scenario: rain });
  const s = await state(page);
  expect("rain in 3h: reason given", /^rain from/.test(s.changeable), s.changeable);
  expect("rain in 3h: opens on 6 Hours", s.active === "presetSix", s.active);
  expect("rain in 3h: 7 hours shown", Math.abs(s.hours - 7) < 0.3, s.hours);
  // Switching to 24 hours zooms out to the 24-hour window.
  await page.click("#presetDefault");
  await page.clock.runFor(1500);
  const d = await state(page);
  expect("6 → 24 hours: 48h window", Math.abs(d.hours - 48) < 0.5, d.hours);
  expect("6 → 24 hours: active", d.active === "presetDefault", d.active);
  // The viewer's pick sticks when the forecast reloads.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.clock.runFor(31 * 60 * 1000);
  const r = await state(page);
  expect("picked 24 hours sticks", r.active === "presetDefault", r.active);
  expect("rain: no page errors", errors.length === 0, errors.join("; "));
  await page.context().close();
}
{
  const { page } = await open({ scenario: front });
  const s = await state(page);
  expect("cold front: reason", /°F drop by/.test(s.changeable), s.changeable);
  expect("cold front: opens on 6 Hours", s.active === "presetSix", s.active);
  await page.context().close();
}
{
  const { page } = await open({ scenario: allDay });
  const s = await state(page);
  expect("rain all day: not changeable", s.changeable === "", s.changeable);
  expect("rain all day: 24 hours", s.active === "presetDefault", s.active);
  await page.context().close();
}
{
  const { page, errors } = await open({});
  const s = await state(page);
  expect("calm: 6 Hours offered", s.six);
  expect("calm: 24 hours", s.active === "presetDefault" && Math.abs(s.hours - 48) < 0.5, `${s.active} ${s.hours}`);
  // Picking 6 hours then going back restores the 24-hour start.
  await page.click("#presetSix");
  await page.clock.runFor(1500);
  const six = await state(page);
  expect("calm: 6 Hours on click", six.active === "presetSix" && Math.abs(six.hours - 7) < 0.3, `${six.active} ${six.hours}`);
  // The 6 hours fit their own temperatures, not the whole week's (Bryan, 2026-10-01).
  const fit = (t) => t.yMin <= t.shown[0] && t.yMax >= t.shown[1] && t.yMax - t.yMin <= Math.max(12, t.shown[1] - t.shown[0] + 6) + 10;
  expect("calm: the 6 hours fit their own temperatures", fit(six), JSON.stringify({ y: [six.yMin, six.yMax], shown: six.shown }));
  expect("calm: the 24 hours keep the week's wider range", s.yMax - s.yMin > six.yMax - six.yMin + 5, JSON.stringify({ day: [s.yMin, s.yMax], six: [six.yMin, six.yMax] }));
  await page.click("#presetDefault");
  await page.clock.runFor(1500);
  const back = await state(page);
  expect("calm: 24-hour start restored", Math.abs(back.min - s.min) < 0.01, `${back.min} vs ${s.min}`);
  expect("calm: back on 24 hours, the week's range returns", back.yMin === s.yMin && back.yMax === s.yMax, JSON.stringify({ before: [s.yMin, s.yMax], after: [back.yMin, back.yMax] }));
  expect("calm: no page errors", errors.length === 0, errors.join("; "));
  await page.context().close();
}
{
  const { page } = await open({ scenario: rain, path: "?days=2" });
  const s = await state(page);
  expect("?days=2 link with rain: not overridden", s.active !== "presetSix", s.active);
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `\n${fails.length} failed` : "\nall passed");
process.exit(fails.length ? 1 : 0);
