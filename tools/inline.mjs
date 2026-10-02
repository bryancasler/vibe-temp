// Copies styles.css and page-theme.js into index.html (Bryan, 2026-10-01
// and 10-02): the page paints without waiting on either request. The files
// stay the ones to edit; methodology.html still links them. The page's CSP
// blocks inline scripts it doesn't know, so the script's sha256 goes into
// the CSP's script-src as well.
// Usage: node tools/inline.mjs   (tests/inline.test.mjs checks they match)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");
const page = new URL("index.html", root);
let html = read("index.html");

const fill = (re, body, what) => {
  if (!re.test(html)) throw new Error(`index.html has no ${what} block`);
  html = html.replace(re, (_, open, close) => `${open}\n${body}\n${close}`);
};
fill(/(<style data-inline="styles\.css">)[\s\S]*?(    <\/style>)/, read("styles.css").trimEnd(), '<style data-inline="styles.css">');
fill(/(<script data-inline="page-theme\.js">)[\s\S]*?(    <\/script>)/, read("page-theme.js").trimEnd(), '<script data-inline="page-theme.js">');

// The hash covers exactly what sits between <script ...> and </script>.
export const inlineScript = (h) => h.match(/<script data-inline="page-theme\.js">([\s\S]*?)<\/script>/)[1];
const hash = "sha256-" + createHash("sha256").update(inlineScript(html)).digest("base64");
const csp = /(script-src 'self')( 'sha256-[A-Za-z0-9+/=]+')?/;
if (!csp.test(html)) throw new Error("index.html's CSP has no script-src 'self'");
html = html.replace(csp, `$1 '${hash}'`);

writeFileSync(page, html);
console.log("styles.css and page-theme.js inlined into index.html; CSP script hash", hash);
