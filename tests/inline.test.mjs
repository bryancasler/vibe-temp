// index.html carries styles.css and page-theme.js inline (tools/inline.mjs);
// they must match their files, and the CSP must allow exactly that script.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { minifyCss } from "../tools/minify-css.mjs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const html = read("index.html");
const RUN = "run node tools/inline.mjs";

test("index.html's inlined styles are styles.css, minified", () => {
  const m = html.match(/<style data-inline="styles\.css">\n([\s\S]*?)\n    <\/style>/);
  assert.ok(m, "no inlined styles");
  assert.equal(m[1], minifyCss(read("styles.css")), `styles.css changed: ${RUN}`);
  assert.ok(!/<link[^>]+href="styles\.css"/.test(html), "index.html still links styles.css too");
});

test("index.html's inlined theme script is page-theme.js, word for word, and the CSP allows exactly it", () => {
  const m = html.match(/<script data-inline="page-theme\.js">([\s\S]*?)<\/script>/);
  assert.ok(m, "no inlined page-theme.js");
  assert.equal(m[1].replace(/^\n/, "").replace(/\n    $/, ""), read("page-theme.js").trimEnd(), `page-theme.js changed: ${RUN}`);
  const hash = "sha256-" + createHash("sha256").update(m[1]).digest("base64");
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)[1];
  assert.match(csp, new RegExp(`script-src 'self' '${hash.replace(/[+/=]/g, "\\$&")}'`), `the CSP lacks the script's hash: ${RUN}`);
  assert.ok(!/<script[^>]+src="page-theme\.js"/.test(html), "index.html still loads page-theme.js too");
  // The CSP is set before the script, so the browser applies it to it.
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf('<script data-inline="page-theme.js">'));
});

test("the CSS minifier keeps strings, calc() and selector spaces, and drops comments", () => {
  const css = `/* a comment with "quotes" and it's */\n.a  .b > .c:hover ,\n.d {\n  font: 16px "Segoe  UI", Arial;\n  width: calc(100% - 8px);\n  content: "a ; } /* b";\n}\n@media (min-width: 640px) {\n  .e { margin: 0 auto; }\n}\n[data-theme="light"] .f { color: #fff; }`;
  assert.equal(
    minifyCss(css),
    '.a .b>.c:hover,.d{font:16px "Segoe  UI",Arial;width:calc(100% - 8px);content:"a ; } /* b"}@media (min-width:640px){.e{margin:0 auto}}[data-theme="light"] .f{color:#fff}'
  );
});
