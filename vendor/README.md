# Vendored libraries

- `chart.umd.js`: Chart.js 4.4.3, the `dist/chart.umd.js` published to npm,
  unchanged (MIT, `chart.js-LICENSE.md`). scripts.js loads it with its
  sha384 (`CHART_JS_INTEGRITY`). To update: `npm pack chart.js@<version>`,
  copy `package/dist/chart.umd.js` here, and put the new
  `sha384-$(openssl dgst -sha384 -binary chart.umd.js | base64 -w0)` and
  version in scripts.js.
