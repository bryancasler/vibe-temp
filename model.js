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

  // Solar exposure, 0 to 1: the UV index against its clear-sky value (or
  // over 10 without one), dimmed by cloud. Zero at night.
  function solarFromUVandCloud(
    { uv_index, uv_index_clear_sky, cloud_cover, is_day },
    calibration
  ) {
    const isDaylight = is_day === 1 || is_day === true;
    const baseUV =
      typeof uv_index_clear_sky === "number" && uv_index_clear_sky > 0
        ? uv_index / uv_index_clear_sky
        : typeof uv_index === "number"
        ? uv_index / 10
        : 0;
    const cloudAtten = 1 - Math.pow((cloud_cover ?? 0) / 100, calibration.cloudExp);
    const solar = isDaylight ? baseUV * cloudAtten : 0;
    return clamp(solar, 0, 1);
  }

  const VibeModel = { clamp, shadeVibeOf, sunVibeOf, solarFromUVandCloud };
  root.VibeModel = VibeModel;
  if (typeof module === "object" && module.exports) module.exports = VibeModel;
})(typeof window !== "undefined" ? window : globalThis);
