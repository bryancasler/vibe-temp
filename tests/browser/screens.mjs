// Screenshots at 390px and 1280px, dark and light, for looking at a change.
// Usage: node tests/browser/screens.mjs <outDir> [label] [now ISO] [extra storage JSON]
import { mkdirSync } from "node:fs";
import { launch, openApp, waitForChart } from "./harness.mjs";

const [outDir = "screens", label = "shot", now = "2025-10-17T10:20:00-04:00", storageJson = "{}"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await launch();
for (const size of ["phone", "desktop"]) {
  for (const scheme of ["dark", "light"]) {
    const { page, t0, errors, log } = await openApp(browser, { size, scheme, now, storage: JSON.parse(storageJson) });
    await waitForChart(page, t0);
    await page.waitForTimeout(400);
    const file = `${outDir}/${label}-${size}-${scheme}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const unmocked = log.filter((l) => l.host === "UNMOCKED").map((l) => l.url);
    console.log(file, errors.length ? `errors: ${errors.join(" | ")}` : "no errors", unmocked.length ? `unmocked: ${unmocked}` : "");
    await page.context().close();
  }
}
await browser.close();
