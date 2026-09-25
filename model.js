// Bryan's Vibe Temp model: how warm it feels in the shade and in the sun.
// Pure functions of their inputs and a calibration, so tests/*.test.mjs can
// run them in Node. scripts.js passes the page's calibration and surface.
(function (root) {
  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  // °F: air temperature, plus 1°F per (1 / humidityCoeff) points of humidity
  // above the baseline, minus windCoeff °F per mph.
  function shadeVibeOf(T, RH, Wind, calibration) {
    return (
      T +
      (RH - calibration.humidityBaseline) / (1 / calibration.humidityCoeff) -
      calibration.windCoeff * Wind
    );
  }

  function sunVibeOf(shadeV, solarExposure, R, calibration) {
    // Only apply reflectivity when there's actual solar exposure
    const reflectivityEffect =
      solarExposure > 0 ? calibration.reflectCoeff * R : 0;
    return (
      shadeV + calibration.solarCoeff * solarExposure + reflectivityEffect
    );
  }

  // The share of sunlight arriving as a direct beam under a clear sky. A
  // first guess from DC's clear middays in 2025 (0.80 to 0.84): a beam share
  // at or above it counts as no cloud at all.
  const BEAM_SHARE_CLEAR = 0.85;

  const finite = (v) => typeof v === "number" && Number.isFinite(v);

  // The cloud cover the sun term reads, %. Open-Meteo's cloud_cover calls
  // thin high cloud 90 to 100% with the sun plainly out, and reads clear at
  // dawn when the sun is a few degrees up, so the cloud is taken from the
  // direct beam's share of the sunlight instead (both are means over the
  // preceding hour, so their ratio is consistent). Sunlight that reads 0
  // means none reached the ground: 100, no sun term. Only a missing reading
  // falls back to cloud_cover (approved by Bryan for dcgoldens, 2026-09-24).
  function effectiveCloudPct({ cloud_cover, shortwave_radiation, direct_radiation }) {
    if (!finite(shortwave_radiation) || !finite(direct_radiation)) return cloud_cover;
    if (shortwave_radiation <= 0) return 100;
    return 100 * clamp(1 - direct_radiation / shortwave_radiation / BEAM_SHARE_CLEAR, 0, 1);
  }

  // Solar exposure, 0 to 1: the UV index against its clear-sky value (or
  // over 10 without one), dimmed by the effective cloud. Zero at night.
  function solarFromUVandCloud(inputs, calibration) {
    const { uv_index, uv_index_clear_sky, is_day } = inputs;
    const isDaylight = is_day === 1 || is_day === true;
    const baseUV =
      typeof uv_index_clear_sky === "number" && uv_index_clear_sky > 0
        ? uv_index / uv_index_clear_sky
        : typeof uv_index === "number"
        ? uv_index / 10
        : 0;
    const cloud = effectiveCloudPct(inputs);
    const cloudAtten = 1 - Math.pow((cloud ?? 0) / 100, calibration.cloudExp);
    const solar = isDaylight ? baseUV * cloudAtten : 0;
    return clamp(solar, 0, 1);
  }

  const VibeModel = {
    BEAM_SHARE_CLEAR,
    clamp,
    shadeVibeOf,
    sunVibeOf,
    effectiveCloudPct,
    solarFromUVandCloud,
  };
  root.VibeModel = VibeModel;
  if (typeof module === "object" && module.exports) module.exports = VibeModel;
})(typeof window !== "undefined" ? window : globalThis);
