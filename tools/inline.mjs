// Copies styles.css into index.html's <style> block (Bryan, 2026-10-01: the
// page paints without waiting for a stylesheet request). styles.css stays the
// file to edit, and methodology.html links it as before.
// Usage: node tools/inline-css.mjs   (tests/inline-css.test.mjs checks they match)
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const css = readFileSync(new URL("styles.css", root), "utf8");
const page = new URL("index.html", root);
const html = readFileSync(page, "utf8");
const block = /(<style data-inline="styles\.css">)[\s\S]*?(    <\/style>)/;
if (!block.test(html)) throw new Error('index.html has no <style data-inline="styles.css"> block');
writeFileSync(page, html.replace(block, (_, open, close) => `${open}\n${css.trimEnd()}\n${close}`));
console.log("styles.css inlined into index.html");
