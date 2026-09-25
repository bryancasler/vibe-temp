# Checks

No build step and no package.json: these run with Node 22 and Playwright.

- `node --test tests/*.test.mjs`: model.js, time.js, curve.js, weather.js and
  dogs.js against reference values, most of them dcgoldens' own.
- Browser checks need the site on port 4800 (`python3 -m http.server 4800`
  from the repo root) and Playwright with Chromium. They answer every API
  from recorded data, so they run with no network:
  - `node tests/browser/timing.mjs [runs]`: time from load, or ZIP entry, to
    a visible chart, cold and warm, under simulated latencies.
  - `node tests/browser/screens.mjs <dir> [label] [now] [storage JSON]`:
    screenshots at 390px and 1280px, dark and light. Pass
    `'{"vibe.v1.dogs":"true"}'` to see Dogs mode.

`fixtures/dc-2025-hours.json` is every hour of 2025 at 38.911,-76.986 from
Open-Meteo's historical forecast (Open-Meteo data, CC BY 4.0), built for
dcgoldens' own checks, as is `fixtures/paw-days-2025.json`. Chart.js is fetched from npm into `fixtures/` on the
first run.
