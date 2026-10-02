// A small, careful CSS minifier for tools/inline.mjs (Bryan, 2026-10-02):
// drops comments and the whitespace CSS doesn't need, and nothing else.
// Quoted strings are copied as they are; spaces that can matter (between
// selector parts, around + and - in calc(), between values) stay as one.
export function minifyCss(css) {
  // 1. Comments out, strings kept whole.
  let out = "";
  for (let i = 0; i < css.length; ) {
    const c = css[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === "\\" ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  // 2. Whitespace, outside strings only.
  return out
    .split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
    .map((part, k) =>
      k % 2
        ? part
        : part
            .replace(/\s+/g, " ")
            .replace(/ ?([{};,>]) ?/g, "$1")
            .replace(/: /g, ":")
            .replace(/;}/g, "}")
    )
    .join("")
    .trim();
}
