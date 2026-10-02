// Stamps index.html's footer with the release (Bryan, 2026-10-02):
//   Version 2026.10.02 v142 @ 8:43pm
// the date and time it went out, in Eastern time, and v, the number this
// release's commit will have on main (its commit count, plus one), so it
// always counts up however many releases go out in a day.
// Usage, on main just before committing the release:
//   node tools/stamp-version.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const page = new URL("index.html", root);
const commits = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: root }).toString().trim());
const now = new Date();
const et = (o) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...o }).format(now);
const date = `${et({ year: "numeric" })}.${et({ month: "2-digit" })}.${et({ day: "2-digit" })}`;
const time = et({ hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M$/, (_, m) => m.toLowerCase() + "m");
const line = `Version ${date} v${commits + 1} @ ${time}`;

const html = readFileSync(page, "utf8");
const tag = /(<p class="tip-content site-version" id="siteVersion">)[^<]*(<\/p>)/;
if (!tag.test(html)) throw new Error('index.html has no <p id="siteVersion">');
writeFileSync(page, html.replace(tag, `$1${line}$2`));
console.log(line);
