// Clock and calendar in a place's own time zone, whatever zone the browser
// is in. Times are instants (Date or ms); zones are IANA names, as
// Open-Meteo's `timezone` field gives them. Pure, so tests/time.test.mjs can
// run it in Node.
(function (root) {
  const formatters = new Map();
  function partsFormatter(zone) {
    let f = formatters.get(zone);
    if (!f) {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      formatters.set(zone, f);
    }
    return f;
  }

  const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const memo = new Map();

  /** { year, month (1-12), day, hour (0-23), minute, second, weekday (0 = Sun) } */
  function parts(time, zone) {
    const ms = +time;
    const key = zone + "|" + ms;
    const hit = memo.get(key);
    if (hit) return hit;
    const out = {};
    for (const p of partsFormatter(zone).formatToParts(new Date(ms))) {
      if (p.type === "weekday") out.weekday = WEEKDAYS[p.value];
      else if (p.type !== "literal") out[p.type] = Number(p.value);
    }
    if (out.hour === 24) out.hour = 0;
    if (memo.size > 20000) memo.clear();
    memo.set(key, out);
    return out;
  }

  /** The zone's offset from UTC at this instant, in ms (east positive). */
  function offsetMs(time, zone) {
    const ms = +time;
    const p = parts(ms, zone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUtc - (ms - (((ms % 1000) + 1000) % 1000));
  }

  /** The instant the wall clock in `zone` reads y-m-d h:00 (m is 1-12). */
  function instantOf(zone, year, month, day, hour = 0, minute = 0) {
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    let guess = wall - offsetMs(wall, zone);
    // A second pass settles the offset when the first guess crossed a change.
    guess = wall - offsetMs(guess, zone);
    return guess;
  }

  /** Local midnight of the day containing `time`, moved by addDays days. */
  function startOfDay(time, zone, addDays = 0) {
    const p = parts(time, zone);
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + addDays));
    return instantOf(zone, d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  /** The start of the local clock hour containing `time`. */
  function startOfHour(time, zone) {
    const ms = +time;
    const p = parts(ms, zone);
    return ms - p.minute * 60000 - p.second * 1000 - (((ms % 1000) + 1000) % 1000);
  }

  /** "YYYY-MM-DD" in the zone. */
  function dayKey(time, zone) {
    const p = parts(time, zone);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  }

  /** Whole local days from a's day to b's day. */
  function daysBetween(a, b, zone) {
    const pa = parts(a, zone);
    const pb = parts(b, zone);
    return Math.round(
      (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86400000
    );
  }

  function isValidZone(zone) {
    if (typeof zone !== "string" || !zone) return false;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      return true;
    } catch (e) {
      return false;
    }
  }

  const PlaceTime = { parts, offsetMs, instantOf, startOfDay, startOfHour, dayKey, daysBetween, isValidZone };
  root.PlaceTime = PlaceTime;
  if (typeof module === "object" && module.exports) module.exports = PlaceTime;
})(typeof window !== "undefined" ? window : globalThis);
