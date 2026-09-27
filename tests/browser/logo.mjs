// The header icon: a tap sets off the star's biggest shine and flares the
// sun's rays; a second tap starts it again; the timed twinkles wait for it;
// with reduced motion nothing moves. Needs the site on port 4800.
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
  const { page, t0, errors } = await openApp(browser, { size: "phone", scheme: "dark" });
  await waitForChart(page, t0);
  await page.clock.runFor(15000); // past the first timed twinkles
  await page.waitForTimeout(1800);
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

await browser.close();
if (fails.length) {
  console.log(`\n${fails.length} failed`);
  process.exit(1);
}
console.log("all passed");
