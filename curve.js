// The smooth line through the chart's points, and reading values off it.
// Monotone cubic Hermite (Steffen's rule, as d3's curveMonotoneX): the curve
// passes through every point and never draws a high or a low between two
// points that the points themselves don't have. Points are { x, y } in any
// linear units (pixels to draw, time and °F to read), x increasing.
(function (root) {
  // The slope at an inner point: flat where the line turns (the two sides
  // slope opposite ways, or one is level), never steeper than twice either
  // side's own slope. Null at an end, or next to two points at one x.
  function innerSlope(pts, i) {
    const prev = pts[i - 1];
    const p = pts[i];
    const next = pts[i + 1];
    if (!prev || !next) return null;
    const h0 = p.x - prev.x;
    const h1 = next.x - p.x;
    if (!(h0 > 0) || !(h1 > 0)) return null;
    const s0 = (p.y - prev.y) / h0;
    const s1 = (next.y - p.y) / h1;
    const mid = (s0 * h1 + s1 * h0) / (h0 + h1);
    return (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(mid)) || 0;
  }

  // At either end, d3's end rule: half of three times the last step's slope
  // less the next point's.
  function ownSlope(pts, i) {
    const inner = innerSlope(pts, i);
    if (inner !== null) return inner;
    const before = i > 0;
    const after = i < pts.length - 1;
    if (!before && !after) return 0;
    const [a, b] = before ? [pts[i - 1], pts[i]] : [pts[i], pts[i + 1]];
    const dx = b.x - a.x;
    if (!(dx > 0)) return 0;
    const step = (b.y - a.y) / dx;
    const nb = innerSlope(pts, before ? i - 1 : i + 1);
    return nb === null ? step : (3 * step - nb) / 2;
  }

  function slopes(pts) {
    return pts.map((_, i) => ownSlope(pts, i));
  }

  // Where two lines meet at a point (same x and y), both take the gentler of
  // their two slopes, or flat when those disagree, so they leave and rejoin
  // as one line and neither crosses the other between points. Edits the
  // slope arrays in place.
  function shareSlopesWhereEqual(a, aSlopes, b, bSlopes, tolerance = 1e-9) {
    if (a.length !== b.length) return;
    for (let i = 0; i < a.length; i++) {
      if (a[i].x !== b[i].x || Math.abs(a[i].y - b[i].y) > tolerance) continue;
      const ma = aSlopes[i];
      const mb = bSlopes[i];
      const m = Math.sign(ma) !== Math.sign(mb) ? 0 : Math.abs(ma) <= Math.abs(mb) ? ma : mb;
      aSlopes[i] = m;
      bSlopes[i] = m;
    }
  }

  // The "Line smoothing" setting: 0 is straight lines, 1 the full curve, and
  // between them the slopes blend toward the segment's own. The blend stays
  // monotone: Steffen's slopes are at most twice the secant.
  function segmentSlopes(pts, s, i, smoothing) {
    const dx = pts[i + 1].x - pts[i].x;
    const secant = dx > 0 ? (pts[i + 1].y - pts[i].y) / dx : 0;
    return [smoothing * s[i] + (1 - smoothing) * secant, smoothing * s[i + 1] + (1 - smoothing) * secant];
  }

  function hermite(x0, y0, m0, x1, y1, m1, x) {
    const h = x1 - x0;
    const u = (x - x0) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * m1;
  }

  // The curve's y at x: exactly what the chart draws there. Null off the ends.
  function valueAt(pts, s, x, smoothing = 1) {
    const n = pts.length;
    if (n === 0 || x < pts[0].x || x > pts[n - 1].x) return null;
    let i = 0;
    while (i < n - 1 && pts[i + 1].x <= x) i++;
    if (pts[i].x === x || i === n - 1) return pts[i].y;
    const [m0, m1] = segmentSlopes(pts, s, i, smoothing);
    return hermite(pts[i].x, pts[i].y, m0, pts[i + 1].x, pts[i + 1].y, m1, x);
  }

  // valueAt for x read in increasing order, as the paw scan reads every
  // minute of a week: it walks forward from the last segment it found.
  function reader(pts, s, smoothing = 1) {
    const n = pts.length;
    let i = 0;
    let seg = -1;
    let m0 = 0;
    let m1 = 0;
    return (x) => {
      if (n === 0 || x < pts[0].x || x > pts[n - 1].x) return null;
      if (pts[i].x > x) i = 0;
      while (i < n - 1 && pts[i + 1].x <= x) i++;
      if (pts[i].x === x || i === n - 1) return pts[i].y;
      if (seg !== i) {
        [m0, m1] = segmentSlopes(pts, s, i, smoothing);
        seg = i;
      }
      return hermite(pts[i].x, pts[i].y, m0, pts[i + 1].x, pts[i + 1].y, m1, x);
    };
  }

  const MonotoneCurve = { innerSlope, ownSlope, slopes, shareSlopesWhereEqual, segmentSlopes, hermite, valueAt, reader };
  root.MonotoneCurve = MonotoneCurve;
  if (typeof module === "object" && module.exports) module.exports = MonotoneCurve;
})(typeof window !== "undefined" ? window : globalThis);
