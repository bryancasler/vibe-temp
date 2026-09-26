// The chart's window: drag, sideways scroll, keys and swipe slide the 24
// hours along the week; double-click and drag highlights and shares; the
// Week switch zooms and comes back where it was. Needs the site on port 4800.
// Usage: node tests/browser/slide.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
const browser = await launch();
const win = (page) =>
  page.evaluate(() => {
    const ch = Chart.getChart(document.getElementById("vibeChart"));
    return [ch.scales.x.min, ch.scales.x.max];
  });

// Desktop: mouse drag, wheel, vertical wheel, double-click-drag, keys, zoom.
{
  const { page, t0, errors } = await openApp(browser, { size: "desktop", scheme: "dark" });
  await waitForChart(page, t0);
  const b = await page.locator("#vibeChart").boundingBox();
  const y = b.y + b.height * 0.45;
  const [s0, e0] = await win(page);
  expect("the 24 hours open on today and tomorrow", s0 === 0 && e0 === 192, `${s0}-${e0}`);
  await page.mouse.move(b.x + b.width * 0.8, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width * (0.8 - 0.05 * i), y);
  await page.mouse.up();
  const [s1, e1] = await win(page);
  expect("a drag slides the window later, keeping its width", s1 > 60 && e1 - s1 === 192, `${s1}-${e1}`);
  await page.mouse.move(b.x + b.width / 2, y);
  await page.mouse.wheel(300, 0);
  await page.waitForTimeout(100);
  const [s2] = await win(page);
  expect("a sideways scroll slides it on", s2 > s1, `${s1} -> ${s2}`);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(200);
  const [s3] = await win(page);
  expect("an up-and-down scroll moves the page, not the chart", s3 === s2 && (await page.evaluate(() => scrollY)) > y0);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  const b2 = await page.locator("#vibeChart").boundingBox();
  const y2 = b2.y + b2.height * 0.45;
  await page.mouse.move(b2.x + b2.width * 0.3, y2);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b2.x + b2.width * (0.3 + 0.03 * i), y2);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const [s4] = await win(page);
  const search = await page.evaluate(() => location.search);
  expect("double-click and drag highlights and shares, without sliding", s4 === s2 && /start=/.test(search) && /end=/.test(search), search);
  await page.locator("#vibeChart").focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(100);
  const [, e5] = await win(page);
  expect("End takes the readout to the week's last point and the chart follows", e5 === 671, `${e5}`);
  await page.keyboard.press("Home");
  await page.waitForTimeout(100);
  await page.mouse.move(b2.x + b2.width / 2, y2);
  await page.mouse.wheel(400, 0);
  await page.waitForTimeout(100);
  const slid = await win(page);
  await page.locator("#presetWeek").click();
  await page.waitForTimeout(200);
  const mid = await win(page);
  await page.waitForTimeout(600);
  const week = await win(page);
  expect("Week zooms out to the whole week", mid[1] - mid[0] > 192 && mid[1] - mid[0] < 671 && week[0] === 0 && week[1] === 671, `${mid} ${week}`);
  await page.locator("#presetDefault").click();
  await page.waitForTimeout(800);
  const back = await win(page);
  expect("back to 24 hours where they were left", back.join() === slid.join(), `${slid} ${back}`);
  expect("no errors (desktop)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// Phone: a finger swipe slides; a tap still reads.
{
  const { page, t0, errors } = await openApp(browser, { size: "phone", scheme: "light" });
  await waitForChart(page, t0);
  const b = await page.locator("#vibeChart").boundingBox();
  const y = b.y + b.height * 0.45;
  const cdp = await page.context().newCDPSession(page);
  const at = (x) => [{ x, y }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(b.x + b.width * 0.8) });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(b.x + b.width * (0.8 - 0.05 * i)) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const [s] = await win(page);
  expect("a swipe slides the 24 hours", s > 40, `${s}`);
  await page.touchscreen.tap(b.x + b.width * 0.5, y);
  expect("a tap still opens the readout", await page.locator("#chartReadout").isVisible());
  expect("no errors (phone)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// A shared highlight on a later day opens slid to it.
{
  const q = "?unit=F&days=2&zip=20001&start=2025-10-20T16%3A00%3A00.000Z&end=2025-10-20T19%3A00%3A00.000Z";
  const { page, t0, errors } = await openApp(browser, { size: "desktop", scheme: "dark", path: `/${q}` });
  await waitForChart(page, t0);
  await page.waitForTimeout(300);
  const [s, e] = await win(page);
  const i = await page.evaluate(() => {
    const L = window.timelineState.labels;
    return Math.round((Date.parse("2025-10-20T16:00:00Z") - L[0]) / (L[1] - L[0]));
  });
  expect("a shared link's highlight on a later day opens in view", i >= s && i <= e && s > 0, `${i} in ${s}-${e}`);
  expect("no errors (shared)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// Reduced motion: the switch jumps.
{
  const { page, t0 } = await openApp(browser, { size: "desktop", scheme: "dark" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForChart(page, t0);
  await page.locator("#presetWeek").click();
  await page.waitForTimeout(60);
  const w = await win(page);
  expect("with reduced motion, Week is there at once", w[0] === 0 && w[1] === 671, `${w}`);
  await page.context().close();
}

await browser.close();
console.log(fails.length ? `${fails.length} failed` : "all passed");
process.exit(fails.length ? 1 : 0);
