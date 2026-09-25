// Dogs mode: walk ratings, the six dog cards, the paw-to-grass time and the
// National Weather Service's thunderstorm words. Ported from dcgoldens.org's
// Dog Weather (src/lib/weather: thresholds, walk-windows, signals, chart,
// nws-core, time), where every number carries its source; the methodology
// page (methodology.html) says the same in public.
//
// Pure: plain data in and out, so tests/dogs.test.mjs runs it in Node.
// Times are Unix seconds; clock and calendar words are in the place's own
// zone (time.js). Every temperature is °F; °C exists only when printed.
//
// An hour is { t, date, hour, tempF, rh, windMph, uv, isDay, pop, code,
// snowIn, aqi, storm }, any reading null when missing: a missing reading
// never raises a flag.
//
// Copy rules (from dcgoldens signals.ts): the heat index and AQI are always
// named as scales made for people; "odds", never "risk", for the golden
// finding; storms are lead time, never danger, in the Weather Service's own
// words; "at DC's Heat Alert level", never "DC has issued a Heat Alert";
// nothing implies DC law limits walks. Vibe Temp works anywhere, and the
// levels named are DC's, so the words always say whose they are.
(function (root) {
  const PlaceTime = root.PlaceTime || (typeof require === "function" ? require("./time.js") : null);
  const VibeWeather = root.VibeWeather || (typeof require === "function" ? require("./weather.js") : null);

  const H = 3600;
  const MINUTE = 60;

  /* ── Every number, with its source (dcgoldens thresholds.ts) ── */
  const T = Object.freeze({
    // NWS heat index categories (weather.gov/ama/heatindex): a scale for people.
    NWS_CAUTION_HI_F: 80,
    NWS_EXTREME_CAUTION_HI_F: 90,
    NWS_DANGER_HI_F: 103,
    NWS_EXTREME_DANGER_HI_F: 125,
    // DC's Heat Alert (heat index 95°F+) and Extreme Heat Alert (105°F+):
    // 2026 District of Columbia Heat Plan, p. 2.
    DC_HEAT_ALERT_HI_F: 95,
    DC_EXTREME_HEAT_ALERT_HI_F: 105,
    // "Full sunshine can increase heat index values by up to 15°F." weather.gov/safety/heat-index
    FULL_SUN_HI_BOOST_F: 15,
    // Goldens' odds of heat-related illness against Labradors (Hall et al., Sci Rep 2020).
    GOLDEN_VS_LABRADOR_ODDS: 2.67,
    // UK emergency vets, 2022 heat-alert days: 5 times the heatstroke cases a day (Beard et al. 2024).
    UK_ALERT_DAY_CASE_MULTIPLIER: 5,
    // Sunlit surfaces 36 to 56°F hotter than the same material in shade (Chestovich 2022), at 120°F air.
    SUN_VS_SHADE_DELTA_F: [36, 56],
    SUN_VS_SHADE_AIR_F: 120,
    // Ours: sunny pavement is daylight, UV 3+, air 80°F+.
    PAVEMENT_MIN_UV: 3,
    PAVEMENT_MIN_AIR_F: 80,
    // Hand-test seconds as published (Dogs Trust 5, WSU 7, AKC 10); none tested.
    HAND_TEST_SECONDS: [5, 10],
    // D.C. Code § 8-1801(13): extreme weather below 32°F; § 8-1808(c)(1): 15 minutes.
    DC_EXTREME_COLD_F: 32,
    DC_UNATTENDED_MINUTES: 15,
    // EPA AQI category floors (airnow.gov): a scale for people.
    AQI_MODERATE_MIN: 51,
    AQI_USG_MIN: 101,
    AQI_UNHEALTHY_MIN: 151,
    AQI_VERY_UNHEALTHY_MIN: 201,
    AQI_HAZARDOUS_MIN: 301,
    // NWS words: "chance" is 30 to 50%, "likely" 60% and up (PFM spec, Table 4).
    NWS_CHANCE_PERCENT: [30, 50],
    NWS_LIKELY_MIN_PERCENT: 60,
    // Ours: a Weather Service grid older than this, by its own updateTime, is not used.
    NWS_MAX_AGE_HOURS: 12,
    // Freezing drizzle and rain, snow, snow grains, snow showers.
    WINTER_CODES: [56, 57, 66, 67, 71, 73, 75, 77, 85, 86],
    // Ours: a 50% or better chance of rain makes an hour "be cautious".
    RAIN_LIKELY_POP: 50,
    STORM_LOOKAHEAD_HOURS: 48,
    SALT_LOOKBACK_HOURS: 48,
    SALT_LOOKAHEAD_HOURS: 24,
    // Ours (DC Goldens' pick): paw to grass, whole °F.
    PAW_TO_GRASS_MIN_F: 45,
    PAW_TO_GRASS_MAX_F: 64,
    PAW_TO_GRASS_TARGET_F: 57,
    // DC's Extreme Cold Alert: wind chill 15°F or below, or 16 to 20°F with a
    // 50%+ chance of precipitation (FY26 Winter Plan, §2.2).
    DC_EXTREME_COLD_WIND_CHILL_F: 15,
    DC_EXTREME_COLD_WET_WIND_CHILL_F: 20,
    DC_COLD_ALERT_PRECIP_POP: 50,
    // NWS wind chill is defined at or below 50°F with wind above 3 mph.
    WIND_CHILL_MAX_AIR_F: 50,
    WIND_CHILL_MIN_WIND_MPH: 3,
    // Almost a third of dogs are noise sensitive (Salonen et al. 2020).
    NOISE_SENSITIVE_PERCENT: 32,
  });

  const finite = (v) => typeof v === "number" && Number.isFinite(v);
  const whole = (n) => Math.round(n);
  const fToC = (f) => ((f - 32) * 5) / 9;

  /** "88°F" or "31°C", from °F. Celsius converts the whole °F a rule judged. */
  function formatTemp(f, units) {
    return units === "C" ? `${whole(fToC(whole(f)))}°C` : `${whole(f)}°F`;
  }
  /** A difference: 36°F hotter is 20°C hotter. */
  function formatTempDelta(deltaF, units) {
    return units === "C" ? `${whole((deltaF * 5) / 9)}°C` : `${whole(deltaF)}°F`;
  }

  /* ── Clock and calendar words, in the place's zone ── */

  function localParts(t, zone) {
    const p = PlaceTime.parts(t * 1000, zone);
    return { ...p, date: PlaceTime.dayKey(t * 1000, zone) };
  }
  /** "2pm", "8:43am". */
  function formatClock(t, zone) {
    const { hour, minute } = PlaceTime.parts(t * 1000, zone);
    return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "am" : "pm"}`;
  }
  /** "6am to 9am"; an end on the stroke of midnight reads "midnight". */
  function formatRange(start, end, zone) {
    const e = PlaceTime.parts(end * 1000, zone);
    return `${formatClock(start, zone)} to ${e.hour === 0 && e.minute === 0 ? "midnight" : formatClock(end, zone)}`;
  }
  function addDays(date, n) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const nextDate = (date) => addDays(date, 1);
  const weekday = (date, long = true) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: long ? "long" : "short", timeZone: "UTC" });
  /** "today", "tomorrow", "Friday", or "Wednesday, Sep 30" a week or more out. */
  function dayLabel(date, today) {
    if (date === today) return "today";
    if (date === nextDate(today)) return "tomorrow";
    const out = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
    if (out >= 7) {
      return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
    }
    return weekday(date);
  }
  /** "today", "tomorrow", "on Sunday". */
  function dayPhrase(date, today) {
    const label = dayLabel(date, today);
    return label === "today" || label === "tomorrow" ? label : `on ${label}`;
  }
  /** "a", "a and b", "a, b, and c". */
  function listWords(words) {
    if (words.length <= 1) return words[0] ?? "";
    if (words.length === 2) return `${words[0]} and ${words[1]}`;
    return `${words.slice(0, -1).join(", ")}, and ${words[words.length - 1]}`;
  }
  /** The dates a stretch covers when it runs midnight to midnight, else null. */
  function wholeDays(start, end, zone) {
    const s = PlaceTime.parts(start * 1000, zone);
    const e = PlaceTime.parts(end * 1000, zone);
    if (!(end > start) || s.hour !== 0 || s.minute !== 0 || e.hour !== 0 || e.minute !== 0) return null;
    const last = PlaceTime.dayKey((end - 1) * 1000, zone);
    const dates = [PlaceTime.dayKey(start * 1000, zone)];
    while (dates[dates.length - 1] < last) dates.push(nextDate(dates[dates.length - 1]));
    return dates;
  }
  /** "all day tomorrow", "all day Friday and Saturday", "all day today through Sunday". */
  function allDayWords(dates, today) {
    const labels = dates.map((d) => dayLabel(d, today));
    return `all day ${labels.length > 2 ? `${labels[0]} through ${labels[labels.length - 1]}` : listWords(labels)}`;
  }

  /* ── Per-hour tests ── */

  const STORM_RANK = { none: 0, slight: 1, chance: 2, likely: 3 };
  const stormAtLeast = (h, word) => h.storm !== null && h.storm !== undefined && (STORM_RANK[h.storm] ?? 0) >= STORM_RANK[word];
  /** Thunderstorms possible: the NWS's "chance" or more. */
  const isThunder = (h) => stormAtLeast(h, "chance");
  /** Thunderstorms likely: the NWS's "likely" or more. */
  const isThunderLikely = (h) => stormAtLeast(h, "likely");
  const isWinterWeather = (h) => (finite(h.code) && T.WINTER_CODES.includes(h.code)) || (finite(h.snowIn) && h.snowIn > 0);
  /** Ours: daylight, UV 3+, air 80°F+, judged on the whole numbers printed. */
  const isSunnyPavement = (h) =>
    h.isDay === true && finite(h.uv) && whole(h.uv) >= T.PAVEMENT_MIN_UV && finite(h.tempF) && whole(h.tempF) >= T.PAVEMENT_MIN_AIR_F;
  /** Below 32°F, on the whole degree printed: 31.6°F shows as 32°F and is not flagged. */
  const isFreezing = (h) => finite(h.tempF) && whole(h.tempF) < T.DC_EXTREME_COLD_F;
  const hourHeatIndex = (h) => VibeWeather.heatIndexOrNull(h.tempF, h.rh);

  /** The NWS wind chill (2001), °F; the air temperature outside its range. Never printed. */
  function windChillF(tempF, windMph) {
    if (tempF > T.WIND_CHILL_MAX_AIR_F || !(windMph > T.WIND_CHILL_MIN_WIND_MPH)) return tempF;
    const v = windMph ** 0.16;
    return 35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v;
  }
  /** At DC's Extreme Cold Alert level, on the whole-degree wind chill. */
  function isExtremeColdHour(h) {
    if (!finite(h.tempF)) return false;
    const felt = whole(finite(h.windMph) ? windChillF(h.tempF, h.windMph) : h.tempF);
    if (felt <= T.DC_EXTREME_COLD_WIND_CHILL_F) return true;
    return felt <= T.DC_EXTREME_COLD_WET_WIND_CHILL_F && finite(h.pop) && h.pop >= T.DC_COLD_ALERT_PRECIP_POP;
  }

  const HEAT_CATEGORY_LABELS = { caution: "Caution", "extreme-caution": "Extreme Caution", danger: "Danger", "extreme-danger": "Extreme Danger" };
  function heatCategory(hi) {
    if (!finite(hi)) return null;
    if (hi >= T.NWS_EXTREME_DANGER_HI_F) return "extreme-danger";
    if (hi >= T.NWS_DANGER_HI_F) return "danger";
    if (hi >= T.NWS_EXTREME_CAUTION_HI_F) return "extreme-caution";
    if (hi >= T.NWS_CAUTION_HI_F) return "caution";
    return null;
  }

  const AQI_CATEGORIES = [
    { id: "good", name: "Good", min: 0 },
    { id: "moderate", name: "Moderate", min: T.AQI_MODERATE_MIN },
    { id: "usg", name: "Unhealthy for Sensitive Groups", min: T.AQI_USG_MIN },
    { id: "unhealthy", name: "Unhealthy", min: T.AQI_UNHEALTHY_MIN },
    { id: "very-unhealthy", name: "Very Unhealthy", min: T.AQI_VERY_UNHEALTHY_MIN },
    { id: "hazardous", name: "Hazardous", min: T.AQI_HAZARDOUS_MIN },
  ];
  function aqiCategory(aqi) {
    if (!finite(aqi) || aqi < 0) return null;
    const v = whole(aqi);
    let found = AQI_CATEGORIES[0];
    for (const c of AQI_CATEGORIES) if (v >= c.min) found = c;
    return found;
  }
  /** "61, Moderate". */
  const aqiWords = (aqi) => {
    const c = aqiCategory(aqi);
    return c ? `${whole(aqi)}, ${c.name}` : null;
  };

  /* ── Walk ratings, every hour, by the weather alone ── */

  const WALK_FLAG_LABELS = {
    thunder: "thunderstorms likely",
    "heat-alert": "heat at DC's Heat Alert level",
    "cold-alert": "cold at DC's Extreme Cold Alert level",
    "air-unhealthy": "unhealthy air",
    "thunder-possible": "thunderstorms possible",
    heat: "heat",
    pavement: "sunny pavement",
    "air-sensitive": "air unhealthy for sensitive groups",
    rain: "rain likely",
    freezing: "below freezing",
  };
  const FLAG_ORDER = Object.keys(WALK_FLAG_LABELS);
  const SKIP = new Set(["thunder", "heat-alert", "cold-alert", "air-unhealthy"]);

  /** Bryan's words for each kind of hour (2026-09-24), in legend order. */
  const WALK_WORDS = {
    good: "Good for a walk",
    warm: "Getting warm, be cautious",
    cold: "Getting cold, be cautious",
    caution: "Rain, storms or poor air, be cautious",
    "too-hot": "Too hot for Goldens",
    "too-cold": "Too cold for Goldens",
    "storms-air": "Storms or unhealthy air, keep it short",
  };
  const WALK_KINDS = Object.keys(WALK_WORDS);
  const KIND_LEVEL = { good: "good", warm: "take-care", cold: "take-care", caution: "take-care", "too-hot": "skip", "too-cold": "skip", "storms-air": "skip" };
  /** Colour by cause, height by level, so the strip reads without colour too. */
  const WALK_COLORS = { good: "#7CAE7A", warm: "#D4A853", cold: "#D4A853", caution: "#D4A853", "too-hot": "#D6483A", "too-cold": "#0284C7", "storms-air": "#475569" };
  const WALK_HEIGHT = { good: 0.45, warm: 0.72, cold: 0.72, caution: 0.72, "too-hot": 1, "too-cold": 1, "storms-air": 1 };

  /** Skips beat cautions beat good; within skips too hot, then too cold, then the rest. */
  function walkKind(level, flags) {
    if (level === "good") return "good";
    if (level === "skip") return flags.includes("heat-alert") ? "too-hot" : flags.includes("cold-alert") ? "too-cold" : "storms-air";
    return flags.includes("heat") || flags.includes("pavement") ? "warm" : flags.includes("freezing") ? "cold" : "caution";
  }

  function classifyHour(h) {
    const flags = [];
    const hi = hourHeatIndex(h);
    const aqi = finite(h.aqi) ? whole(h.aqi) : null;
    if (isThunderLikely(h)) flags.push("thunder");
    else if (isThunder(h)) flags.push("thunder-possible");
    if (hi !== null && hi >= T.DC_HEAT_ALERT_HI_F) flags.push("heat-alert");
    else if (hi !== null && hi >= T.NWS_CAUTION_HI_F) flags.push("heat");
    if (isExtremeColdHour(h)) flags.push("cold-alert");
    if (aqi !== null && aqi >= T.AQI_UNHEALTHY_MIN) flags.push("air-unhealthy");
    else if (aqi !== null && aqi >= T.AQI_USG_MIN) flags.push("air-sensitive");
    if (isSunnyPavement(h)) flags.push("pavement");
    if (finite(h.pop) && h.pop >= T.RAIN_LIKELY_POP) flags.push("rain");
    if (isFreezing(h)) flags.push("freezing");
    const level = flags.some((f) => SKIP.has(f)) ? "skip" : flags.length > 0 ? "take-care" : "good";
    return { t: h.t, hour: h.hour, level, kind: walkKind(level, flags), flags, heatIndexF: hi };
  }

  /** The rating in words: "Getting warm, be cautious: heat, sunny pavement". */
  function walkWords(w) {
    const words = WALK_WORDS[w.kind];
    return w.flags.length ? `${words}: ${w.flags.map((f) => WALK_FLAG_LABELS[f]).join(", ")}` : words;
  }

  /** The flags among some rated hours, in a fixed order, as words. */
  function flagWords(walkHours) {
    const seen = new Set(walkHours.flatMap((h) => h.flags));
    const flags = FLAG_ORDER.filter((f) => seen.has(f));
    if (seen.has("thunder") && seen.has("thunder-possible")) {
      return listWords(flags.filter((f) => f !== "thunder-possible").map((f) => (f === "thunder" ? "thunderstorms likely or possible" : WALK_FLAG_LABELS[f])));
    }
    return listWords(flags.map((f) => WALK_FLAG_LABELS[f]));
  }

  /** A date's hours still to come: the hour in progress stays in. */
  const remainingHoursOf = (hours, date, now) => hours.filter((h) => h.date === date && h.t + H > now);

  /** The best walk times left on a date: the two longest stretches at the best level on offer. */
  function walkPlan(hours, date, now, zone) {
    const walk = remainingHoursOf(hours, date, now).map(classifyHour);
    if (walk.length === 0) return { kind: "no-hours", date, hours: [] };
    if (walk.every((h) => h.level === "good")) return { kind: "no-flags", date, hours: walk };
    const best = walk.some((h) => h.level === "good") ? "good" : walk.some((h) => h.level === "take-care") ? "take-care" : null;
    if (best === null) return { kind: "all-skip", date, hours: walk };
    const runs = [];
    for (const h of walk) {
      if (h.level !== best) continue;
      const run = runs[runs.length - 1];
      const prev = run && run[run.length - 1];
      if (run && prev && prev.t + H === h.t) run.push(h);
      else runs.push([h]);
    }
    const windows = runs
      .map((run) => {
        const start = run[0].t;
        const end = run[run.length - 1].t + H;
        return { start, end, hours: run.length, level: best, label: formatRange(start, end, zone) };
      })
      .sort((a, b) => b.hours - a.hours || a.start - b.start)
      .slice(0, 2)
      .sort((a, b) => a.start - b.start);
    return { kind: "windows", date, level: best, windows, hours: walk };
  }

  /** The plan in words (dcgoldens display.ts walkSummary). */
  function walkSummary(plan, today, zone) {
    const isToday = plan.date === today;
    const day = dayLabel(plan.date, today);
    const onDay = dayPhrase(plan.date, today);
    switch (plan.kind) {
      case "no-hours":
        return { sentence: isToday ? "The forecast has no hours left for today." : `The forecast doesn't reach ${day} yet.`, note: null };
      case "no-flags":
        return { sentence: isToday ? "No weather flags for the rest of today, so any time works." : `No weather flags ${onDay}, so any time works.`, note: null };
      case "all-skip":
        return { sentence: `Every hour ${isToday ? "left today" : onDay} is flagged for ${flagWords(plan.hours)}. Keep outings to quick breaks.`, note: null };
      case "windows": {
        const labels = plan.windows.map((w) => w.label);
        if (plan.level === "good") {
          const flagged = plan.hours.filter((h) => h.level !== "good");
          return {
            sentence: `Best walk times ${onDay}: ${listWords(labels)}.`,
            note: flagged.length ? `Other hours are flagged for ${flagWords(flagged)}.` : null,
          };
        }
        const w = plan.windows.length === 1 ? wholeDays(plan.windows[0].start, plan.windows[0].end, zone) : null;
        if (w) return { sentence: `Take care ${allDayWords(w, today)}: no hour is free of flags (${flagWords(plan.hours)}).`, note: null };
        const inWindows = plan.hours.filter((h) => plan.windows.some((x) => h.t >= x.start && h.t < x.end));
        return {
          sentence: `No hour ${isToday ? "left today" : onDay} is free of flags. The least flagged: ${listWords(labels)} (${flagWords(inWindows)}).`,
          note: `Flags ${isToday ? "for the rest of today" : onDay}: ${flagWords(plan.hours)}.`,
        };
      }
    }
    return { sentence: "", note: null };
  }

  /* ── Ranges of hours, in words ── */

  function hourRanges(hours, test) {
    const out = [];
    for (const h of hours) {
      if (!test(h)) continue;
      const last = out[out.length - 1];
      if (last && last.end === h.t) last.end = h.t + H;
      else out.push({ start: h.t, end: h.t + H });
    }
    return out;
  }

  /**
   * "today 11am to 1pm and 3pm to 5pm, tomorrow 2pm to 4pm". A range past
   * midnight names the day it ends ("today 10pm to 2am tomorrow"); whole days
   * say "all day"; a range still going where the reading stops says
   * "through at least".
   */
  function describeRanges(ranges, today, zone, max = 3, openEnd = null) {
    const groups = [];
    for (const r of ranges.slice(0, max)) {
      const startDate = PlaceTime.dayKey(r.start * 1000, zone);
      const lastDate = PlaceTime.dayKey((r.end - 1) * 1000, zone);
      const open = r.end === openEnd ? ` through at least ${dayLabel(lastDate, today)}` : null;
      const w = wholeDays(r.start, r.end, zone);
      if (w) {
        groups.push({ day: null, spans: [open ? `all day ${dayLabel(startDate, today)}${open}` : allDayWords(w, today)] });
        continue;
      }
      const day = dayLabel(startDate, today);
      const g = groups[groups.length - 1];
      const span = open ? `${formatClock(r.start, zone)}${open}` : formatRange(r.start, r.end, zone) + (lastDate === startDate ? "" : ` ${dayLabel(lastDate, today)}`);
      if (g && g.day === day) g.spans.push(span);
      else groups.push({ day, spans: [span] });
    }
    return groups.map((g) => (g.day === null ? g.spans[0] : `${g.day} ${g.spans.join(" and ")}`)).join(", ");
  }

  /* ── The six cards ── */

  const HEAT_DOG_EVIDENCE =
    `Goldens have ${T.GOLDEN_VS_LABRADOR_ODDS} times the odds of heatstroke that Labradors do, which the researchers think the thicker coat may explain, ` +
    "and most dog heatstroke follows exercise, usually an ordinary walk.";
  const HEAT_WATCH = "if your golden slows down or stops, end the walk and help them cool off.";

  function heatSignal(hours, when, units) {
    let best = null;
    for (const h of hours) {
      const hi = hourHeatIndex(h);
      if (hi !== null && (!best || hi > best.hi)) best = { hi, t: h.t };
    }
    if (!best || best.hi < T.NWS_CAUTION_HI_F) return null;
    const hi = formatTemp(best.hi, units);
    const range = { start: best.t, end: best.t + H };
    if (best.hi >= T.DC_HEAT_ALERT_HI_F) {
      const extreme = best.hi >= T.DC_EXTREME_HEAT_ALERT_HI_F;
      const level = extreme ? "Extreme Heat Alert" : "Heat Alert";
      const threshold = extreme ? T.DC_EXTREME_HEAT_ALERT_HI_F : T.DC_HEAT_ALERT_HI_F;
      return {
        id: "heat",
        level: "warning",
        headline: `Heat index ${hi} ${when}, at DC's ${level} level`,
        detail:
          `The heat index is a scale made for people, and DC's ${level} level starts at ${formatTemp(threshold, units)}. ` +
          `On the UK's human heat-alert days in 2022, emergency vets saw ${T.UK_ALERT_DAY_CASE_MULTIPLIER} times as many dogs with heatstroke a day as on other summer days. ` +
          `${HEAT_DOG_EVIDENCE} Walk early and late, keep it short, and ${HEAT_WATCH}`,
        sourceIds: ["nws-heat-index-equation", "dc-heat-plan-2026", "beard-2024", "hall-2020-sci-rep", "hall-2020-animals", "vetcompass-early-signs-2021"],
        ranges: [range],
      };
    }
    const category = HEAT_CATEGORY_LABELS[heatCategory(best.hi)] || "Caution";
    return {
      id: "heat",
      level: "caution",
      headline: `Heat index up to ${hi} ${when}`,
      detail:
        `That is the National Weather Service's ${category} range, a scale made for people, and it assumes shade: full sun can add up to ${formatTempDelta(T.FULL_SUN_HI_BOOST_F, units)}. ` +
        `${HEAT_DOG_EVIDENCE} Go in the cooler hours, keep to the shade, and ${HEAT_WATCH}`,
      sourceIds: ["nws-heat-index-equation", "nws-heat-index-categories", "nws-heat-index-sun", "hall-2020-sci-rep", "hall-2020-animals", "vetcompass-early-signs-2021"],
      ranges: [range],
    };
  }

  function pavementSignal(hours, today, zone, units) {
    const ranges = hourRanges(hours, isSunnyPavement);
    if (ranges.length === 0) return null;
    const [lo, hi] = T.SUN_VS_SHADE_DELTA_F;
    const [fewest, most] = T.HAND_TEST_SECONDS;
    return {
      id: "pavement",
      level: "caution",
      headline: `Sunny pavement ${describeRanges(ranges, today, zone)}`,
      detail:
        `On a ${formatTemp(T.SUN_VS_SHADE_AIR_F, units)} day in Las Vegas, researchers measured sunlit surfaces, asphalt and concrete among them, ${formatTempDelta(lo, units)} to ${formatTempDelta(hi, units)} hotter than the same material in shade, ` +
        "so grass and shade are the cooler way through these hours. " +
        `Resting the back of your hand on the pavement is a sensible habit, though the advice on how long ranges from ${fewest} to ${most} seconds and none of it has been tested.`,
      sourceIds: ["chestovich-2022", "wsu-hand-test-2017", "akc-hand-test", "dogs-trust-hand-test"],
      ranges,
    };
  }

  function stormHeadline(hours, today, zone, max = 3) {
    const possible = hourRanges(hours, isThunder);
    if (possible.length === 0) return null;
    const likely = hourRanges(hours, isThunderLikely);
    if (likely.length === 0) return `Thunderstorms possible ${describeRanges(possible, today, zone, max)}`;
    const chanceOnly = hourRanges(hours, (h) => isThunder(h) && !isThunderLikely(h));
    const rest = chanceOnly.length ? `, possible ${describeRanges(chanceOnly, today, zone, max)}` : "";
    return `Thunderstorms likely ${describeRanges(likely, today, zone, max)}${rest}`;
  }

  function stormSignal(hours, today, zone) {
    const headline = stormHeadline(hours, today, zone);
    if (headline === null) return null;
    const [lo, hi] = T.NWS_CHANCE_PERCENT;
    const nws = hours.some(isThunderLikely)
      ? `The National Weather Service calls them likely, which it uses for a ${T.NWS_LIKELY_MIN_PERCENT}% chance or more. `
      : `The National Weather Service gives them a ${lo} to ${hi}% chance. `;
    return {
      id: "storms",
      level: "info",
      headline,
      detail:
        nws +
        `Almost a third of dogs are sensitive to noise (${T.NOISE_SENSITIVE_PERCENT}% of 13,700 dogs in a Finnish study), and fear of thunder grows with age. ` +
        "Notice is what helps: walk before it arrives, and set up a quiet spot ahead of time. " +
        "If storms upset your golden, talk to your vet before storm season.",
      sourceIds: ["nws-api", "nws-pfm-spec", "salonen-2020"],
      ranges: hourRanges(hours, isThunder),
    };
  }

  const CSU = "Colorado State University's College of Veterinary Medicine and Biomedical Sciences adapted it for pets, and at this level suggests";
  const MORNINGS = "Mornings are usually better on ozone days.";
  function airSignal(hours, when) {
    let max = null;
    for (const h of hours) if (finite(h.aqi) && (max === null || h.aqi > max)) max = h.aqi;
    const cat = aqiCategory(max);
    if (max === null || !cat) return null;
    const human = "That is the EPA's air quality index, a scale made for people.";
    const headline = `Air quality ${when}: ${cat.name}, AQI ${whole(max)}`;
    if (cat.id === "good" || cat.id === "moderate") return { id: "air", level: "info", headline, detail: human, sourceIds: ["epa-aqi"], ranges: [] };
    const advice =
      cat.id === "usg"
        ? `${CSU} less time outside for every dog, and bathroom breaks only for sensitive dogs, among them puppies, seniors, overweight dogs, and dogs with allergies or heart or lung trouble. ${MORNINGS}`
        : cat.id === "unhealthy"
        ? `${CSU} limiting time outside for every dog, and walking rather than running. ${MORNINGS}`
        : `${CSU} keeping dogs inside as much as you can.`;
    return { id: "air", level: cat.id === "usg" ? "caution" : "warning", headline, detail: `${human} ${advice}`, sourceIds: ["epa-aqi", "csu-pet-aqi-2026"], ranges: [] };
  }

  function saltSignal(hours) {
    const ranges = hourRanges(hours, isWinterWeather);
    if (ranges.length === 0) return null;
    return {
      id: "salt",
      level: "caution",
      headline: "Salt is probably down on the sidewalks",
      detail:
        "Snow or ice in the last two days or the next one usually means ice melt on the sidewalks. " +
        "It irritates paw pads and can poison a dog who eats enough of it, so wipe or rinse your golden's paws after the walk, before they lick them.",
      sourceIds: ["merck-salt-toxicosis", "aspca-ice-melt"],
      ranges,
    };
  }

  function tooColdLine(hours, today) {
    const days = [...new Set(hours.filter(isExtremeColdHour).map((h) => h.date))];
    if (days.length === 0) return null;
    const when = days.length > 2 ? `from ${dayLabel(days[0], today)} through ${dayLabel(days[days.length - 1], today)}` : listWords(days.map((d) => dayPhrase(d, today)));
    return `Some hours ${when} are too cold for Goldens: they reach DC's Extreme Cold Alert level, a line made for people.`;
  }

  function coldSignal(hours, today, zone, units, openEnd = null) {
    const ranges = hourRanges(hours, isFreezing);
    if (ranges.length === 0) return null;
    const tooCold = tooColdLine(hours, today);
    return {
      id: "cold",
      level: "info",
      headline: `Below freezing ${describeRanges(ranges, today, zone, 3, openEnd)}`,
      detail:
        `DC law counts anything below ${formatTemp(T.DC_EXTREME_COLD_F, units)} as extreme weather, when a dog can't be left outside for more than ${T.DC_UNATTENDED_MINUTES} minutes without a person or proper shelter, unless its age, condition and type let it handle the cold. ` +
        "That rule is about dogs left out, not walks. On a walk, salt and ice are the usual winter hazards, and puppies, seniors and sick dogs keep warm less well." +
        (tooCold ? ` ${tooCold}` : ""),
      sourceIds: tooCold ? ["dc-code-8-1801", "dc-code-8-1808", "purdue-va-16-w", "dc-winter-plan-fy26"] : ["dc-code-8-1801", "dc-code-8-1808", "purdue-va-16-w"],
      ranges,
    };
  }

  const LEVEL_ORDER = { warning: 0, caution: 1, info: 2 };
  const ID_ORDER = { heat: 0, storms: 1, air: 2, pavement: 3, salt: 4, cold: 5 };

  /**
   * Every card for the next `ahead` hours, most serious first, as dcgoldens'
   * compact panel reads them: the hour in progress on to now + ahead, day and
   * night. A range card follows a stretch past that end as far as the
   * forecast's last day; heat and air name the earliest day at their most
   * serious level. Storms look 48 hours ahead; salt 48 back and 24 ahead.
   * `stormsKnown` false (no usable Weather Service forecast) leaves the
   * storm card out; the page then says the forecast is missing.
   */
  function dogSignals({ hours, now, zone, units, ahead = 24, horizonDays = 6 }) {
    const today = PlaceTime.dayKey(now * 1000, zone);
    const dayHours = hours.filter((h) => h.t + H > now && h.t < now + ahead * H);
    if (dayHours.length === 0) return [];
    const horizon = addDays(today, horizonDays);
    const throughEnd = (test) => {
      const out = [...dayHours];
      const last = out[out.length - 1];
      if (!last || !test(last)) return { hours: out, openEnd: null };
      for (const h of hours) {
        if (h.t <= last.t) continue;
        if (h.t !== out[out.length - 1].t + H || !test(h)) return { hours: out, openEnd: null };
        if (h.date > horizon) break;
        out.push(h);
      }
      return { hours: out, openEnd: out[out.length - 1].t + H };
    };
    const byDay = (card) => {
      let pick = null;
      for (const date of new Set(dayHours.map((h) => h.date))) {
        const s = card(dayHours.filter((h) => h.date === date), dayPhrase(date, today));
        if (s && (!pick || LEVEL_ORDER[s.level] < LEVEL_ORDER[pick.level])) pick = s;
      }
      return pick;
    };
    const storms = hours.filter((h) => h.t + H > now && h.t < now + T.STORM_LOOKAHEAD_HOURS * H);
    const salt = hours.filter((h) => h.t + H > now - T.SALT_LOOKBACK_HOURS * H && h.t < now + T.SALT_LOOKAHEAD_HOURS * H);
    const cold = throughEnd(isFreezing);
    const all = [
      byDay((hs, when) => heatSignal(hs, when, units)),
      stormSignal(storms, today, zone),
      byDay(airSignal),
      pavementSignal(throughEnd(isSunnyPavement).hours, today, zone, units),
      saltSignal(salt),
      coldSignal(cold.hours, today, zone, units, cold.openEnd),
    ].filter(Boolean);
    return all.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || ID_ORDER[a.id] - ID_ORDER[b.id]);
  }

  /** No Weather Service word for any of the next 48 hours: the storm line would be silent for the wrong reason. */
  function stormForecastMissing(hours, now) {
    const storms = hours.filter((h) => h.t + H > now && h.t < now + T.STORM_LOOKAHEAD_HOURS * H);
    return storms.length > 0 && storms.every((h) => h.storm === null || h.storm === undefined);
  }

  /* ── The National Weather Service's thunderstorm words (dcgoldens nws-core.ts) ── */

  const SLIGHT_COVERAGE = new Set(["slight_chance", "isolated", "few", "patchy"]);
  const LIKELY_COVERAGE = new Set(["likely", "numerous", "definite", "widespread", "occasional", "periods", "frequent"]);
  const WORD_BY_RANK = ["none", "slight", "chance", "likely"];
  /** Chance, scattered, areas, unknown and anything new all read "chance": never "likely" by accident. */
  function coverageWord(coverage) {
    if (typeof coverage === "string" && SLIGHT_COVERAGE.has(coverage)) return "slight";
    if (typeof coverage === "string" && LIKELY_COVERAGE.has(coverage)) return "likely";
    return "chance";
  }
  /** Only entries whose weather is exactly "thunderstorms" count. */
  function stormWordOf(entries) {
    if (!Array.isArray(entries)) return "none";
    let best = "none";
    for (const e of entries) {
      if (!e || typeof e !== "object" || e.weather !== "thunderstorms") continue;
      const w = coverageWord(e.coverage);
      if (STORM_RANK[w] > STORM_RANK[best]) best = w;
    }
    return best;
  }
  const MAX_INTERVAL = 16 * 86400;
  const DURATION = /^P(?:(\d{1,3})D)?(?:T(?:(\d{1,4})H)?(?:(\d{1,4})M)?(?:(\d{1,5})S)?)?$/;
  function durationSeconds(s) {
    if (typeof s !== "string" || s === "P" || s === "PT" || s.endsWith("T")) return null;
    const m = DURATION.exec(s);
    if (!m) return null;
    const [d, h, mi, se] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
    const total = d * 86400 + h * H + mi * 60 + se;
    return total > 0 && total <= MAX_INTERVAL ? total : null;
  }
  const INSTANT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(Z|[+-]\d{2}:?\d{2})$/;
  function instantSeconds(s) {
    if (typeof s !== "string") return null;
    const m = INSTANT.exec(s);
    if (!m) return null;
    const off = m[2] === "Z" || m[2].includes(":") ? m[2] : `${m[2].slice(0, 3)}:${m[2].slice(3)}`;
    const ms = Date.parse(`${m[1]}${off}`);
    return Number.isFinite(ms) ? ms / 1000 : null;
  }
  function validityInterval(v) {
    if (typeof v !== "string") return null;
    const parts = v.split("/");
    if (parts.length !== 2) return null;
    const start = instantSeconds(parts[0]);
    if (start === null) return null;
    if (parts[1].startsWith("P")) {
      const d = durationSeconds(parts[1]);
      return d === null ? null : { start, end: start + d };
    }
    const end = instantSeconds(parts[1]);
    if (end === null || end <= start || end - start > MAX_INTERVAL) return null;
    return { start, end };
  }
  /** The office and grid square, checked; the grid URL is built from these alone. */
  function parsePoint(raw) {
    const p = raw && raw.properties;
    if (!p || !/^[A-Z]{3}$/.test(p.gridId) || !Number.isInteger(p.gridX) || !Number.isInteger(p.gridY) || p.gridX < 0 || p.gridY < 0 || p.gridX > 1000 || p.gridY > 1000) {
      throw new Error("NWS_POINT_SHAPE");
    }
    return { gridId: p.gridId, gridX: p.gridX, gridY: p.gridY };
  }
  /** Every hour's highest thunderstorm word: [[unixHour, rank], ...]. */
  function parseStormGrid(raw) {
    const p = raw && raw.properties;
    const values = p && p.weather && p.weather.values;
    if (!p || typeof p.updateTime !== "string" || !Array.isArray(values)) throw new Error("NWS_GRID_SHAPE");
    const byT = new Map();
    for (const item of values) {
      const span = item && typeof item === "object" ? validityInterval(item.validTime) : null;
      if (!span) continue;
      const rank = STORM_RANK[stormWordOf(item.value)];
      for (let t = Math.floor(span.start / H) * H; t < span.end; t += H) {
        const prev = byT.get(t);
        if (prev === undefined || rank > prev) byT.set(t, rank);
      }
    }
    return { updateTime: p.updateTime, hours: [...byT.entries()].sort((a, b) => a[0] - b[0]).slice(0, 16 * 24) };
  }
  /** Issued within 12 hours, and not more than an hour in the future. */
  function stormUpdateUsable(updateTime, now) {
    const t = instantSeconds(updateTime);
    return t !== null && now - t <= T.NWS_MAX_AGE_HOURS * H && t - now <= H;
  }
  const stormWordForRank = (rank) => (rank === undefined ? null : WORD_BY_RANK[rank] ?? null);

  /* ── Paw to grass: DC Goldens' pick for a golden, to the minute ── */

  const TIE_F = 1e-9;
  /**
   * The minute from `from` up to `to` whose In the sun reading (readSun(t),
   * the curve the chart draws, °F) comes closest to 57°F, inside 45 to 64°F
   * in whole °F, in daylight (between the day's sunrise and sunset), with
   * both hours around it rated Good for a walk. Ties go to the earlier
   * minute. Returns the best, each date's best, and why there is none.
   */
  function scanPawToGrass({ hours, sunDays, readSun, from, to }) {
    const sorted = [...hours].sort((a, b) => a.t - b.t);
    const sunOf = new Map(sunDays.map((d) => [d.date, d]));
    const own = new Map();
    let best = null;
    let anyGood = false;
    let allAbove = true;
    let allBelow = true;
    let flaggedInBand = false;
    const first = Math.ceil(from / MINUTE) * MINUTE;
    for (let i = 0; i < sorted.length; i++) {
      const h0 = sorted[i];
      if (h0.t + H <= first || h0.t >= to) continue;
      const next = sorted[i + 1];
      const h1 = next && next.t === h0.t + H ? next : null;
      const good0 = classifyHour(h0).level === "good";
      const good1 = h1 !== null && classifyHour(h1).level === "good";
      const sun = sunOf.get(h0.date);
      const rise = sun ? sun.sunrise : null;
      const set = sun ? sun.sunset : null;
      for (let t = Math.max(h0.t, first); t < h0.t + H && t < to; t += MINUTE) {
        const up = rise !== null && set !== null ? t >= rise && t < set : h0.isDay === true;
        if (!up) continue;
        const v = readSun(t);
        if (v === null || !finite(v)) continue;
        const w = whole(v);
        const inBand = w >= T.PAW_TO_GRASS_MIN_F && w <= T.PAW_TO_GRASS_MAX_F;
        if (!good0 || (t !== h0.t && !good1)) {
          if (inBand) flaggedInBand = true;
          continue;
        }
        anyGood = true;
        if (w <= T.PAW_TO_GRASS_MAX_F) allAbove = false;
        if (w >= T.PAW_TO_GRASS_MIN_F) allBelow = false;
        if (!inBand) continue;
        const d = Math.abs(v - T.PAW_TO_GRASS_TARGET_F);
        const mine = own.get(h0.date);
        const beatsDay = !mine || d < mine.d - TIE_F;
        const beatsAll = !best || d < best.d - TIE_F;
        if (!beatsDay && !beatsAll) continue;
        const pick = { t, date: h0.date, sunF: v, wholeF: w };
        if (beatsDay) own.set(h0.date, { pick, d });
        if (beatsAll) best = { pick, d };
      }
    }
    if (best) return { best: best.pick, days: [...own.values()].map((o) => o.pick), reason: null };
    const reason = !anyGood ? "no-good-hours" : flaggedInBand ? "not-good" : allAbove ? "too-warm" : allBelow ? "too-cold" : "none";
    return { best: null, days: [], reason };
  }

  function pawReasonWords(reason, units) {
    switch (reason) {
      case "too-warm":
        return `Every good daylight hour is ${formatTemp(T.PAW_TO_GRASS_MAX_F + 1, units)} or warmer in the sun.`;
      case "too-cold":
        return `Every good daylight hour is ${formatTemp(T.PAW_TO_GRASS_MIN_F - 1, units)} or cooler in the sun.`;
      case "not-good":
        return "The hours that would fit are flagged for the weather, so none is good for a walk.";
      case "no-good-hours":
        return "None of the daylight hours ahead is good for a walk.";
      default:
        return `No good daylight hour comes out between ${formatTemp(T.PAW_TO_GRASS_MIN_F, units)} and ${formatTemp(T.PAW_TO_GRASS_MAX_F, units)} in the sun.`;
    }
  }

  /** "8:43am" today in the 24-hour view, else "8:43am tomorrow" / "2:05pm Monday". */
  function grassWhen(t, now, zone, week) {
    const day = dayLabel(PlaceTime.dayKey(t * 1000, zone), PlaceTime.dayKey(now * 1000, zone));
    const clock = formatClock(t, zone);
    return !week && day === "today" ? clock : `${clock} ${day}`;
  }

  /**
   * The caption under the chart: "Paw to grass for Goldens: 8:43am tomorrow,
   * 57°F in the sun." (24 hours) / "Paw to grass for Goldens this week: ...
   * A paw marks each day's best." (week), or none and why.
   */
  function pawCaption({ day, week, now, zone, units, weekView, weekMarks = 0 }) {
    const words = (pick, isWeek) =>
      `Paw to grass for Goldens${isWeek ? " this week" : ""}: ${grassWhen(pick.t, now, zone, isWeek)}, ${formatTemp(pick.wholeF, units)} in the sun.`;
    if (weekView) {
      if (week && week.best) return `${words(week.best, true)}${weekMarks > 1 ? " A paw marks each day's best." : ""}`;
      return `No paw-to-grass time for Goldens in the next 7 days. ${pawReasonWords((week && week.reason) || "none", units)}`;
    }
    if (day && day.best) return words(day.best, false);
    if (week && !week.best) return `No paw-to-grass time for Goldens in the next 7 days. ${pawReasonWords(week.reason || "none", units)}`;
    const rest = week && week.best ? ` This week's best is ${grassWhen(week.best.t, now, zone, true)}.` : "";
    return `No paw-to-grass time for Goldens in the next 24 hours. ${pawReasonWords((day && day.reason) || "none", units)}${rest}`;
  }

  const VibeDogs = {
    T,
    H,
    formatTemp,
    formatTempDelta,
    formatClock,
    formatRange,
    dayLabel,
    dayPhrase,
    listWords,
    wholeDays,
    localParts,
    isThunder,
    isThunderLikely,
    isWinterWeather,
    isSunnyPavement,
    isFreezing,
    windChillF,
    isExtremeColdHour,
    hourHeatIndex,
    aqiCategory,
    aqiWords,
    WALK_WORDS,
    WALK_KINDS,
    KIND_LEVEL,
    WALK_COLORS,
    WALK_HEIGHT,
    WALK_FLAG_LABELS,
    classifyHour,
    walkWords,
    walkPlan,
    walkSummary,
    hourRanges,
    describeRanges,
    heatSignal,
    pavementSignal,
    stormHeadline,
    stormSignal,
    airSignal,
    saltSignal,
    coldSignal,
    tooColdLine,
    dogSignals,
    stormForecastMissing,
    coverageWord,
    stormWordOf,
    durationSeconds,
    instantSeconds,
    validityInterval,
    parsePoint,
    parseStormGrid,
    stormUpdateUsable,
    stormWordForRank,
    scanPawToGrass,
    pawReasonWords,
    pawCaption,
    grassWhen,
  };
  root.VibeDogs = VibeDogs;
  if (typeof module === "object" && module.exports) module.exports = VibeDogs;
})(typeof window !== "undefined" ? window : globalThis);
