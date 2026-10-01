// index.html carries styles.css inline (tools/inline-css.mjs); they must match.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("index.html's inlined styles are styles.css, word for word", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const m = html.match(/<style data-inline="styles\.css">\n([\s\S]*?)\n    <\/style>/);
  assert.ok(m, "no inlined block");
  assert.equal(m[1], css.trimEnd(), "styles.css changed: run node tools/inline-css.mjs");
  assert.ok(!/<link[^>]+href="styles\.css"/.test(html), "index.html still links styles.css too");
});
