// Where the chart opens: Washington, DC, labelled, with no location prompt
// on load; the location button asks, a ZIP or a link picks a place, and
// clearing the ZIP goes back to DC. Needs the site on port 4800.
// Usage: node tests/browser/place.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
// Count every request for the device's location.
const countAsks = (page) =>
  page.addInitScript(() => {
    window.__geoAsks = 0;
    const geo = navigator.geolocation;
    if (!geo) return;
    for (const k of ["getCurrentPosition", "watchPosition"]) {
      const f = geo[k].bind(geo);
      geo[k] = (...a) => {
        window.__geoAsks++;
        return f(...a);
      };
    }
  });
const asked = (page) => page.evaluate(() => window.__geoAsks);
const forecastAt = (log) => log.filter((l) => /api\.open-meteo\.com/.test(l.url)).map((l) => new URL(l.url).searchParams.get("latitude") + "," + new URL(l.url).searchParams.get("longitude"));
const note = (page) => page.locator("#defaultPlaceNote");
const browser = await launch();

for (const size of ["phone", "desktop"]) {
  const { page, t0, errors, log } = await openApp(browser, { size, scheme: "dark", goto: false });
  await countAsks(page);
  await page.goto("http://localhost:4800/", { waitUntil: "commit" });
  await waitForChart(page, t0);
  expect(`${size}: opens on Washington, DC`, forecastAt(log).at(-1) === "38.91,-77.04", forecastAt(log).join(" "));
  expect(`${size}: says it is showing Washington, DC`, await note(page).isVisible() && /Showing Washington, DC/.test(await note(page).textContent()));
  expect(`${size}: never asks for the device's location on load`, (await asked(page)) === 0, `${await asked(page)}`);
  await page.locator("#gpsLocationBtn").click();
  await page.waitForTimeout(800);
  expect(`${size}: the location button asks, and shows the device's place`, (await asked(page)) === 1 && forecastAt(log).at(-1) === "38.91,-77.02", forecastAt(log).join(" "));
  expect(`${size}: the DC note goes once another place shows`, !(await note(page).isVisible()));
  expect(`${size}: no errors`, errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// A ZIP picks a place; clearing it goes back to DC without asking.
{
  const { page, t0, errors, log } = await openApp(browser, { size: "desktop", scheme: "light", goto: false });
  await countAsks(page);
  await page.goto("http://localhost:4800/", { waitUntil: "commit" });
  await waitForChart(page, t0);
  await page.locator("#chartLocation").fill("90012");
  await page.locator("#chartLocation").press("Enter");
  await page.waitForTimeout(1000);
  expect("a ZIP shows its place and drops the DC note", forecastAt(log).at(-1) !== "38.91,-77.04" && !(await note(page).isVisible()), forecastAt(log).join(" "));
  await page.locator("#zipClearBtn").click();
  await page.waitForTimeout(1000);
  // DC's forecast is still cached from the first load, so no new request: the label and the chart's own place say it.
  const shown = await page.evaluate(() => [window.timelineState?.labels?.length > 0, document.getElementById("defaultPlaceNote").hidden]);
  expect(
    "clearing the ZIP goes back to DC, labelled, without asking",
    shown[0] && !shown[1] && (await note(page).isVisible()) && (await asked(page)) === 0,
    `${forecastAt(log).join(" ")} asks ${await asked(page)} ${shown}`
  );
  expect("no errors (ZIP)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// A link's place wins, and nothing asks.
{
  const { page, t0, errors, log } = await openApp(browser, { size: "desktop", scheme: "dark", goto: false });
  await countAsks(page);
  await page.goto("http://localhost:4800/?lat=40.71&lon=-74.01", { waitUntil: "commit" });
  await waitForChart(page, t0);
  await page.waitForTimeout(300);
  expect("a link's place opens, unlabelled, without asking", forecastAt(log).at(-1) === "40.71,-74.01" && !(await note(page).isVisible()) && (await asked(page)) === 0, forecastAt(log).join(" "));
  expect("no errors (link)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `${fails.length} failed` : "all passed");
process.exit(fails.length ? 1 : 0);
