// The header icon: its biggest shine, the star's and the sun's rays flaring,
// runs about 2 seconds after load, on a tap and when a mouse comes over it; a
// second tap starts it over, a mouse moving off and back does not; the timed
// twinkles wait for it; with reduced motion nothing moves. Needs the site on
// port 4800.
// Usage: node tests/browser/logo.mjs
import { launch, openApp, waitForChart } from "./harness.mjs";

const fails = [];
const expect = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (${detail})`}`);
  if (!ok) fails.push(name);
};
const browser = await launch();
// The star's and a ray's boxes and the sun's, and the star's animation, held at `ms` into the tap's shine if given.
const look = (page, ms = null) =>
  page.evaluate((ms) => {
    const logo = document.querySelector(".headline-logo");
    const star = logo.querySelector(".logo-star");
    const ray = logo.querySelector(".logo-rays path");
    const sun = logo.querySelector('path[d^="M31 17"]');
    if (ms !== null) {
      for (const a of [...star.getAnimations(), ...ray.getAnimations()]) {
        a.pause();
        a.currentTime = ms;
      }
    }
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    };
    const a = star.getAnimations()[0];
    return {
      star: box(star),
      ray: box(ray),
      sun: box(sun),
      classes: [star.getAttribute("class"), logo.querySelector(".logo-rays").getAttribute("class")],
      time: a ? a.currentTime : null,
      name: a ? a.animationName : null,
    };
  }, ms);
const dist = (p, q) => Math.hypot(p.cx - q.cx, p.cy - q.cy);

{
  const { page, t0, errors } = await openApp(browser, { size: "phone", scheme: "dark", goto: false });
  // Note each time the icon's star or rays take a shine's class, and when (the page's clock).
  await page.addInitScript(() => {
    window.__shines = [];
    new MutationObserver((ms) =>
      ms.forEach((m) => {
        const c = m.target.getAttribute("class") || "";
        if (/logo-star--mega|logo-rays--flare/.test(c)) window.__shines.push([Math.round(performance.now()), c]);
      })
    ).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
  await page.goto("http://localhost:4800/", { waitUntil: "commit" });
  await waitForChart(page, t0);
  await page.clock.runFor(2500);
  const shines = await page.evaluate(() => window.__shines);
  const at = (re) => shines.find(([, c]) => re.test(c));
  const [starAt] = at(/logo-star--mega/) || [];
  const [raysAt] = at(/logo-rays--flare/) || [];
  expect(
    "about 2 seconds after load the whole shine runs: the star's and the rays' flare",
    starAt >= 1900 && starAt <= 2600 && raysAt === starAt,
    JSON.stringify(shines)
  );
  await page.waitForTimeout(2600); // the load's shine over
  const rest = await look(page);
  const logo = page.locator(".headline-logo");
  // Tap, and tap again mid-shine: it starts over, one shine, not two.
  await logo.tap();
  await page.waitForTimeout(900);
  await logo.tap();
  const again = await look(page);
  const running = await page.evaluate(() => document.querySelector(".logo-star").getAnimations().length);
  expect("a second tap mid-shine starts it over", again.name === "logo-shine" && again.time < 300 && running === 1, `${again.name} ${again.time} ${running}`);
  // The timed twinkles come round meanwhile, and leave it be.
  await page.clock.runFor(30000);
  const kept = await look(page);
  expect("a timed twinkle does not cut a shine short", kept.name === "logo-shine", `${kept.name} ${kept.classes[0]}`);
  await page.waitForTimeout(2500);
  const after = await look(page);
  expect("afterwards the star and the rays are back at rest", !/--mega/.test(after.classes[0]) && !/--flare/.test(after.classes[1]) && Math.abs(after.star.w - rest.star.w) < 0.5, after.classes.join(" | "));
  await logo.tap();
  const on = await look(page);
  expect(
    "a tap on the icon sets off the star's shine and the rays' flare",
    /logo-star--mega/.test(on.classes[0]) && /logo-rays--flare/.test(on.classes[1]),
    on.classes.join(" | ")
  );
  const peak = await look(page, 660);
  expect("at its peak the star is over three times its size", peak.star.w > rest.star.w * 3, `${rest.star.w} -> ${peak.star.w}`);
  const flare = await look(page, 405);
  expect(
    "the rays flare out from the sun's centre, and the sun holds still",
    dist(flare.ray, rest.sun) > dist(rest.ray, rest.sun) + 1 && Math.abs(flare.sun.cx - rest.sun.cx) < 0.01 && Math.abs(flare.sun.w - rest.sun.w) < 0.01,
    `${dist(rest.ray, rest.sun).toFixed(2)} -> ${dist(flare.ray, rest.sun).toFixed(2)}`
  );
  expect("no errors", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// Desktop: a mouse coming over the icon sets it off; moving off and back mid-shine does not start it over.
{
  const { page, t0, errors } = await openApp(browser, { size: "desktop", scheme: "light" });
  await waitForChart(page, t0);
  await page.clock.runFor(3000);
  await page.waitForTimeout(2600); // the load's shine over
  await page.mouse.move(5, 5);
  const before = await look(page);
  const box = await page.locator(".headline-logo").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const over = await look(page);
  expect(
    "a mouse over the icon sets off the shine",
    !/--mega/.test(before.classes[0]) && /logo-star--mega/.test(over.classes[0]) && /logo-rays--flare/.test(over.classes[1]),
    `${before.classes[0]} -> ${over.classes.join(" | ")}`
  );
  await page.waitForTimeout(600);
  await page.mouse.move(5, 5);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const back = await look(page);
  expect("moving off and back mid-shine does not start it over", back.name === "logo-shine" && back.time > 400, `${back.name} ${back.time}`);
  expect("no errors (desktop)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// With reduced motion a tap moves nothing.
{
  const { page, t0, errors } = await openApp(browser, { size: "phone", scheme: "light" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await waitForChart(page, t0);
  const rest = await look(page);
  await page.locator(".headline-logo").tap();
  await page.waitForTimeout(300);
  const tapped = await look(page);
  const moving = await page.evaluate(() => [...document.querySelectorAll(".headline-logo *")].some((el) => el.getAnimations().length));
  expect("with reduced motion a tap moves nothing", !moving && Math.abs(tapped.star.w - rest.star.w) < 0.01 && Math.abs(tapped.ray.cx - rest.ray.cx) < 0.01, `${moving}`);
  expect("no errors (reduced motion)", errors.length === 0, errors.join(" | "));
  await page.context().close();
}

// The shine plays again each time a ZIP loads, and not for one that fails (Bryan, 2026-10-01).
{
  const { page, t0, errors } = await openApp(browser, { size: "phone", scheme: "dark", goto: false });
  await page.addInitScript(() => {
    // Each shine's start, once: the star can take its class more than once in the same moment.
    window.__starts = new Set();
    new MutationObserver((ms) =>
      ms.forEach((m) => {
        if (m.target.classList?.contains("logo-star--mega")) window.__starts.add(Math.round(performance.now() / 50));
      })
    ).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
  });
  await page.goto("http://localhost:4800/", { waitUntil: "commit" });
  await waitForChart(page, t0);
  await page.clock.runFor(5000); // the load's shine, and over
  await page.waitForTimeout(1500);
  const megas = () => page.evaluate(() => window.__starts.size);
  const afterLoad = await megas();
  await page.locator("#chartLocation").fill("99999");
  await page.locator("#chartLocation").press("Enter");
  await page.waitForTimeout(1200);
  const afterFail = await megas();
  await page.locator("#chartLocation").fill("90012");
  await page.locator("#chartLocation").press("Enter");
  await page.waitForTimeout(1500);
  const afterZip = await megas();
  expect("the load shine ran once", afterLoad === 1, `${afterLoad}`);
  expect("a ZIP that fails doesn't shine", afterFail === afterLoad, `${afterLoad} -> ${afterFail}`);
  expect("a ZIP that works shines the logo", afterZip === afterFail + 1, `${afterFail} -> ${afterZip}`);
  const real = errors.filter((e) => !/status of 404/.test(e));
  expect("no errors (ZIP shine)", real.length === 0, real.join(" | "));
  await page.context().close();
}

await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("all passed");
