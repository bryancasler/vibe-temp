# Link previews (staged, not deployed)

A Cloudflare Worker that gives shared Vibe Temp links a live preview in
iMessage and elsewhere (Bryan, 2026-10-01). GitHub Pages can't do it alone:
Messages builds a preview from the page's HTML without running JavaScript,
so each ZIP's title and image have to come from a server.

- `/?zip=20009`: the page from GitHub Pages, with that ZIP's `og:` tags
  (title like "20009 · Washington, DC: 74°F sun, 68°F shade", the time as
  of which it was drawn in the description, and the image).
- `/og.png?zip=20009&v=a|b&t=…`: a 1200×630 card drawn from the forecast
  right then, with the ZIP, place and time in the place's own zone. `v`
  picks design A (big temperatures) or B (mini chart); `t` is a ten-minute
  bucket so a cached image is never older than that.
- Everything else passes through to GitHub Pages untouched.

The numbers come from the page's own model (`../model.js`) at its default
calibration and surface (concrete), so they match the chart.

## To turn it on

1. Move vibetemp.fun's DNS to Cloudflare (free plan), keeping the GitHub
   Pages records, proxied (orange cloud).
2. `cd worker && npm install && npx wrangler login && npx wrangler deploy`.
   The route `vibetemp.fun/*` is in `wrangler.toml`.
3. Text yourself `https://vibetemp.fun/?zip=20009` and check the preview.
   Messages caches a preview per link, so test with a ZIP you haven't sent.

Pick one design and remove the other from `src/preview.js` (`CARDS`) and the
`DEFAULT_VARIANT` in `src/index.js`.
