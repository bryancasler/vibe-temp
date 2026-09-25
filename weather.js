// Weather rules that are not Bryan's model: the NWS heat index, words for a
// weather code. Ported from dcgoldens (src/lib/weather). Pure, so
// tests/weather.test.mjs can run them in Node.
(function (root) {
  const finite = (v) => typeof v === "number" && Number.isFinite(v);

  // The NWS heat index (°F), as the Weather Prediction Center publishes it
  // (wpc.ncep.noaa.gov/html/heatindex_equation.shtml), from air temperature
  // (°F) and relative humidity (%). A scale made for people, in shade and
  // light wind. Open-Meteo's apparent_temperature is a different figure
  // (Steadman's).
  // 1. The simple formula, 0.5 × {T + 61 + [(T - 68) × 1.2] + (RH × 0.094)}.
  // 2. If that is 80°F or more, the Rothfusz regression instead,
  // 3. less the low-humidity adjustment (RH < 13%, 80 <= T <= 112), or plus
  //    the high-humidity one (RH > 85%, 80 <= T <= 87).
  function heatIndexF(T, RH) {
    const simple = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + RH * 0.094);
    if (simple < 80) return simple;
    let hi =
      -42.379 +
      2.04901523 * T +
      10.14333127 * RH -
      0.22475541 * T * RH -
      0.00683783 * T * T -
      0.05481717 * RH * RH +
      0.00122874 * T * T * RH +
      0.00085282 * T * RH * RH -
      0.00000199 * T * T * RH * RH;
    if (RH < 13 && T >= 80 && T <= 112) {
      hi -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    } else if (RH > 85 && T >= 80 && T <= 87) {
      hi += ((RH - 85) / 10) * ((87 - T) / 5);
    }
    return hi;
  }

  // In whole degrees, as the NWS reports it, so a rule never disagrees with
  // the number printed beside it. Null when an input is missing.
  function heatIndexOrNull(tempF, rh) {
    if (!finite(tempF) || !finite(rh)) return null;
    return Math.round(heatIndexF(tempF, rh));
  }

  // The NWS heat index categories start at 80°F ("Caution").
  const HEAT_INDEX_CAUTION_F = 80;

  // Words for a WMO weather code, as Open-Meteo gives them.
  function conditionLabel(code, isDay = true) {
    if (!finite(code)) return null;
    switch (code) {
      case 0:
        return isDay === false ? "Clear" : "Sunny";
      case 1:
        return isDay === false ? "Mostly clear" : "Mostly sunny";
      case 2:
        return "Partly cloudy";
      case 3:
        return "Cloudy";
      case 45:
      case 48:
        return "Fog";
      case 51:
      case 53:
        return "Drizzle";
      case 55:
        return "Heavy drizzle";
      case 56:
      case 57:
        return "Freezing drizzle";
      case 61:
        return "Light rain";
      case 63:
        return "Rain";
      case 65:
        return "Heavy rain";
      case 66:
      case 67:
        return "Freezing rain";
      case 71:
        return "Light snow";
      case 73:
        return "Snow";
      case 75:
        return "Heavy snow";
      case 77:
        return "Snow grains";
      case 80:
      case 81:
        return "Showers";
      case 82:
        return "Heavy showers";
      case 85:
      case 86:
        return "Snow showers";
      case 95:
      case 97:
        return "Thunderstorms";
      case 96:
      case 99:
        return "Thunderstorms with hail";
      default:
        return null;
    }
  }

  const VibeWeather = { heatIndexF, heatIndexOrNull, HEAT_INDEX_CAUTION_F, conditionLabel };
  root.VibeWeather = VibeWeather;
  if (typeof module === "object" && module.exports) module.exports = VibeWeather;
})(typeof window !== "undefined" ? window : globalThis);
