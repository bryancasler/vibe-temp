# Vibe Temp

A static site (index.html, scripts.js and friends) that GitHub Pages
publishes from `main` to vibetemp.fun. No build step, no package.json.
Bryan works through chat; whoever is doing the work runs everything below.

## Before every commit
- After editing `styles.css` or `page-theme.js`, run `node tools/inline.mjs`.
  It copies both into index.html's `<head>` and writes page-theme.js's
  sha256 into the CSP, which blocks inline scripts it doesn't know. Skip it
  and the live page keeps the old copies.
- Run `node --test tests/*.test.mjs` (`tests/inline.test.mjs` catches a
  missed inline step). The browser checks are in tests/README.md.

## Releasing to main
- Work happens on the feature branch; `main` gets only the release commit,
  built on top of origin/main (cherry-pick in a worktree), so staged work
  such as `worker/` never goes live by accident.
- On that tree, just before committing:
  `node tools/stamp-version.mjs && git add index.html`
  The footer reads `Version 2026.10.02 v145 @ 3:41pm` (Eastern time; v is
  the release's commit number on main, always counting up).
- Check the committed file, not the working copy:
  `git show HEAD:index.html | grep -o 'Version [^<]*'`
- Ask Bryan before pushing to main unless he has said to push.
- After pushing, merge origin/main back into the feature branch.

## Testing
- Serve the site with `python3 -m http.server 4800`; stop it afterwards
  with `pgrep -f "^python3 -m http.server 4800" | xargs -r kill`.
- `tests/browser/perf.mjs` measures first paint, time to chart and layout
  shift on a throttled phone.
