(() => {
  // Chart.js, pinned. chart.umd.js is the file as published to npm (already
  // minified); jsDelivr's .min.js is generated on request and its own header
  // says not to use SRI with it. The hash was checked against the npm tarball.
  const CHART_JS_URL =
    "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.js";
  const CHART_JS_INTEGRITY =
    "sha384-tgbB5AKnszdcfwcZtTfuhR3Ko1XZdlDfsLtkxiiAZiVkkXCkFmp+FQFh+V/UTo54";
  let CHART_READY = null;

  function loadScriptOnce(src, integrity) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) {
        if (window.Chart) return resolve();
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", (e) => reject(e));
        return;
      }
      const s = document.createElement("script");
      s.src = src;
      if (integrity) {
        s.integrity = integrity;
        s.crossOrigin = "anonymous";
      }
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => {
        s.remove();
        reject(e);
      };
      document.head.appendChild(s);
    });
  }
  function ensureChartJs() {
    if (!CHART_READY) {
      CHART_READY = loadScriptOnce(CHART_JS_URL, CHART_JS_INTEGRITY).catch(
        (e) => {
          CHART_READY = null; // let the next render try again
          throw e;
        }
      );
    }
    return CHART_READY;
  }
  // Start downloading Chart.js now, alongside the weather requests, rather
  // than after all the data is in.
  ensureChartJs().catch(() => {});

  // DOM ready helper (works if script loads after DOM or with defer)
  const onReady = (cb) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", cb, { once: true });
    } else {
      cb();
    }
  };

  onReady(() => {
    // Elements
    const $ = (s) => document.querySelector(s);

    // localStorage, safely: a private window, blocked site data or a full
    // disk makes every call throw, and the page has to work without it.
    // Keys are versioned (vibe.v1.<name>); values saved under the old
    // names move over once.
    const STORE = "vibe.v1.";
    const storeGet = (key) => {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    };
    const storeSet = (key, value) => {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    };
    const storeRemove = (key) => {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    };
    const storeJSON = (key, fallback) => {
      try {
        const raw = storeGet(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    };
    (function migrateStorage() {
      const legacy = {
        vibeTheme: "theme",
        vibeTemp_advConfigExpanded: "advExpanded",
        vibeUnit: "unit",
        vibeZip: "zip",
        vibeDaysAhead: "daysAhead",
        vibeNightShading: "nightShading",
        vibeNightLineDarkening: "nightLineDarkening",
        vibeLineSmoothing: "lineSmoothing",
        vibeFavorites: "favorites",
        vibeChartColors: "chartColors",
        vibeTempZones: "tempZones",
        vibeHumidityVis: "humidityVis",
        vibeSunMarkers: "sunMarkers",
        vibeRainIcons: "rainIcons",
        vibeSnowIcons: "snowIcons",
        vibeIceIcons: "iceIcons",
        vibeWindIcons: "windIcons",
        vibeCalibration: "calibration",
      };
      for (const [old, name] of Object.entries(legacy)) {
        const value = storeGet(old);
        if (value === null) continue;
        if (storeGet(STORE + name) === null) storeSet(STORE + name, value);
        storeRemove(old);
      }
    })();
    const statusEl = $("#status");
    const chartStatusEl = $("#chartStatus");
    const chartTitleEl = $(".chart-title");
    const chartBox = $("#chartBox");
    const clearHighlightBtn = $("#clearHighlight");
    const notificationEl = $("#notification");
    const weatherSummaryEl = $("#weatherSummary");
    const summaryTextEl = $("#summaryText");
    const summaryTimeRangeEl = $("#summaryTimeRange");
    const summaryTitleEl = $("#weatherSummary .summary-title");
    const remainderOfDaySummaryEl = $("#remainderOfDaySummary");
    const remainderTextEl = $("#remainderText");
    const remainderTimeRangeEl = $("#remainderTimeRange");
    const expiredModalEl = $("#expiredModal");
    const keepCustomBtn = $("#keepCustomBtn");
    const useDefaultsBtn = $("#useDefaultsBtn");
    const chartSkeletonEl = $("#chartSkeleton");
    const errorMessageEl = $("#errorMessage");
    const errorTitleEl = $(".error-title");
    const errorDetailsEl = $(".error-details");
    const errorSuggestionEl = $(".error-suggestion");
    const errorRetryBtn = $("#errorRetryBtn");
    const errorZipInput = $("#errorZipInput");
    const errorZipInputWrapper = $(".error-zip-input-wrapper");
    const errorZipSubmitBtn = $("#errorZipSubmitBtn");
    const errorDismissBtn = $("#errorDismissBtn");
    const copySummaryBtn = $("#copySummaryBtn");
    const shortcutsModalEl = $("#shortcutsModal");
    const closeShortcutsBtn = $("#closeShortcutsBtn");
    const gpsLocationBtn = $("#gpsLocationBtn");
    const headlineDateEl = $("#headlineDate");
    const presetTodayBtn = $("#presetToday");
    const cardsContainer = $(".cards");
    const presetTomorrowBtn = $("#presetTomorrow");
    const presetDefaultBtn = $("#presetDefault");
    const presetWeekBtn = $("#presetWeek");
    const preset3DayBtn = $("#preset3Day");
    const preset5DayBtn = $("#preset5Day");
    const presetOneWeekBtn = $("#presetOneWeek");
    // Track date offset for day navigation (0 = today, 1 = tomorrow, -1 = yesterday, etc.)
    let dateOffset = 0;

    // Helper function to get ordinal suffix (st, nd, rd, th)
    function getOrdinalSuffix(day) {
      const j = day % 10;
      const k = day % 100;
      if (j === 1 && k !== 11) return "st";
      if (j === 2 && k !== 12) return "nd";
      if (j === 3 && k !== 13) return "rd";
      return "th";
    }

    // Function to update headline date display
    function updateHeadlineDate() {
      if (headlineDateEl) {
        // Today at the place, not in the browser's zone
        const today = new Date(
          PlaceTime.startOfDay(new Date(), placeZone, dateOffset)
        );

        // If week is selected (daysAhead === 7), show date range
        if (daysAhead === 7) {
          const startDate = today;
          // 7 days total (0-6 = 7 days)
          const endDate = new Date(PlaceTime.startOfDay(today, placeZone, 6));

          // Format with full month names and ordinals: "January 5th - 11th" or "January 5th - February 3rd"
          const startMonth = startDate.toLocaleDateString(
            "en-US",
            inZone({ month: "long" })
          );
          const startDay = zp(startDate).day;
          const startOrdinal = getOrdinalSuffix(startDay);
          const endMonth = endDate.toLocaleDateString(
            "en-US",
            inZone({ month: "long" })
          );
          const endDay = zp(endDate).day;
          const endOrdinal = getOrdinalSuffix(endDay);

          if (startMonth === endMonth) {
            headlineDateEl.textContent = `${startMonth}, ${startDay}${startOrdinal} - ${endDay}${endOrdinal}`;
          } else {
            headlineDateEl.textContent = `${startMonth}, ${startDay}${startOrdinal} - ${endMonth}, ${endDay}${endOrdinal}`;
          }
        } else {
          // Single date format with full month name and ordinal, no year
          const month = today.toLocaleDateString(
            "en-US",
            inZone({ month: "long" })
          );
          const day = zp(today).day;
          const ordinal = getOrdinalSuffix(day);
          headlineDateEl.textContent = `${month}, ${day}${ordinal}`;
        }
      }
    }

    const favoritesDropdown = $("#favoritesDropdown");
    const favoritesToggle = $("#favoritesToggle");
    const favoritesList = $("#favoritesList");
    const notificationsBtn = $("#notificationsBtn");
    const themeToggle = $("#themeToggle");

    // Theme management - respect browser preference by default
    const THEME_KEY = STORE + "theme";
    function getDefaultTheme() {
      // Check if user has a saved preference
      const saved = storeGet(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;

      // Otherwise, respect browser preference
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches
      ) {
        return "light";
      }
      return "dark";
    }

    let currentTheme = getDefaultTheme();
    let vibeChart = null; // Declare early to avoid reference errors

    // Only a choice made with the toggle is saved, so a page that follows
    // the browser's preference keeps following it.
    function applyTheme(theme, { persist = false } = {}) {
      document.documentElement.setAttribute("data-theme", theme);
      currentTheme = theme;
      if (persist) storeSet(THEME_KEY, theme);
      if (themeToggle) {
        themeToggle.textContent =
          theme === "dark" ? "\u{1F319}" : "\u{2600}\u{FE0F}"; // Use Unicode for moon and sun emojis
      }
      // Update chart to reflect new theme (especially day/night shading)
      if (vibeChart) {
        vibeChart.update("none");
      }
    }

    function toggleTheme() {
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(newTheme, { persist: true });
    }

    // Listen for system theme changes
    if (window.matchMedia) {
      window
        .matchMedia("(prefers-color-scheme: light)")
        .addEventListener("change", (e) => {
          // Only auto-update if user hasn't manually set a preference
          if (!storeGet(THEME_KEY)) {
            applyTheme(e.matches ? "light" : "dark");
          }
        });
    }

    // Initialize theme
    applyTheme(currentTheme);
    themeToggle && themeToggle.addEventListener("click", toggleTheme);

    function updateChartTitle() {
      if (chartTitleEl) {
        let title = "";
        if (daysAhead === 1) {
          title = "Today";
        } else if (daysAhead === 2) {
          title = "24-Hour Forecast";
        } else {
          title = `Next ${daysAhead} Days`;
        }

        chartTitleEl.textContent = title;
      }

      // Update location input in top right
      const chartLocationEl = $("#chartLocation");
      if (chartLocationEl) {
        // Show ZIP code if saved, otherwise show place name or empty
        const savedZip = storageCacheGet(ZIP_KEY);
        if (savedZip) {
          // Show ZIP code value
          chartLocationEl.value = savedZip;
        } else if (currentPlaceName) {
          chartLocationEl.value = "";
        } else {
          chartLocationEl.value = "";
        }
        // Always keep placeholder as "12345"
        chartLocationEl.placeholder = "12345";
        // Update clear button visibility after setting initial value
        setTimeout(() => updateZipClearButton(), 0);
      }
    }

    function updateAdvStats() {
      // Update current location
      if (els.advCurrentLocation) {
        const place =
          currentPlaceName ||
          (zipEls?.input?.value ? `ZIP ${zipEls.input.value}` : "");
        els.advCurrentLocation.textContent = place || "Not set";
      }

      // Update coordinates
      if (els.advCoordinates) {
        if (lastCoords) {
          els.advCoordinates.textContent = `${lastCoords.latitude.toFixed(
            4
          )}, ${lastCoords.longitude.toFixed(4)}`;
        } else {
          els.advCoordinates.textContent = "—";
        }
      }

      // Update data points
      if (els.advDataPoints) {
        if (timelineState && timelineState.labels) {
          els.advDataPoints.textContent = `${timelineState.labels.length} hours`;
        } else {
          els.advDataPoints.textContent = "—";
        }
      }
    }

    function updateCardVisibility() {
      // Hide the combined card only when selection is finalized (not during active selection)
      if (selectionRange && !isSelectingActive) {
        // Hide card when selection is finalized
        if (els.sunCard) els.sunCard.style.display = "none";
      } else {
        // Show card otherwise
        if (els.sunCard) els.sunCard.style.display = "";
      }
    }

    const els = {
      temp: $("#temp"),
      humidity: $("#humidity"),
      wind: $("#wind"),
      solar: $("#solar"),
      solarVal: $("#solarVal"),
      reflect: $("#reflect"),
      reflectCustom: $("#reflectCustom"),
      shade: $("#shade"),
      sun: $("#sun"),
      sunTempWrapper: $("#sunTempWrapper"),
      shadeTempWrapper: $("#shadeTempWrapper"),
      combinedTemp: $("#combinedTemp"),
      combinedTempWrapper: $("#combinedTempWrapper"),
      shadeLabel: $("#shadeLabel"),
      sunLabel: $("#sunLabel"),
      combinedLabel: $("#combinedLabel"),
      chartCanvas: $("#vibeChart"),
      lastUpdated: $("#lastUpdated"),
      nextUpdated: $("#nextUpdated"),
      advCurrentLocation: $("#advCurrentLocation"),
      advCoordinates: $("#advCoordinates"),
      advDataPoints: $("#advDataPoints"),
      updateInterval: $("#updateInterval"),
      updateHourlyToggle: $("#updateHourlyToggle"),
      updateNow: $("#updateNow"),
      daysAhead: $("#daysAhead"),
      lineSmoothing: $("#lineSmoothing"),
      lineSmoothingVal: $("#lineSmoothingVal"),
      nightShadingToggle: $("#nightShadingToggle"),
      useLocationBtn: $("#use-location"),
      sunCard: $("#sunCard"),
    };

    // Advanced Configuration Toggle
    const advConfigToggle = $("#advConfigToggle");
    const advPanel = $("#advPanel");
    const ADV_CONFIG_STORAGE_KEY = STORE + "advExpanded";

    function toggleAdvConfig() {
      if (!advPanel || !advConfigToggle) return;

      const isExpanded =
        advConfigToggle.getAttribute("aria-expanded") === "true";
      const newState = !isExpanded;

      // Update UI
      advConfigToggle.setAttribute("aria-expanded", newState.toString());
      advPanel.style.display = newState ? "block" : "none";

      // Save state to localStorage
      storeSet(ADV_CONFIG_STORAGE_KEY, newState.toString());

      // Update stats when opened
      if (newState) {
        updateAdvStats();
      }
    }

    // Load saved state on page load
    function loadAdvConfigState() {
      if (!advPanel || !advConfigToggle) return;

      try {
        const savedState = storeGet(ADV_CONFIG_STORAGE_KEY);
        if (savedState !== null) {
          const isExpanded = savedState === "true";
          advConfigToggle.setAttribute("aria-expanded", isExpanded.toString());
          advPanel.style.display = isExpanded ? "block" : "none";

          if (isExpanded) {
            updateAdvStats();
          }
        }
      } catch (e) {
        console.warn("Failed to load advanced config state:", e);
      }
    }

    if (advConfigToggle) {
      advConfigToggle.addEventListener("click", toggleAdvConfig);
    }

    // Load state on page load
    loadAdvConfigState();

    // Units & ZIP
    const unitEls = { F: $("#unitF"), C: $("#unitC") };
    const zipEls = {
      input: $("#chartLocation"), // Now references the input in chart header
      status: null, // Status removed from advanced modal
      clearBtn: $("#zipClearBtn"),
      loadingSpinner: $("#zipLoadingSpinner"),
    };

    // Function to update ZIP clear button visibility
    function updateZipClearButton() {
      if (!zipEls.clearBtn || !zipEls.input) return;
      const hasValue = zipEls.input.value.trim().length > 0;
      const isLoading = zipEls.loadingSpinner?.style.display !== "none";
      zipEls.clearBtn.style.display = hasValue && !isLoading ? "flex" : "none";
    }

    // State
    const UNIT_KEY = STORE + "unit";
    const ZIP_KEY = STORE + "zip";
    const DAYS_AHEAD_KEY = STORE + "daysAhead";
    const NIGHT_SHADING_KEY = STORE + "nightShading";
    const NIGHT_LINE_DARKENING_KEY = STORE + "nightLineDarkening";
    const LINE_SMOOTHING_KEY = STORE + "lineSmoothing";
    const FAVORITES_KEY = STORE + "favorites";
    const CHART_COLORS_KEY = STORE + "chartColors";
    const TEMP_ZONES_KEY = STORE + "tempZones";
    const HUMIDITY_VIS_KEY = STORE + "humidityVis";
    const SUN_MARKERS_KEY = STORE + "sunMarkers";
    const RAIN_ICONS_KEY = STORE + "rainIcons";
    const SNOW_ICONS_KEY = STORE + "snowIcons";
    const ICE_ICONS_KEY = STORE + "iceIcons";
    const WIND_ICONS_KEY = STORE + "windIcons";
    const CALIBRATION_KEY = STORE + "calibration";
    // THEME_KEY is defined earlier, for getDefaultTheme()

    // localStorage cache layer to reduce repeated access
    const storageCache = new Map();
    const storageCacheGet = (key, defaultValue = null) => {
      if (!storageCache.has(key)) {
        const value = storeGet(key);
        storageCache.set(key, value !== null ? value : defaultValue);
      }
      return storageCache.get(key);
    };
    const storageCacheSet = (key, value) => {
      storeSet(key, value);
      storageCache.set(key, value);
    };
    const storageCacheRemove = (key) => {
      storeRemove(key);
      storageCache.delete(key);
    };

    // Initialize cached values
    let unit = storageCacheGet(UNIT_KEY, "F") === "C" ? "C" : "F";
    let daysAhead = parseInt(storageCacheGet(DAYS_AHEAD_KEY, "2"), 10);
    if (!(daysAhead >= 1 && daysAhead <= 7)) daysAhead = 2;
    let nightShadingEnabled = storageCacheGet(NIGHT_SHADING_KEY) === "true";
    let nightLineDarkeningEnabled =
      storageCacheGet(NIGHT_LINE_DARKENING_KEY) === "true";
    // 0 (straight lines) is a real choice, not a missing value.
    let lineSmoothing = parseFloat(storageCacheGet(LINE_SMOOTHING_KEY, "1"));
    if (!(lineSmoothing >= 0 && lineSmoothing <= 1)) lineSmoothing = 1;
    let temperatureZonesEnabled = storageCacheGet(TEMP_ZONES_KEY) === "true";
    let humidityVisualizationEnabled =
      storageCacheGet(HUMIDITY_VIS_KEY) === "true";
    let sunMarkersEnabled =
      storageCacheGet(SUN_MARKERS_KEY, "true") !== "false";
    let rainIconsEnabled = storageCacheGet(RAIN_ICONS_KEY, "true") !== "false";
    let snowIconsEnabled = storageCacheGet(SNOW_ICONS_KEY, "true") !== "false";
    let iceIconsEnabled = storageCacheGet(ICE_ICONS_KEY, "true") !== "false";
    let windIconsEnabled = storageCacheGet(WIND_ICONS_KEY, "true") !== "false";

    // Calibration defaults. Frozen: the sliders edit a copy, so Reset always
    // has Bryan's numbers to go back to.
    const defaultCalibration = Object.freeze({
      humidityCoeff: 1 / 15, // 0.0667
      humidityBaseline: 40,
      windCoeff: 0.7,
      solarCoeff: 8,
      reflectCoeff: 4,
      cloudExp: 0.7,
    });

    // Load calibration from localStorage or use defaults. Only finite
    // numbers for known keys are taken from storage.
    let calibration = { ...defaultCalibration };
    try {
      const saved = storageCacheGet(CALIBRATION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const key of Object.keys(defaultCalibration)) {
          const v = parsed && parsed[key];
          if (typeof v === "number" && Number.isFinite(v)) calibration[key] = v;
        }
      }
    } catch (e) {
      console.warn("Failed to load calibration:", e);
    }

    // Set night shading to true by default if not set
    if (storageCacheGet(NIGHT_SHADING_KEY) === null) {
      nightShadingEnabled = true;
      storageCacheSet(NIGHT_SHADING_KEY, "true");
    }
    // Set night line darkening to false by default if not set
    if (storageCacheGet(NIGHT_LINE_DARKENING_KEY) === null) {
      nightLineDarkeningEnabled = false;
      storageCacheSet(NIGHT_LINE_DARKENING_KEY, "false");
    }
    let lastCoords = null;
    // Saved favorites and colours are checked before use: anything that
    // isn't the expected shape is dropped for the defaults.
    let favorites = storeJSON(FAVORITES_KEY, []);
    favorites = Array.isArray(favorites)
      ? favorites.filter(
          (f) =>
            f &&
            typeof f.name === "string" &&
            Number.isFinite(Number(f.lat)) &&
            Number.isFinite(Number(f.lon))
        )
      : [];
    const DEFAULT_CHART_COLORS = {
      sun: { start: "#ffb86b", end: "#ff9500" },
      shade: { start: "#6ea8fe", end: "#4a90e2" },
    };
    const isHexColor = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
    let chartColors = storeJSON(CHART_COLORS_KEY, null);
    chartColors = ["sun", "shade"].every(
      (k) =>
        chartColors &&
        chartColors[k] &&
        isHexColor(chartColors[k].start) &&
        isHexColor(chartColors[k].end)
    )
      ? chartColors
      : structuredClone(DEFAULT_CHART_COLORS);
    // vibeChart is declared earlier (line 90) to avoid reference errors
    let pollTimer = null;
    let nextUpdateAt = null;

    let sunTimes = { sunrises: [], sunsets: [] }; // Arrays of all sunrise/sunset times for visible range

    // Debouncing for chart updates and compute operations
    let chartUpdateTimeout = null;
    let computeTimeout = null;

    // Debounced chart update function
    function debouncedChartUpdate(mode = "none", delay = 100) {
      if (chartUpdateTimeout) clearTimeout(chartUpdateTimeout);
      chartUpdateTimeout = setTimeout(() => {
        if (vibeChart) {
          vibeChart.update(mode);
        }
        chartUpdateTimeout = null;
      }, delay);
    }

    // Debounced compute function
    function debouncedCompute(delay = 150) {
      if (computeTimeout) clearTimeout(computeTimeout);
      computeTimeout = setTimeout(() => {
        compute();
        computeTimeout = null;
      }, delay);
    }
    let currentIsDay = null;
    let currentPlaceName = "";
    // Clock and calendar follow the place's own time zone (Open-Meteo's
    // `timezone`), not the browser's: the browser's until a forecast arrives.
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let placeZone = browserZone;
    const zp = (d) => PlaceTime.parts(d, placeZone);
    const inZone = (opts = {}) => ({ ...opts, timeZone: placeZone });

    let timelineState = null; // { labels, shadeVals, sunVals, solarByHour, isDayByHour, windByHour, humidityByHour, precipitationByHour, weathercodeByHour, now } all in °F
    window.timelineState = null; // Expose timeline state for tooltip data access
    let simActive = false;
    let selectionRange = null; // { startTime: Date, endTime: Date } for URL sharing
    let isSelectingActive = false; // Flag to track if user is actively selecting (dragging)
    let summaryGenerationInProgress = false;
    let lastSummaryRange = null; // Track last selectionRange that summary was generated for
    let lastSummaryTimelineHash = null; // Track hash of timelineState to detect data changes

    const DEBUG = new URLSearchParams(location.search).get("debug") === "true";
    const log = (...a) => {
      if (DEBUG) console.log("[Vibe]", ...a);
    };

    // Notification helper
    function showNotification(message, type = "success", duration = 3000) {
      if (!notificationEl) return;
      notificationEl.textContent = message;
      notificationEl.className = `notification ${type}`;
      notificationEl.style.display = "block";
      setTimeout(() => {
        notificationEl.style.display = "none";
      }, duration);
    }

    // Expired selection modal
    function showExpiredSelectionModal() {
      if (!expiredModalEl) return;
      expiredModalEl.style.display = "flex";
      // Focus first button for accessibility
      if (keepCustomBtn) keepCustomBtn.focus();
    }

    function hideExpiredSelectionModal() {
      if (!expiredModalEl) return;
      expiredModalEl.style.display = "none";
    }

    // Helper function to clear highlight and strip URL parameters
    function clearHighlight() {
      if (!selectionRange) return; // Nothing to clear

      selectionRange = null;
      isSelectingActive = false;
      lastSummaryRange = null; // Reset tracking when clearing selection
      lastSummaryTimelineHash = null;
      if (clearHighlightBtn) clearHighlightBtn.style.display = "none";
      if (weatherSummaryEl) weatherSummaryEl.style.display = "none";
      if (copySummaryBtn) copySummaryBtn.style.display = "none";
      updateCardVisibility();
      // Show remainder of day section again when selection is cleared
      if (remainderOfDaySummaryEl && timelineState) {
        updateRemainderOfDaySummary();
      }
      if (vibeChart) vibeChart.update("none");

      // Remove start, end, lat, lon, and zip from URL but keep other params
      const params = new URLSearchParams(location.search);
      params.delete("start");
      params.delete("end");
      params.delete("lat");
      params.delete("lon");
      params.delete("zip");
      const newUrl = params.toString()
        ? `${location.pathname}?${params.toString()}`
        : location.pathname;
      history.pushState({}, "", newUrl);
    }

    function handleKeepCustomSettings() {
      // Clear the selection but keep other URL params
      clearHighlight();
      hideExpiredSelectionModal();
    }

    function handleUseDefaults() {
      // Reset everything to app defaults
      // Clear selection
      clearHighlight();

      // Reset unit to F (ignore localStorage)
      unit = "F";
      if (unitEls.F) unitEls.F.classList.add("active");
      if (unitEls.C) unitEls.C.classList.remove("active");
      applyUnitLabels();

      // Reset days ahead to 2 (ignore localStorage)
      daysAhead = 2;
      if (els.daysAhead) els.daysAhead.value = 2;
      updateChartTitle();

      // Clear location from URL and state
      lastCoords = null;
      if (zipEls.input) zipEls.input.value = "";

      // Remove all URL params
      history.replaceState({}, "", location.pathname);

      // Trigger device location if available
      useLocation();

      // Update chart
      if (vibeChart) {
        vibeChart.update("none");
      }

      hideExpiredSelectionModal();
    }

    // URL generation helper
    function generateShareURL(startTime, endTime) {
      const params = new URLSearchParams();

      // Add settings
      if (unit) params.set("unit", unit);
      if (daysAhead) params.set("days", String(daysAhead));
      // The place, no more precisely than the forecast needs: the ZIP when
      // there is one, otherwise coordinates to 2 dp (about 1 km), which is
      // also what the forecast is fetched for. A shared link never carries
      // a GPS fix.
      const savedZip = storageCacheGet(ZIP_KEY);
      if (savedZip) {
        params.set("zip", savedZip);
      } else if (lastCoords) {
        params.set("lat", roundCoord(lastCoords.latitude).toFixed(2));
        params.set("lon", roundCoord(lastCoords.longitude).toFixed(2));
      }

      // Add time range (ISO strings)
      params.set("start", startTime.toISOString());
      params.set("end", endTime.toISOString());

      return `${window.location.origin}${
        window.location.pathname
      }?${params.toString()}`;
    }

    // Copy to clipboard helper
    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
          document.body.removeChild(textarea);
          return true;
        } catch (e) {
          document.body.removeChild(textarea);
          return false;
        }
      }
    }

    // Extract weather data for selected time range
    function extractWeatherDataForRange(startTime, endTime) {
      if (!timelineState) return null;

      const { labels, shadeVals, sunVals, solarByHour, isDayByHour } =
        timelineState;
      const dataPoints = [];

      for (let i = 0; i < labels.length; i++) {
        const time = new Date(labels[i]);
        if (time >= startTime && time <= endTime) {
          const shadeF = shadeVals[i];
          const sunF = sunVals[i];
          const solar = solarByHour[i] ?? 0;
          const isDay = !!isDayByHour[i];

          dataPoints.push({
            time: time.toISOString(),
            hour: zp(time).hour,
            shadeVibe: toUserTemp(shadeF),
            sunVibe: toUserTemp(sunF),
            solar: solar,
            isDay: isDay,
            description: vibeDescriptor(shadeF, {
              solar,
              isDay,
              context: "shade",
            }),
          });
        }
      }

      if (dataPoints.length === 0) return null;

      // Calculate statistics
      const shadeTemps = dataPoints.map((d) => d.shadeVibe);
      const sunTemps = dataPoints.map((d) => d.sunVibe);
      const minShade = Math.min(...shadeTemps);
      const maxShade = Math.max(...shadeTemps);
      const minSun = Math.min(...sunTemps);
      const maxSun = Math.max(...sunTemps);
      const avgShade =
        shadeTemps.reduce((a, b) => a + b, 0) / shadeTemps.length;
      const avgSun = sunTemps.reduce((a, b) => a + b, 0) / sunTemps.length;
      const dayHours = dataPoints.filter((d) => d.isDay).length;
      const nightHours = dataPoints.length - dayHours;

      // Calculate weighted average vibe based on day/night hours
      // During day, people are more likely in sun, so weight sun vibe more
      // During night, use shade vibe (sun doesn't matter)
      const totalHours = dataPoints.length;
      const dayWeight = dayHours / totalHours;
      const nightWeight = nightHours / totalHours;
      // For daytime, assume 70% sun vibe, 30% shade vibe (people move between sun/shade)
      // For nighttime, use 100% shade vibe
      const avgRepresentative =
        dayWeight * (avgSun * 0.7 + avgShade * 0.3) + nightWeight * avgShade;

      return {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration:
          Math.round(((endTime - startTime) / (1000 * 60 * 60)) * 10) / 10, // hours
        dataPoints,
        stats: {
          minShade,
          maxShade,
          avgShade,
          minSun,
          maxSun,
          avgSun,
          dayHours,
          nightHours,
          avgRepresentative, // More representative average for the period
        },
      };
    }

    // Summary of how a stretch of time will feel (based on vibe temps)
    function generateWeatherSummary(weatherData, touchGrassTime = null) {
      if (
        !weatherData ||
        !weatherData.dataPoints ||
        weatherData.dataPoints.length === 0
      ) {
        return "No weather data available for this time range.";
      }
      const { stats, duration, startTime, endTime, dataPoints } = weatherData;
      const start = new Date(startTime);
      const end = new Date(endTime);

      const sentences = [];

      // Use representative vibe temperature (weighted average) for description
      // Note: stats values are already in user's unit (C or F), so we need to use appropriate thresholds
      const repTemp = stats.avgRepresentative || stats.avgShade;

      // Convert to Fahrenheit for threshold comparisons (descriptors use F thresholds)
      const repTempF = unit === "F" ? repTemp : cToF(repTemp);

      let firstSentence = "";
      if (repTempF < 50) {
        firstSentence = "It will feel quite cold";
      } else if (repTempF < 65) {
        firstSentence = "It will feel cool";
      } else if (repTempF < 75) {
        firstSentence = "It will feel mild and comfortable";
      } else if (repTempF < 85) {
        firstSentence = "It will feel warm";
      } else {
        firstSentence = "It will feel hot";
      }

      // Add day/night context to first sentence
      if (stats.dayHours > 0 && stats.nightHours > 0) {
        firstSentence += " with a mix of day and night conditions";
      } else if (stats.dayHours > 0) {
        firstSentence += " during daytime hours";
      } else {
        firstSentence += " during nighttime hours";
      }
      sentences.push(firstSentence);

      // Vibe temperature range (how it feels)
      // Use max of sun/shade for max, min of shade for min (more representative)
      const maxRep = Math.max(stats.maxSun, stats.maxShade);
      const minRep = stats.minShade; // Min is typically in shade
      const range = maxRep - minRep;
      // Convert threshold based on unit (10°F = 5.6°C)
      const significantRangeThreshold = unit === "F" ? 10 : 5.6;
      if (range > significantRangeThreshold) {
        sentences.push(
          `The vibe will vary significantly, from ${minRep.toFixed(
            1
          )}${unitSuffix()} to ${maxRep.toFixed(1)}${unitSuffix()}`
        );
      } else {
        sentences.push(
          `The vibe will be relatively steady around ${repTemp.toFixed(
            1
          )}${unitSuffix()}`
        );
      }

      // Sun vs shade vibe difference
      // Convert thresholds based on unit (15°F = 8.3°C, 8°F = 4.4°C)
      const muchWarmerThreshold = unit === "F" ? 15 : 8.3;
      const noticeablyWarmerThreshold = unit === "F" ? 8 : 4.4;
      const sunShadeDiff = stats.avgSun - stats.avgShade;

      if (sunShadeDiff > muchWarmerThreshold) {
        sentences.push(
          `In the sun, it will feel much warmer (around ${stats.avgSun.toFixed(
            1
          )}${unitSuffix()} vibe), so seek shade if it gets too hot`
        );
      } else if (sunShadeDiff > noticeablyWarmerThreshold) {
        sentences.push(
          `In the sun, it will feel noticeably warmer (around ${stats.avgSun.toFixed(
            1
          )}${unitSuffix()} vibe)`
        );
      }

      // Clothing recommendations
      const clothingRecs = [];
      if (repTempF < 50) {
        clothingRecs.push(
          "dress warmly with layers, a coat, and warm accessories"
        );
      } else if (repTempF < 65) {
        clothingRecs.push("wear a light jacket or sweater");
      } else if (repTempF < 75) {
        clothingRecs.push("light clothing is comfortable");
      } else if (repTempF < 85) {
        clothingRecs.push("wear light, breathable clothing");
      } else {
        clothingRecs.push(
          "wear minimal, light-colored clothing and stay hydrated"
        );
      }
      if (stats.dayHours > 0 && sunShadeDiff > noticeablyWarmerThreshold) {
        clothingRecs.push("consider sun protection if spending time outdoors");
      }
      if (clothingRecs.length > 0) {
        sentences.push(`For clothing, ${clothingRecs.join(", ")}`);
      }

      // Activity suggestions
      const activityRecs = [];
      if (repTempF < 50) {
        activityRecs.push("indoor activities are most comfortable");
      } else if (repTempF < 65) {
        activityRecs.push(
          "outdoor activities like walking or light exercise are pleasant"
        );
      } else if (repTempF < 75) {
        activityRecs.push(
          "great conditions for outdoor activities like hiking, biking, or sports"
        );
      } else if (repTempF < 85) {
        activityRecs.push(
          "good for outdoor activities, but take breaks in shade and stay hydrated"
        );
      } else {
        activityRecs.push(
          "limit strenuous outdoor activities, seek shade, and stay well-hydrated"
        );
      }
      if (stats.nightHours > stats.dayHours) {
        activityRecs.push("better suited for evening activities");
      }
      if (activityRecs.length > 0) {
        sentences.push(`For activities, ${activityRecs.join(", ")}`);
      }

      // Add weather icon based on conditions
      const getWeatherIcon = () => {
        if (repTempF < 32) return "\u{2744}\u{FE0F}"; // ❄️
        if (repTempF < 50) return "\u{1F9CA}"; // 🧊
        if (repTempF < 65) return "\u{1F324}\u{FE0F}"; // 🌤️
        if (repTempF < 75) return "\u{2600}\u{FE0F}"; // ☀️
        if (repTempF < 85) return "\u{1F321}\u{FE0F}"; // 🌡️
        return "\u{1F525}"; // 🔥
      };

      // Add touch grass time if it exists
      if (touchGrassTime) {
        const touchGrassTimeStr = fmtHM(new Date(touchGrassTime.time));
        const touchGrassTempStr = `${formatUserTemp(
          touchGrassTime.temp
        )}${unitSuffix()}`;
        sentences.push(
          `The ideal "Touch Grass" time (perfect temperature for outdoor activities) is at ${touchGrassTimeStr} when it will feel like ${touchGrassTempStr}`
        );
      }

      const icon = getWeatherIcon();
      return `${icon} ${sentences.join(". ")}.`;
    }

    // Generate smart title for highlighted range
    function generateHighlightTitle(startTime, endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);

      const startDay = start.toLocaleDateString([], inZone({ weekday: "long" }));
      const endDay = end.toLocaleDateString([], inZone({ weekday: "long" }));
      const startHour = zp(start).hour;
      const endHour = zp(end).hour;

      // Helper to get time of day
      function getTimeOfDay(hour) {
        if (hour >= 5 && hour < 12) return "Morning";
        if (hour >= 12 && hour < 17) return "Afternoon";
        if (hour >= 17 && hour < 21) return "Evening";
        return "Night";
      }

      const startTimeOfDay = getTimeOfDay(startHour);
      const endTimeOfDay = getTimeOfDay(endHour);

      // Check if same day
      const isSameDay =
        PlaceTime.dayKey(start, placeZone) === PlaceTime.dayKey(end, placeZone);

      if (isSameDay) {
        // Single day
        if (startTimeOfDay === endTimeOfDay) {
          // Same time of day - show the time period
          return `Highlighted Vibes For ${startDay} ${startTimeOfDay}`;
        } else {
          // Different times of day on same day - show transition
          return `Highlighted Vibes For ${startDay} ${startTimeOfDay} into ${endTimeOfDay}`;
        }
      } else {
        // Multiple days
        // Check if consecutive days (same calendar date difference)
        const daysDiff = PlaceTime.daysBetween(start, end, placeZone);

        if (daysDiff === 1) {
          // Consecutive days - check for night into morning transition
          if (startTimeOfDay === "Night" && endTimeOfDay === "Morning") {
            return `Highlighted Vibes For ${startDay} Night into ${endDay} Morning`;
          }
          // Consecutive days - use "to"
          return `Highlighted Vibes For ${startDay} to ${endDay}`;
        } else if (daysDiff > 1) {
          // Multiple consecutive days - use "to"
          return `Highlighted Vibes For ${startDay} to ${endDay}`;
        } else {
          // Non-consecutive days or same day (shouldn't happen but handle it)
          if (startDay === endDay) {
            // Same day name but different dates (shouldn't happen with toDateString check, but handle)
            return `Highlighted Vibes For ${startDay}`;
          }
          // Non-consecutive days - use "and"
          return `Highlighted Vibes For ${startDay} and ${endDay}`;
        }
      }
    }

    // Update remainder of day summary
    async function updateRemainderOfDaySummary() {
      if (!timelineState || !remainderOfDaySummaryEl) return;

      // Hide remainder of day section if a selection is active
      if (selectionRange) {
        if (remainderOfDaySummaryEl)
          remainderOfDaySummaryEl.style.display = "none";
        return;
      }

      const now = new Date();
      // The last moment of today at the place
      const endOfDay = new Date(PlaceTime.startOfDay(now, placeZone, 1) - 1);

      // Find the latest time in timelineState that's still today
      const { labels } = timelineState;
      let endTime = null;
      for (const label of labels) {
        const labelDate = new Date(label);
        if (labelDate > now && labelDate <= endOfDay) {
          if (!endTime || labelDate > endTime) {
            endTime = labelDate;
          }
        }
      }

      // If no endTime found, use the last label that's still today or endOfDay
      if (!endTime) {
        // Check if there's any data for today at all
        const lastLabel = labels[labels.length - 1];
        if (lastLabel) {
          const lastLabelDate = new Date(lastLabel);
          if (
            PlaceTime.dayKey(lastLabelDate, placeZone) ===
            PlaceTime.dayKey(now, placeZone)
          ) {
            endTime = lastLabelDate;
          } else {
            endTime = endOfDay;
          }
        } else {
          endTime = endOfDay;
        }
      }

      // If no future data for today, don't show the section
      if (endTime <= now) {
        if (remainderOfDaySummaryEl)
          remainderOfDaySummaryEl.style.display = "none";
        return;
      }

      // Show the section
      if (remainderOfDaySummaryEl)
        remainderOfDaySummaryEl.style.display = "block";

      // Update time range display
      if (remainderTimeRangeEl) {
        const rangeFormat = inZone({
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const startStr = now.toLocaleString([], rangeFormat);
        const endStr = endTime.toLocaleString([], rangeFormat);
        remainderTimeRangeEl.textContent = `${startStr} → ${endStr}`;
      }

      // Show loading state
      if (remainderTextEl) {
        remainderTextEl.textContent = "Generating summary...";
        remainderTextEl.className = "summary-text loading";
      }

      try {
        const weatherData = extractWeatherDataForRange(now, endTime);
        if (!weatherData) {
          if (remainderTextEl) {
            remainderTextEl.textContent =
              "No weather data available for the remainder of the day.";
            remainderTextEl.className = "summary-text";
          }
          return;
        }

        // Find Touch Grass time for today if it exists
        let touchGrassTime = null;
        if (vibeChart && vibeChart._touchGrassTimes) {
          const todayKey = PlaceTime.dayKey(now, placeZone);
          const touchGrassTimes = vibeChart._touchGrassTimes || [];
          for (const tgTime of touchGrassTimes) {
            const tgDate =
              tgTime.time instanceof Date ? tgTime.time : new Date(tgTime.time);
            const tgDayKey = PlaceTime.dayKey(tgDate, placeZone);
            const tgTimeMs = tgDate.getTime();
            if (
              tgDayKey === todayKey &&
              tgTimeMs >= now.getTime() &&
              tgTimeMs <= endTime.getTime()
            ) {
              touchGrassTime = tgTime;
              break;
            }
          }
        }

        const summary = generateWeatherSummary(
          weatherData,
          touchGrassTime
        );

        if (remainderTextEl) {
          remainderTextEl.textContent = summary;
          remainderTextEl.className = "summary-text";
        }
      } catch (error) {
        console.warn("Failed to generate remainder of day summary:", error);
        if (remainderTextEl) {
          remainderTextEl.textContent =
            "Unable to generate summary at this time.";
          remainderTextEl.className = "summary-text";
        }
      }
    }

    // Helper to create a hash of timelineState for the selected range
    // Optimized: Uses binary search for sorted arrays and samples data to reduce computation
    function getTimelineHashForRange(startTime, endTime) {
      if (!timelineState) return null;
      const { labels, shadeVals, sunVals } = timelineState;
      if (!labels || !shadeVals || !sunVals || labels.length === 0) return null;

      // Binary search for start index (labels are sorted chronologically)
      let startIdx = 0;
      let left = 0,
        right = labels.length - 1;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (labels[mid] < startTime) {
          left = mid + 1;
        } else {
          startIdx = mid;
          right = mid - 1;
        }
      }

      // Binary search for end index
      let endIdx = labels.length;
      left = startIdx;
      right = labels.length - 1;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (labels[mid] < endTime) {
          left = mid + 1;
        } else {
          endIdx = mid;
          right = mid - 1;
        }
      }

      if (startIdx >= endIdx || startIdx < 0) return null;

      // Sample data points (every Nth value) to reduce hash computation for large ranges
      const rangeSize = endIdx - startIdx;
      const step = Math.max(1, Math.floor(rangeSize / 20)); // Sample up to 20 points
      const sampledShade = [];
      const sampledSun = [];
      for (let i = startIdx; i < endIdx; i += step) {
        sampledShade.push(shadeVals[i].toFixed(1));
        sampledSun.push(sunVals[i].toFixed(1));
      }

      const rangeData = {
        start: startIdx,
        end: endIdx,
        shade: sampledShade.join(","),
        sun: sampledSun.join(","),
      };
      return JSON.stringify(rangeData);
    }

    // Update weather summary
    async function updateWeatherSummary() {
      if (!selectionRange || !timelineState || summaryGenerationInProgress)
        return;

      // Hide remainder of day section when a selection is active
      if (remainderOfDaySummaryEl) {
        remainderOfDaySummaryEl.style.display = "none";
      }

      // Check if we've already generated a summary for this exact selectionRange and data
      const currentHash = getTimelineHashForRange(
        selectionRange.startTime,
        selectionRange.endTime
      );
      const rangeKey = `${selectionRange.startTime.getTime()}-${selectionRange.endTime.getTime()}`;

      if (
        lastSummaryRange === rangeKey &&
        lastSummaryTimelineHash === currentHash
      ) {
        // Already generated summary for this exact range and data, skip
        // But ensure summary section is visible
        if (weatherSummaryEl) weatherSummaryEl.style.display = "block";
        if (clearHighlightBtn) clearHighlightBtn.style.display = "block";
        return;
      }

      summaryGenerationInProgress = true;

      if (weatherSummaryEl) weatherSummaryEl.style.display = "block";
      showSummaryLoading();

      // Show/hide buttons
      if (copySummaryBtn) copySummaryBtn.style.display = "none";
      if (clearHighlightBtn) clearHighlightBtn.style.display = "block";

      // Update title with smart description
      if (summaryTitleEl && selectionRange) {
        const smartTitle = generateHighlightTitle(
          selectionRange.startTime,
          selectionRange.endTime
        );
        summaryTitleEl.textContent = smartTitle;
      }

      // Update time range display
      if (summaryTimeRangeEl && selectionRange) {
        const start = new Date(selectionRange.startTime);
        const end = new Date(selectionRange.endTime);
        const rangeFormat = inZone({
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const startStr = start.toLocaleString([], rangeFormat);
        const endStr = end.toLocaleString([], rangeFormat);
        summaryTimeRangeEl.textContent = `${startStr} → ${endStr}`;
      }

      if (summaryTextEl) {
        summaryTextEl.textContent = "Generating summary...";
        summaryTextEl.className = "summary-text loading";
      }

      try {
        const weatherData = extractWeatherDataForRange(
          selectionRange.startTime,
          selectionRange.endTime
        );
        if (!weatherData) {
          if (summaryTextEl) {
            summaryTextEl.textContent =
              "No weather data available for this time range.";
            summaryTextEl.className = "summary-text";
          }
          return;
        }

        // Find Touch Grass time within the selected range if it exists
        let touchGrassTime = null;
        if (vibeChart && vibeChart._touchGrassTimes) {
          const touchGrassTimes = vibeChart._touchGrassTimes || [];
          const rangeStart = selectionRange.startTime.getTime();
          const rangeEnd = selectionRange.endTime.getTime();
          for (const tgTime of touchGrassTimes) {
            const tgDate =
              tgTime.time instanceof Date ? tgTime.time : new Date(tgTime.time);
            const tgTimeMs = tgDate.getTime();
            if (tgTimeMs >= rangeStart && tgTimeMs <= rangeEnd) {
              touchGrassTime = tgTime;
              break;
            }
          }
        }

        const summary = generateWeatherSummary(
          weatherData,
          touchGrassTime
        );

        if (summaryTextEl) {
          summaryTextEl.textContent = summary;
          summaryTextEl.className = "summary-text";
        }

        // Show copy and export buttons when summary is ready
        if (copySummaryBtn) copySummaryBtn.style.display = "block";

        // Track that we've generated summary for this range and data
        lastSummaryRange = rangeKey;
        lastSummaryTimelineHash = currentHash;
      } catch (error) {
        console.warn("Failed to generate summary:", error);
        if (summaryTextEl) {
          summaryTextEl.textContent =
            "Unable to generate summary at this time.";
          summaryTextEl.className = "summary-text";
        }
        // Hide buttons on error
        if (copySummaryBtn) copySummaryBtn.style.display = "none";
        if (exportCSVBtn) exportCSVBtn.style.display = "none";
        if (exportJSONBtn) exportJSONBtn.style.display = "none";
      } finally {
        summaryGenerationInProgress = false;
      }
    }

    // Helper to convert pixel to time
    function pixelToTime(x, labels, scales) {
      const chartArea = vibeChart.chartArea;
      if (x < chartArea.left || x > chartArea.right) return null;

      // Find the two nearest hour indices
      const value = scales.x.getValueForPixel(x);
      const idx = Math.round(value);

      if (idx < 0 || idx >= labels.length) return null;

      // Interpolate between indices if needed
      const beforeIdx = Math.floor(value);
      const afterIdx = Math.ceil(value);

      if (
        beforeIdx === afterIdx ||
        beforeIdx < 0 ||
        afterIdx >= labels.length
      ) {
        return new Date(labels[idx]);
      }

      const beforeTime = new Date(labels[beforeIdx]);
      const afterTime = new Date(labels[afterIdx]);
      const fraction = value - beforeIdx;

      return new Date(
        beforeTime.getTime() +
          (afterTime.getTime() - beforeTime.getTime()) * fraction
      );
    }

    // Utils
    function clamp(n, min, max) {
      return Math.min(max, Math.max(min, n));
    }
    const fToC = (f) => ((f - 32) * 5) / 9;
    const cToF = (c) => (c * 9) / 5 + 32;
    const toUserTemp = (f) => (unit === "F" ? f : fToC(f));
    const unitSuffix = () => (unit === "F" ? "\u00B0F" : "\u00B0C"); // Use Unicode for degree symbol
    const formatTemp = (temp) => {
      const displayTemp = toUserTemp(temp);
      if (unit === "F") {
        return Math.round(displayTemp).toString();
      }
      return displayTemp.toFixed(1);
    };

    // Formats a temperature already in the display unit (formatTemp takes °F).
    const formatUserTemp = (temp) =>
      unit === "F" ? Math.round(temp).toString() : temp.toFixed(1);

    function fmtHM(d) {
      return d.toLocaleTimeString(
        [],
        inZone({ hour: "numeric", minute: "2-digit" })
      );
    }
    function fmtHMWithSmallAMPM(d) {
      const timeStr = d.toLocaleTimeString(
        [],
        inZone({ hour: "numeric", minute: "2-digit" })
      );
      // Split time and AM/PM, wrap AM/PM in span with smaller font
      // Handle both "6:43 AM" and "6:43AM" formats
      const parts = timeStr.split(/(\s*[AP]M)/i);
      if (parts.length === 3) {
        return `${parts[0]}<span class="time-ampm">${parts[1]}</span>`;
      }
      return timeStr;
    }
    function fmtHMS(d) {
      return d.toLocaleTimeString(
        [],
        inZone({ hour: "numeric", minute: "2-digit", second: "2-digit" })
      );
    }

    function paintUnitToggle() {
      unitEls.F?.classList.toggle("active", unit === "F");
      unitEls.C?.classList.toggle("active", unit === "C");
    }
    function applyUnitLabels() {
      // Update inline Air Temp unit tag in Advanced
      const airUnit = document.getElementById("airUnitLabel");
      if (airUnit) airUnit.textContent = unit === "F" ? "\u00B0F" : "\u00B0C"; // Use Unicode for degree symbol
    }
    function convertTempInputIfPresent(toUnit) {
      const t = els.temp;
      if (!t || t.value === "") return;
      const val = parseFloat(t.value);
      if (Number.isNaN(val)) return;
      if (toUnit === "C" && unit === "F") t.value = fToC(val).toFixed(1);
      else if (toUnit === "F" && unit === "C") t.value = cToF(val).toFixed(1);
    }

    // ZIP helpers
    function normalizeZip(raw) {
      if (!raw) return null;
      const s = String(raw).trim();
      const m = s.match(/^(\d{5})(?:-\d{4})?$/);
      return m ? m[1] : null;
    }
    // A ZIP's centroid never moves, so each lookup is kept for next time.
    const ZIP_CACHE_KEY = STORE + "zipCache";
    function readZipCache() {
      try {
        const parsed = JSON.parse(localStorage.getItem(ZIP_CACHE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) {
        return {};
      }
    }
    async function getCoordsForZip(zip5) {
      const known = readZipCache()[zip5];
      if (
        known &&
        Number.isFinite(known.latitude) &&
        Number.isFinite(known.longitude) &&
        typeof known.place === "string"
      ) {
        return { ...known };
      }
      const found = await lookUpZip(zip5);
      try {
        const cache = readZipCache();
        cache[zip5] = found;
        const keys = Object.keys(cache);
        if (keys.length > 20) delete cache[keys[0]];
        localStorage.setItem(ZIP_CACHE_KEY, JSON.stringify(cache));
      } catch (e) {
        // Storage full or blocked: look it up again next time.
      }
      return found;
    }
    async function lookUpZip(zip5) {
      try {
        const r = await fetch(`https://api.zippopotam.us/us/${zip5}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!r.ok) {
          if (r.status === 404) throw new Error("ZIP_NOT_FOUND");
          throw new Error("ZIP_LOOKUP_FAILED");
        }
        const data = await r.json();
        const p = data.places?.[0];
        if (!p) throw new Error("ZIP_NOT_FOUND");
        const latitude = parseFloat(p.latitude);
        const longitude = parseFloat(p.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
          throw new Error("ZIP_LOOKUP_FAILED");
        return {
          latitude,
          longitude,
          place: `${p["place name"]}, ${p["state abbreviation"]}`,
        };
      } catch (e) {
        if (e.message === "ZIP_NOT_FOUND") throw new Error("ZIP_NOT_FOUND");
        throw new Error("ZIP_LOOKUP_FAILED");
      }
    }
    function isDaylightNow() {
      if (currentIsDay === 0 || currentIsDay === 1) return !!currentIsDay;
      const now = new Date();
      const nowMs = now.getTime();

      // Check all sunrises and sunsets to determine if it's currently daylight
      const allEvents = [
        ...(sunTimes.sunrises || []).map((t) => ({
          time: new Date(t).getTime(),
          type: "sunrise",
        })),
        ...(sunTimes.sunsets || []).map((t) => ({
          time: new Date(t).getTime(),
          type: "sunset",
        })),
      ].sort((a, b) => a.time - b.time);

      if (allEvents.length > 0) {
        // Find the most recent event before or at now
        let lastEvent = null;
        for (let i = 0; i < allEvents.length; i++) {
          if (allEvents[i].time <= nowMs) {
            lastEvent = allEvents[i];
          } else {
            break;
          }
        }

        // If last event was a sunrise, we're in daytime
        // If last event was a sunset, we're in nighttime
        if (lastEvent) {
          return lastEvent.type === "sunrise";
        }

        // Before first event - check if it's a sunrise (day) or sunset (night)
        return allEvents[0].type === "sunrise";
      }

      // Fallback to old logic
      if (sunTimes.sunriseToday && sunTimes.sunsetToday) {
        if (now >= sunTimes.sunriseToday && now < sunTimes.sunsetToday)
          return true;
      }
      const s = parseFloat(els.solar?.value ?? "0") || 0;
      return s > 0.2;
    }

    // Descriptors
    function describeDay(tempF, context = "shade") {
      if (tempF < -10) return "Brutally frigid; frostbite risk";
      if (tempF < -5) return "Bitter, painfully cold";
      if (tempF < 0) return "Bitter cold";
      if (tempF < 5) return "Arctic chill";
      if (tempF < 10) return "Frigid; heavy layers";
      if (tempF < 15) return "Freezing; very cold";
      if (tempF < 20) return "Freezing; thick coat";
      if (tempF < 25) return "Very cold; winter layers";
      if (tempF < 30) return "Cold; winter layers";
      if (tempF < 35) return "Cold; coat + hat";
      if (tempF < 40) return "Chilly; warm layers";
      if (tempF < 45) return "Chilly; light coat";
      if (tempF < 50) return "Cool; jacket";
      if (tempF < 55) return "Crisp sweater weather";
      if (tempF < 60)
        return context === "sun"
          ? "Great in the sun"
          : "Cool in shade, warm in sun";
      if (tempF < 65)
        return context === "sun" ? "Perfect in the sun" : "Cool; find sun";
      if (tempF < 70) return "Balanced, light layers";
      if (tempF < 75) return "Mild and comfy";
      if (tempF < 80) return "Warm and glowy";
      if (tempF < 85)
        return context === "sun"
          ? "Quite warm in the sun"
          : "Quite warm; shade helps";
      if (tempF < 90) return "Hot; hydrate";
      if (tempF < 95) return "Baking in the sun";
      if (tempF < 100) return "Very hot; limit exertion";
      if (tempF < 105) return "Oppressive heat; take it easy";
      return "Extreme heat alert";
    }
    function describeNight(tempF) {
      if (tempF < -10) return "Brutally frigid night";
      if (tempF < -5) return "Bitter, painfully cold night";
      if (tempF < 0) return "Bitter cold night";
      if (tempF < 5) return "Arctic night air";
      if (tempF < 10) return "Frigid night; heavy layers";
      if (tempF < 15) return "Freezing night; very cold";
      if (tempF < 20) return "Freezing night; thick coat";
      if (tempF < 25) return "Very cold night";
      if (tempF < 30) return "Cold night; winter layers";
      if (tempF < 35) return "Cold night; coat + hat";
      if (tempF < 40) return "Chilly night; warm layers";
      if (tempF < 45) return "Chilly night; light coat";
      if (tempF < 50) return "Cool evening; jacket";
      if (tempF < 55) return "Crisp night air";
      if (tempF < 60) return "Cool evening";
      if (tempF < 65) return "Mild evening, light layer";
      if (tempF < 70) return "Mild evening";
      if (tempF < 75) return "Warm evening";
      if (tempF < 80) return "Very warm evening";
      if (tempF < 85) return "Hot evening";
      if (tempF < 90) return "Hot evening; hydrate";
      if (tempF < 95) return "Stifling night heat";
      if (tempF < 100) return "Oppressive night heat";
      if (tempF < 105) return "Dangerously hot night";
      return "Extreme heat night";
    }
    function vibeDescriptor(
      tempF,
      {
        solar = parseFloat(els.solar?.value ?? "0") || 0,
        isDay = isDaylightNow(),
        context = "shade",
      } = {}
    ) {
      const base = isDay ? describeDay(tempF, context) : describeNight(tempF);
      if (!isDay) return base;
      const s = clamp(Number.isFinite(solar) ? solar : 0, 0, 1);
      let suffix = "";
      if (s < 0.2)
        suffix = context === "sun" ? "clouds mute the sun" : "overcast";
      else if (s < 0.4) suffix = "mostly cloudy";
      else if (s < 0.7) suffix = "partly sunny";
      return suffix ? `${base} (${suffix})` : base;
    }
    function combinedVibeDescriptor(
      shadeF,
      sunF,
      solar = 0,
      isDay = true,
      currentTime = null
    ) {
      // At night, sun and shade are the same - return just shade description
      if (!isDay || Math.abs(sunF - shadeF) < 0.1) {
        return vibeDescriptor(shadeF, { solar, isDay, context: "shade" });
      }

      const diff = sunF - shadeF;
      const s = clamp(Number.isFinite(solar) ? solar : 0, 0, 1);

      // Get base descriptions
      const sunBase = describeDay(sunF, "sun");
      const shadeBase = describeDay(shadeF, "shade");

      let description = "";

      // Adjust wording based on temperature difference. The gap tops out at
      // 8 + 4 × reflectivity (9.2°F on concrete) at the default calibration.
      if (diff < 2) {
        // Very similar - use single description
        description = sunBase;
      } else if (diff >= 8) {
        // Moderate difference
        description = `${sunBase} in sun, ${shadeBase} in shade`;
      } else {
        // Small difference (2-8°F) - mention both with similarity emphasis
        description = `${sunBase} in sun, similar ${shadeBase} in shade`;
      }

      // Add sunset time if within 3 hours
      if (currentTime && sunTimes && sunTimes.sunsets) {
        const currentMs = currentTime.getTime();
        const threeHoursMs = 3 * 60 * 60 * 1000;
        const nextSunset = sunTimes.sunsets
          .map((t) => new Date(t).getTime())
          .find((sunsetMs) => sunsetMs > currentMs);

        if (nextSunset && nextSunset - currentMs <= threeHoursMs) {
          const sunsetTime = fmtHM(new Date(nextSunset));
          description += `, sunset at ${sunsetTime}`;
        }
      }

      // Add cloud condition suffix
      let cloudSuffix = "";
      if (s < 0.2) cloudSuffix = "overcast";
      else if (s < 0.4) cloudSuffix = "mostly cloudy";
      else if (s < 0.7) cloudSuffix = "partly sunny";

      return cloudSuffix ? `${description} (${cloudSuffix})` : description;
    }

    // Formulas (model.js), with this page's calibration
    function shadeVibeOf(T, RH, Wind) {
      return VibeModel.shadeVibeOf(T, RH, Wind, calibration);
    }
    function sunVibeOf(shadeV, solarExposure, R) {
      return VibeModel.sunVibeOf(shadeV, solarExposure, R, calibration);
    }
    function reflectivity() {
      const sel = parseFloat(els.reflect?.value ?? "0");
      if (sel === 0)
        return clamp(parseFloat(els.reflectCustom?.value ?? "0") || 0, 0, 1);
      return clamp(sel, 0, 1);
    }

    // Solar exposure
    function solarFromUVandCloud(inputs) {
      return VibeModel.solarFromUVandCloud(inputs, calibration);
    }

    // Compute card values (cards show °F/°C)
    function compute() {
      const Traw = parseFloat(els.temp?.value ?? "NaN");
      const RH = parseFloat(els.humidity?.value ?? "NaN");
      const Wind = parseFloat(els.wind?.value ?? "NaN");
      const Solar =
        solarExact !== null ? solarExact : parseFloat(els.solar?.value ?? "NaN");
      if ([Traw, RH, Wind].some((v) => Number.isNaN(v))) {
        statusEl &&
          (statusEl.textContent =
            "Enter temp, humidity, and wind or use your location/ZIP.");
        return;
      }
      const tempF = unit === "F" ? Traw : cToF(Traw);
      const shadeF = shadeVibeOf(tempF, RH, Wind);
      const solarValue = Number.isNaN(Solar) ? 0 : clamp(Solar, 0, 1);
      const sunF = sunVibeOf(shadeF, solarValue, reflectivity());

      const shadeDisplay = toUserTemp(shadeF);
      const sunDisplay = toUserTemp(sunF);

      // Always show both sun and shade temps together
      const isDay = isDaylightNow();

      els.shade &&
        (els.shade.innerHTML = `${formatTemp(shadeF)}${unitSuffix()}`);
      els.sun && (els.sun.innerHTML = `${formatTemp(sunF)}${unitSuffix()}`);

      // Always hide combined view
      if (els.combinedTempWrapper) {
        els.combinedTempWrapper.style.display = "none";
      }

      // Always show both sun and shade wrappers
      if (els.shadeTempWrapper) {
        els.shadeTempWrapper.style.display = "flex";
      }
      if (els.sunTempWrapper) {
        els.sunTempWrapper.style.display = "flex";
      }

      // Update card layout - always show both (ensure no classes that would hide one)
      const cardTemps = els.sunTempWrapper?.parentElement;
      if (cardTemps) {
        cardTemps.classList.remove("sun-hidden");
        // Ensure grid always shows 2 columns
        cardTemps.style.gridTemplateColumns = "1fr 1fr";
      }

      if (els.combinedLabel) {
        els.combinedLabel.innerHTML = combinedVibeDescriptor(
          shadeF,
          sunF,
          solarValue,
          isDaylightNow(),
          new Date()
        );
      }
      // Keep backward compatibility for separate labels
      els.shadeLabel &&
        (els.shadeLabel.innerHTML = vibeDescriptor(shadeF, {
          solar: solarValue,
          isDay: isDaylightNow(),
          context: "shade",
        }));
      if (els.sunLabel) {
        // Ensure description section is visible when showing normal content
        els.sunLabel.style.display = "";
        els.sunLabel.innerHTML = vibeDescriptor(sunF, {
          solar: solarValue,
          isDay: isDaylightNow(),
          context: "sun",
        });
      }

      // Remove skeleton loading state
      hideCardLoading();

      if (!simActive) {
        updateCardVisibility();
      }
      statusEl && (statusEl.textContent = "Computed from current inputs.");
    }

    // The card's solar exposure, exact. The Solar slider only shows it
    // (its 0.1 step would round, say, 0.04 to 0 and drop the 1.2°F surface
    // term); once someone moves the slider by hand, its value is used.
    let solarExact = null;
    function setAutoSolar(solar) {
      solarExact = solar;
      els.solar && (els.solar.value = solar.toFixed(1));
      els.solarVal && (els.solarVal.textContent = solar.toFixed(1));
    }

    // Without a UV reading: a rough exposure from cloud cover alone, and
    // none at night.
    function autoSolarFromCloudCover(cloudCoverPct, isDay) {
      const solar = isDay ? clamp(1 - cloudCoverPct / 100, 0.2, 1) : 0;
      setAutoSolar(solar);
      return solar;
    }

    // Current conditions from the forecast into the card's inputs.
    function applyCurrentConditions(cur) {
      if (typeof cur.is_day === "number") currentIsDay = cur.is_day;

      const tempF = cur.temperature_2m ?? cur.apparent_temperature ?? null;
      if (tempF != null)
        els.temp.value = (unit === "F" ? tempF : fToC(tempF)).toFixed(1);
      els.humidity.value = (cur.relative_humidity_2m ?? "").toFixed(0);
      els.wind.value = (cur.wind_speed_10m ?? "").toFixed(1);

      if (
        typeof cur.uv_index === "number" &&
        (typeof cur.is_day === "number" || typeof cur.is_day === "boolean")
      ) {
        setAutoSolar(
          solarFromUVandCloud({
            uv_index: cur.uv_index,
            uv_index_clear_sky: cur.uv_index_clear_sky,
            cloud_cover: cur.cloud_cover ?? 0,
            shortwave_radiation: cur.shortwave_radiation,
            direct_radiation: cur.direct_radiation,
            is_day: cur.is_day,
          })
        );
      } else if (typeof cur.cloud_cover === "number") {
        const isDay =
          cur.is_day === 1 || cur.is_day === true
            ? true
            : cur.is_day === 0 || cur.is_day === false
            ? false
            : isDaylightNow();
        autoSolarFromCloudCover(cur.cloud_cover, isDay);
      }
    }

    // Forecast: one Open-Meteo request per place for current conditions,
    // the hourly forecast and sunrise/sunset. Kept in memory and in
    // localStorage per location rounded to 2 dp (about 1 km), so a reload or
    // a return visit draws at once. Data younger than FORECAST_FRESH_MS is
    // used as is; older data (up to FORECAST_MAX_AGE_MS) is drawn first and
    // then refreshed.
    const FETCH_TIMEOUT_MS = 5000;
    const FORECAST_FRESH_MS = 15 * 60 * 1000;
    const FORECAST_MAX_AGE_MS = 3 * 60 * 60 * 1000;
    const FORECAST_CACHE_KEY = STORE + "forecastCache";
    const FORECAST_CACHE_PLACES = 6;
    const forecastMemory = new Map(); // key -> { fetchedAt, data }
    const pendingForecasts = new Map(); // key -> Promise

    const roundCoord = (v) => Math.round(v * 100) / 100;
    function forecastKey(lat, lon) {
      return `${roundCoord(lat).toFixed(2)},${roundCoord(lon).toFixed(2)}`;
    }

    function readForecastStore() {
      try {
        const raw = localStorage.getItem(FORECAST_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) {
        return {};
      }
    }

    function writeForecastStore(key, entry) {
      try {
        const store = readForecastStore();
        store[key] = entry;
        const now = Date.now();
        const keep = Object.entries(store)
          .filter(
            ([, v]) =>
              v && typeof v.fetchedAt === "number" &&
              now - v.fetchedAt < FORECAST_MAX_AGE_MS
          )
          .sort((x, y) => y[1].fetchedAt - x[1].fetchedAt)
          .slice(0, FORECAST_CACHE_PLACES);
        localStorage.setItem(
          FORECAST_CACHE_KEY,
          JSON.stringify(Object.fromEntries(keep))
        );
      } catch (e) {
        // Storage full or blocked: the in-memory copy still works.
      }
    }

    /** The newest copy we hold for this place, or null. */
    function peekForecast(lat, lon) {
      const key = forecastKey(lat, lon);
      let entry = forecastMemory.get(key) || null;
      if (!entry) {
        const stored = readForecastStore()[key];
        if (
          stored &&
          typeof stored.fetchedAt === "number" &&
          stored.data &&
          stored.data.current &&
          stored.data.hourly &&
          stored.data.daily &&
          Array.isArray(stored.data.hourly.time) &&
          typeof stored.data.hourly.time[0] === "number"
        ) {
          entry = stored;
          forecastMemory.set(key, entry);
        }
      }
      if (!entry) return null;
      let age = Date.now() - entry.fetchedAt;
      if (age < 0 || age >= FORECAST_MAX_AGE_MS) return null;
      // A copy from before the place's midnight starts a day early: it can
      // stand in while a fresh one loads, but it never counts as fresh.
      const zone = PlaceTime.isValidZone(entry.data.timezone)
        ? entry.data.timezone
        : browserZone;
      const firstDay = entry.data.daily?.time?.[0];
      if (firstDay * 1000 < PlaceTime.startOfDay(new Date(), zone)) {
        age = Math.max(age, FORECAST_FRESH_MS);
      }
      return { data: entry.data, age };
    }

    function forecastError(e) {
      if (e && e.name === "TimeoutError") return new Error("TIMEOUT");
      if (
        e &&
        ["RATE_LIMIT", "SERVER_ERROR", "INVALID_RESPONSE"].includes(e.message)
      )
        return e;
      if (e && e.message && e.message.startsWith("API_ERROR_")) return e;
      return new Error("NETWORK_ERROR");
    }

    async function fetchForecast(lat, lon) {
      const params = new URLSearchParams({
        latitude: roundCoord(lat).toFixed(2),
        longitude: roundCoord(lon).toFixed(2),
        current:
          "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,shortwave_radiation,direct_radiation,is_day",
        hourly:
          "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,shortwave_radiation,direct_radiation,is_day,precipitation,precipitation_probability,weathercode",
        daily: "sunrise,sunset",
        temperature_unit: "fahrenheit",
        wind_speed_unit: "mph",
        timezone: "auto",
        // Unix times: Open-Meteo's local-time strings carry one fixed
        // offset for the whole range, and new Date() would read them in the
        // viewer's zone.
        timeformat: "unixtime",
        forecast_days: 7,
      });
      let r;
      try {
        r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (e) {
        throw forecastError(e);
      }
      if (!r.ok) {
        if (r.status === 429) throw new Error("RATE_LIMIT");
        if (r.status >= 500) throw new Error("SERVER_ERROR");
        throw new Error(`API_ERROR_${r.status}`);
      }
      let data;
      try {
        data = await r.json();
      } catch (e) {
        throw e && e.name === "TimeoutError"
          ? new Error("TIMEOUT")
          : new Error("INVALID_RESPONSE");
      }
      if (
        !data ||
        !data.current ||
        !data.hourly ||
        !data.daily ||
        !Array.isArray(data.hourly.time) ||
        typeof data.hourly.time[0] !== "number"
      )
        throw new Error("INVALID_RESPONSE");
      return data;
    }

    /**
     * The forecast for a place, from the cache when it is younger than
     * maxAgeMs, otherwise fetched. A failed fetch falls back to any copy we
     * still hold (up to FORECAST_MAX_AGE_MS old) before giving up.
     */
    async function getForecast(lat, lon, { maxAgeMs = FORECAST_FRESH_MS } = {}) {
      const key = forecastKey(lat, lon);
      const held = peekForecast(lat, lon);
      if (held && held.age < maxAgeMs) return held.data;
      if (pendingForecasts.has(key)) return pendingForecasts.get(key);
      const request = fetchForecast(lat, lon)
        .then((data) => {
          const entry = { fetchedAt: Date.now(), data };
          forecastMemory.set(key, entry);
          writeForecastStore(key, entry);
          return data;
        })
        .catch((e) => {
          const fallback = peekForecast(lat, lon);
          if (fallback) return fallback.data;
          throw e;
        })
        .finally(() => pendingForecasts.delete(key));
      pendingForecasts.set(key, request);
      return request;
    }

    async function getCurrentWeather(lat, lon, options) {
      return (await getForecast(lat, lon, options)).current;
    }
    async function getHourlyWeather(lat, lon, options) {
      return (await getForecast(lat, lon, options)).hourly;
    }
    function sunTimesFrom(daily, daysAheadParam = daysAhead) {
      // From today on, at the place (an older copy starts a day early)
      const today = PlaceTime.startOfDay(new Date(), placeZone) / 1000;
      const from = Math.max(
        0,
        (daily?.time ?? []).findIndex((t) => t >= today)
      );
      const rises =
        daily?.sunrise?.slice(from).map((t) => new Date(t * 1000)) ?? [];
      const sets =
        daily?.sunset?.slice(from).map((t) => new Date(t * 1000)) ?? [];
      // Return arrays of all sunrise/sunset times for the visible range
      return {
        sunrises: rises.slice(0, daysAheadParam + 1), // +1 to include today
        sunsets: sets.slice(0, daysAheadParam + 1),
        // Keep legacy properties for backward compatibility
        sunriseToday: rises[0] ?? null,
        sunsetToday: sets[0] ?? null,
        sunriseTomorrow: rises[1] ?? null,
        sunsetTomorrow: sets[1] ?? null,
      };
    }
    // The hourly forecast for the place on screen, for redraws after a
    // setting changes: null when another place was chosen while it loaded,
    // so a late answer never draws over the new place.
    async function hourlyForShownPlace() {
      const seq = primeSeq;
      const { latitude, longitude } = lastCoords;
      const hourly = await getHourlyWeather(latitude, longitude);
      return seq === primeSeq ? hourly : null;
    }

    async function getDailySun(lat, lon, daysAheadParam = daysAhead, options) {
      return sunTimesFrom(
        (await getForecast(lat, lon, options)).daily,
        daysAheadParam
      );
    }

    // Timeline
    function buildTimelineDataset(hourly, daysAheadParam = daysAhead) {
      const now = new Date();
      // From the place's midnight today, daysAheadParam days.
      const start = new Date(PlaceTime.startOfDay(now, placeZone));
      const end = new Date(PlaceTime.startOfDay(now, placeZone, daysAheadParam));

      const times = hourly.time.map((t) => new Date(t * 1000));
      const startIdx = times.findIndex((d) => d >= start);
      const endIdx = times.findIndex((d) => d >= end);
      const s = startIdx === -1 ? 0 : startIdx;
      const e = endIdx === -1 ? times.length : endIdx;

      // First, build hourly data
      const hourlyLabels = [],
        hourlyShadeVals = [],
        hourlySunVals = [],
        hourlySolarByHour = [],
        hourlyIsDayByHour = [],
        hourlyWindByHour = [],
        hourlyHumidityByHour = [],
        hourlyPrecipitationByHour = [],
        hourlyWeathercodeByHour = [],
        hourlyAirTempByHour = [],
        hourlyPopByHour = [];

      for (let i = s; i < e; i++) {
        const T = hourly.temperature_2m[i];
        const RH = hourly.relative_humidity_2m[i];
        const Wind = hourly.wind_speed_10m[i];
        const CC = hourly.cloud_cover[i];
        const uv = hourly.uv_index[i] ?? 0;
        const uvc = hourly.uv_index_clear_sky[i] ?? 0;
        const isDay = hourly.is_day[i] === 1;
        const precip = hourly.precipitation?.[i] ?? 0;
        const wmo = hourly.weathercode?.[i] ?? 0;

        const shade = shadeVibeOf(T, RH, Wind);
        const solar = solarFromUVandCloud({
          uv_index: uv,
          uv_index_clear_sky: uvc,
          cloud_cover: CC,
          shortwave_radiation: hourly.shortwave_radiation?.[i],
          direct_radiation: hourly.direct_radiation?.[i],
          is_day: isDay ? 1 : 0,
        });
        const sun = sunVibeOf(shade, solar, reflectivity());

        hourlyLabels.push(times[i]);
        hourlyShadeVals.push(shade); // Keep as float for interpolation
        hourlySunVals.push(sun); // Keep as float for interpolation
        hourlySolarByHour.push(solar);
        hourlyIsDayByHour.push(isDay ? 1 : 0);
        hourlyWindByHour.push(Wind ?? 0);
        hourlyHumidityByHour.push(RH ?? 0);
        hourlyPrecipitationByHour.push(precip);
        hourlyWeathercodeByHour.push(wmo);
        hourlyAirTempByHour.push(T);
        hourlyPopByHour.push(hourly.precipitation_probability?.[i] ?? null);
      }

      // Now interpolate to 15-minute increments
      const labels = [],
        shadeVals = [],
        sunVals = [],
        solarByHour = [],
        isDayByHour = [],
        windByHour = [],
        humidityByHour = [],
        precipitationByHour = [],
        weathercodeByHour = [],
        airTempByHour = [], // °F
        popByHour = []; // chance of precipitation, %, the hour's own

      // Ensure we have hourly data before interpolating
      if (hourlyLabels.length === 0) {
        // Fallback: return hourly data if interpolation would fail
        return {
          labels: hourlyLabels,
          shadeVals: hourlyShadeVals.map((v) => parseFloat(v.toFixed(1))),
          sunVals: hourlySunVals.map((v) => parseFloat(v.toFixed(1))),
          solarByHour: hourlySolarByHour,
          isDayByHour: hourlyIsDayByHour,
          windByHour: hourlyWindByHour,
          humidityByHour: hourlyHumidityByHour,
          precipitationByHour: hourlyPrecipitationByHour,
          weathercodeByHour: hourlyWeathercodeByHour,
          airTempByHour: hourlyAirTempByHour,
          popByHour: hourlyPopByHour,
          now,
          hourlyLabels,
        };
      }

      for (let i = 0; i < hourlyLabels.length; i++) {
        const currentTime = new Date(hourlyLabels[i]);
        const isLastHour = i === hourlyLabels.length - 1;

        // Add 4 points per hour (0, 15, 30, 45 minutes)
        for (let minuteOffset = 0; minuteOffset < 60; minuteOffset += 15) {
          const interpolatedTime = new Date(
            currentTime.getTime() + minuteOffset * 60000
          );

          // Only add if within the time range (use <= for end to include the last point)
          if (interpolatedTime >= start && interpolatedTime <= end) {
            labels.push(new Date(interpolatedTime));

            if (minuteOffset === 0) {
              // Use exact hourly value
              shadeVals.push(parseFloat(hourlyShadeVals[i].toFixed(1)));
              sunVals.push(parseFloat(hourlySunVals[i].toFixed(1)));
              solarByHour.push(hourlySolarByHour[i]);
              isDayByHour.push(hourlyIsDayByHour[i]);
              windByHour.push(hourlyWindByHour[i]);
              humidityByHour.push(hourlyHumidityByHour[i]);
              precipitationByHour.push(hourlyPrecipitationByHour[i]);
              weathercodeByHour.push(hourlyWeathercodeByHour[i]);
              airTempByHour.push(hourlyAirTempByHour[i]);
              popByHour.push(hourlyPopByHour[i]);
            } else if (!isLastHour && i + 1 < hourlyShadeVals.length) {
              // Interpolate between current and next hour
              const fraction = minuteOffset / 60;
              shadeVals.push(
                parseFloat(
                  (
                    hourlyShadeVals[i] +
                    (hourlyShadeVals[i + 1] - hourlyShadeVals[i]) * fraction
                  ).toFixed(1)
                )
              );
              sunVals.push(
                parseFloat(
                  (
                    hourlySunVals[i] +
                    (hourlySunVals[i + 1] - hourlySunVals[i]) * fraction
                  ).toFixed(1)
                )
              );
              solarByHour.push(
                hourlySolarByHour[i] +
                  (hourlySolarByHour[i + 1] - hourlySolarByHour[i]) * fraction
              );
              // For boolean-like values, use the current hour's value
              isDayByHour.push(hourlyIsDayByHour[i]);
              windByHour.push(
                hourlyWindByHour[i] +
                  (hourlyWindByHour[i + 1] - hourlyWindByHour[i]) * fraction
              );
              humidityByHour.push(
                hourlyHumidityByHour[i] +
                  (hourlyHumidityByHour[i + 1] - hourlyHumidityByHour[i]) *
                    fraction
              );
              precipitationByHour.push(
                hourlyPrecipitationByHour[i] +
                  (hourlyPrecipitationByHour[i + 1] -
                    hourlyPrecipitationByHour[i]) *
                    fraction
              );
              weathercodeByHour.push(hourlyWeathercodeByHour[i]);
              airTempByHour.push(
                hourlyAirTempByHour[i] +
                  (hourlyAirTempByHour[i + 1] - hourlyAirTempByHour[i]) *
                    fraction
              );
              popByHour.push(hourlyPopByHour[i]);
            } else {
              // Last hour, use current values
              shadeVals.push(parseFloat(hourlyShadeVals[i].toFixed(1)));
              sunVals.push(parseFloat(hourlySunVals[i].toFixed(1)));
              solarByHour.push(hourlySolarByHour[i]);
              isDayByHour.push(hourlyIsDayByHour[i]);
              windByHour.push(hourlyWindByHour[i]);
              humidityByHour.push(hourlyHumidityByHour[i]);
              precipitationByHour.push(hourlyPrecipitationByHour[i]);
              weathercodeByHour.push(hourlyWeathercodeByHour[i]);
              airTempByHour.push(hourlyAirTempByHour[i]);
              popByHour.push(hourlyPopByHour[i]);
            }
          }
        }
      }

      return {
        labels,
        shadeVals,
        sunVals,
        solarByHour,
        isDayByHour,
        windByHour,
        humidityByHour,
        precipitationByHour,
        weathercodeByHour,
        airTempByHour,
        popByHour,
        now,
        hourlyLabels, // Keep original hourly labels for bottom axis
      };
    }
    function hourKey(d) {
      return PlaceTime.startOfHour(d, placeZone);
    }

    function nearestLabelIndex(labelDates, target) {
      if (!target) return -1;
      const tg = hourKey(target);
      let bestIdx = -1,
        bestDiff = Infinity;
      for (let i = 0; i < labelDates.length; i++) {
        const d = hourKey(labelDates[i]);
        const diff = Math.abs(d - tg);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      return bestIdx;
    }
    function buildSunMarkers(labelDates) {
      const evts = [];
      // Add all sunrise/sunset events from the arrays
      if (sunTimes.sunrises && sunTimes.sunrises.length > 0) {
        sunTimes.sunrises.forEach((t) => {
          if (t) evts.push({ t, emoji: "\u{2600}\u{FE0F}", label: "Sunrise" }); // ☀️
        });
      }
      if (sunTimes.sunsets && sunTimes.sunsets.length > 0) {
        sunTimes.sunsets.forEach((t) => {
          if (t) evts.push({ t, emoji: "\u{2600}\u{FE0F}", label: "Sunset" }); // ☀️
        });
      }
      // Fallback to legacy properties if arrays are empty
      if (evts.length === 0) {
        const legacy = [
          {
            t: sunTimes.sunriseToday,
            emoji: "\u{2600}\u{FE0F}",
            label: "Sunrise",
          }, // ☀️
          {
            t: sunTimes.sunsetToday,
            emoji: "\u{2600}\u{FE0F}",
            label: "Sunset",
          }, // ☀️
          {
            t: sunTimes.sunriseTomorrow,
            emoji: "\u{2600}\u{FE0F}",
            label: "Sunrise",
          }, // ☀️
          {
            t: sunTimes.sunsetTomorrow,
            emoji: "\u{2600}\u{FE0F}",
            label: "Sunset",
          }, // ☀️
        ].filter((e) => e.t);
        evts.push(...legacy);
      }
      // Return markers with actual time, filter to only those in visible range
      const firstLabel = new Date(labelDates[0]);
      const lastLabel = new Date(labelDates[labelDates.length - 1]);
      return evts
        .map((e) => {
          const timeDate = new Date(e.t);
          // Only include if within visible range
          if (timeDate >= firstLabel && timeDate <= lastLabel) {
            return {
              time: timeDate,
              emoji: e.emoji,
              label: e.label,
              when: e.t,
            };
          }
          return null;
        })
        .filter((e) => e !== null);
    }
    // Loading state helpers
    function showCardLoading() {
      // Cards start with skeleton class, will be removed when data loads
    }

    function hideCardLoading() {
      document.querySelectorAll(".skeleton-text").forEach((el) => {
        el.classList.remove("skeleton-text");
      });
    }

    function showChartLoading() {
      if (chartSkeletonEl) chartSkeletonEl.style.display = "flex";
      if (els.chartCanvas) els.chartCanvas.style.display = "none";
    }

    function hideChartLoading() {
      if (chartSkeletonEl) chartSkeletonEl.style.display = "none";
      if (els.chartCanvas) els.chartCanvas.style.display = "block";
    }

    function showSummaryLoading() {
      if (summaryTextEl) {
        summaryTextEl.textContent = "Generating summary...";
        summaryTextEl.className = "summary-text loading";
      }
    }

    // Error handling with multiple action options
    function showError(title, details, suggestion, options = {}) {
      if (!errorMessageEl) return;
      if (errorTitleEl) errorTitleEl.textContent = title;
      if (errorDetailsEl) errorDetailsEl.textContent = details;
      if (errorSuggestionEl) errorSuggestionEl.textContent = suggestion || "";

      // Stop skeleton animations when location permission error is shown
      const isLocationError =
        title.includes("Location") &&
        (title.includes("Permission") ||
          title.includes("Denied") ||
          title.includes("Unavailable"));
      if (isLocationError || !vibeChart) {
        document.body.classList.add("error-displayed");
      }

      // Show/hide retry button
      if (errorRetryBtn) {
        if (options.retry) {
          errorRetryBtn.style.display = "inline-block";
          errorRetryBtn.onclick = () => {
            hideError();
            options.retry();
          };
        } else {
          errorRetryBtn.style.display = "none";
        }
      }

      // Show/hide ZIP input
      if (errorZipInputWrapper && errorZipInput && errorZipSubmitBtn) {
        if (options.zip !== undefined) {
          // Show the ZIP input wrapper
          errorZipInputWrapper.style.display = "flex";
          errorZipInput.value = "";

          // Handle ZIP submission
          const handleZipSubmit = async () => {
            const raw = errorZipInput.value.trim();
            const zip5 = normalizeZip(raw);
            if (!zip5) {
              errorZipInput.focus();
              errorZipInput.style.borderColor = "#ef4444";
              setTimeout(() => {
                if (errorZipInput) errorZipInput.style.borderColor = "";
              }, 2000);
              return;
            }

            try {
              errorZipSubmitBtn.disabled = true;
              errorZipSubmitBtn.textContent = "Loading…";
              const { latitude, longitude, place } = await getCoordsForZip(
                zip5
              );
              storageCacheSet(ZIP_KEY, zip5);
              await primeWeatherForCoords(
                latitude,
                longitude,
                `ZIP ${zip5} (${place})`,
                place
              );
              // hideError() is called in primeWeatherForCoords on success, but ensure it's hidden here too
              hideError();
            } catch (e) {
              console.warn(e);
              let errorTitle = "ZIP Lookup Failed";
              let errorDetails = "Could not find that ZIP code.";
              let errorSuggestion = "Please check the ZIP code and try again.";
              let retryCallback = null;

              if (e.message === "ZIP_NOT_FOUND") {
                errorTitle = "ZIP Code Not Found";
                errorDetails = `The ZIP code "${zip5}" was not found.`;
                errorSuggestion = "Please verify the ZIP code and try again.";
              } else if (e.message === "ZIP_LOOKUP_FAILED") {
                errorTitle = "ZIP Lookup Service Error";
                errorDetails =
                  "The ZIP lookup service is temporarily unavailable.";
                errorSuggestion = "Please try again in a moment.";
                retryCallback = handleZipSubmit;
              }

              showError(errorTitle, errorDetails, errorSuggestion, {
                retry: retryCallback,
                zip: () => {},
              });
              if (errorZipInput) {
                errorZipInput.value = zip5;
                setTimeout(() => errorZipInput.focus(), 100);
              }
            } finally {
              if (errorZipSubmitBtn) {
                errorZipSubmitBtn.disabled = false;
                errorZipSubmitBtn.textContent = "Use ZIP";
              }
            }
          };

          // Set up event listeners
          errorZipSubmitBtn.onclick = handleZipSubmit;
          errorZipInput.onkeydown = (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleZipSubmit();
            }
          };

          // Focus input when error appears
          setTimeout(() => errorZipInput.focus(), 100);
        } else {
          errorZipInputWrapper.style.display = "none";
        }
      }

      errorMessageEl.classList.add("show");
      errorMessageEl.style.display = "block";
    }

    function hideError() {
      if (errorMessageEl) {
        errorMessageEl.classList.remove("show");
        errorMessageEl.style.display = "none";
        // Resume skeleton animations when error is hidden
        document.body.classList.remove("error-displayed");
      }
    }

    // Update chart data directly without recreating the chart
    function updateChartData(
      labels,
      shadeValsF,
      sunValsFF,
      now,
      isDayByHour = []
    ) {
      if (!vibeChart || !els.chartCanvas) return;

      // Preserve hover state before update
      const savedHoverX = vibeChart._hoverX;
      const savedHoverIndex = vibeChart._hoverIndex;

      const shadeVals = shadeValsF.map((v) => toUserTemp(v));
      const sunVals = sunValsFF.map((v) => toUserTemp(v));

      const displayLabels = labels.map((d) =>
        d.toLocaleString([], inZone({ weekday: "short", hour: "numeric" }))
      );
      const nowIdx = labels.findIndex((d) => hourKey(d) === hourKey(now));
      const markers = buildSunMarkers(labels);
      const touchGrassTimes = touchGrassFor(
        labels,
        sunVals,
        shadeVals,
        isDayByHour
      );

      // Update chart data directly
      vibeChart.data.labels = displayLabels;
      vibeChart.data.datasets[0].data = sunVals;
      vibeChart.data.datasets[1].data = shadeVals;
      vibeChart._rawLabels = labels;
      vibeChart._markers = markers;
      vibeChart._nowIdx = nowIdx;
      vibeChart._isDayByHour = isDayByHour;
      vibeChart._sunTimes = sunTimes;
      vibeChart._touchGrassTimes = touchGrassTimes;

      // Update y-axis range
      vibeChart.options.scales.y.suggestedMin =
        Math.min(...shadeVals, ...sunVals) - 3;
      vibeChart.options.scales.y.suggestedMax =
        Math.max(...shadeVals, ...sunVals) + 3;

      // Update chart (this will trigger plugins)
      vibeChart.update("none");

      // Restore hover state after update (scales are now ready)
      if (
        savedHoverIndex !== null &&
        savedHoverIndex !== undefined &&
        savedHoverIndex >= 0 &&
        savedHoverIndex < labels.length
      ) {
        const xScale = vibeChart.scales.x;
        vibeChart._hoverX = xScale.getPixelForValue(savedHoverIndex);
        vibeChart._hoverIndex = savedHoverIndex;
        // Redraw to show hover indicator
        vibeChart.draw();
      } else if (savedHoverX !== null && savedHoverX !== undefined) {
        vibeChart._hoverX = savedHoverX;
        // Redraw to show hover indicator
        vibeChart.draw();
      }

      updateCardVisibility();
    }

    // The touch-grass rule reads the sun line with the old 5% snap: a sun
    // value within 5% of shade (in display units) counts as the shade value.
    // The chart no longer draws the snap, which hid real gaps on a fifth to a
    // quarter of daylight hours, but the rule keeps reading it so its picks
    // stay where they were (Bryan, 2026-09-25). The leaf's temperature is
    // the drawn line's value at the time the rule picked.
    function touchGrassFor(labels, sunVals, shadeVals, isDayByHour) {
      const snapped = sunVals.map((sunVal, i) => {
        const shadeVal = shadeVals[i];
        if (shadeVal === 0) return sunVal; // Avoid division by zero
        const percentDiff = Math.abs((sunVal - shadeVal) / shadeVal);
        return percentDiff < 0.05 ? shadeVal : sunVal;
      });
      return findTouchGrassTimes(labels, snapped, isDayByHour).map((t) => ({
        ...t,
        temp: sunVals[t.index],
      }));
    }

    // Find ideal "Touch Grass" time per day (65-75°F / 18-24°C during daytime)
    function findTouchGrassTimes(labels, sunVals, isDayByHour) {
      const idealMinF = 65;
      const idealMaxF = 75;
      const idealMinC = 18;
      const idealMaxC = 24;

      // Convert ideal range based on current unit
      const idealMin = unit === "F" ? idealMinF : idealMinC;
      const idealMax = unit === "F" ? idealMaxF : idealMaxC;

      const touchGrassTimes = [];
      const timesByDay = new Map(); // Map of day key -> best time for that day

      for (let i = 0; i < labels.length; i++) {
        // Only consider daytime hours
        if (!isDayByHour[i]) continue;

        const sunTemp = sunVals[i];
        const time = new Date(labels[i]);

        // Check if temperature is in ideal range
        if (sunTemp >= idealMin && sunTemp <= idealMax) {
          // Create day key (YYYY-MM-DD)
          const dayKey = PlaceTime.dayKey(time, placeZone);

          // Score: prefer temperatures closer to the middle of the range
          const midPoint = (idealMin + idealMax) / 2;
          const distanceFromMid = Math.abs(sunTemp - midPoint);
          const score = 100 - distanceFromMid * 10; // Higher score = better

          // Prefer times between 10am and 4pm (better for outdoor activities)
          const hour = zp(time).hour;
          const hourBonus = hour >= 10 && hour <= 16 ? 20 : 0;
          const finalScore = score + hourBonus;

          const candidate = {
            time,
            index: i,
            temp: sunTemp,
            score: finalScore,
          };

          // Keep the best time for each day
          if (
            !timesByDay.has(dayKey) ||
            candidate.score > timesByDay.get(dayKey).score
          ) {
            timesByDay.set(dayKey, candidate);
          }
        }
      }

      // Convert map to array
      return Array.from(timesByDay.values());
    }

    async function renderChart(
      labels,
      shadeValsF,
      sunValsFF,
      now,
      isDayByHour = []
    ) {
      if (!els.chartCanvas) return;
      updateChartTitle();
      await ensureChartJs();
      const ctx = els.chartCanvas.getContext("2d");
      if (!window.Chart) {
        console.warn("Chart.js failed to load.");
        return;
      }

      const shadeVals = shadeValsF.map((v) => toUserTemp(v));
      const sunVals = sunValsFF.map((v) => toUserTemp(v));

      const displayLabels = labels.map((d) =>
        d.toLocaleString([], inZone({ weekday: "short", hour: "numeric" }))
      );
      const nowIdx = labels.findIndex((d) => hourKey(d) === hourKey(now));
      const markers = buildSunMarkers(labels);

      const touchGrassTimes = touchGrassFor(
        labels,
        sunVals,
        shadeVals,
        isDayByHour
      );

      // Optimize: If chart exists and structure hasn't changed, just update data
      if (vibeChart && vibeChart.data.labels.length === displayLabels.length) {
        vibeChart.data.labels = displayLabels;
        vibeChart.data.datasets[0].data = sunVals;
        vibeChart.data.datasets[1].data = shadeVals;
        // Store raw labels on chart instance for plugins to access
        vibeChart._rawLabels = labels;
        vibeChart._markers = markers;
        vibeChart._nowIdx = nowIdx;
        vibeChart._isDayByHour = isDayByHour;
        vibeChart._sunTimes = sunTimes; // Store sunrise/sunset times for exact day/night detection
        vibeChart._touchGrassTimes = touchGrassTimes; // Store Touch Grass times for plugin
        // Update y-axis range
        vibeChart.options.scales.y.suggestedMin =
          Math.min(...shadeVals, ...sunVals) - 3;
        vibeChart.options.scales.y.suggestedMax =
          Math.max(...shadeVals, ...sunVals) + 3;
        vibeChart.update("none");
        // Ensure loading skeleton is hidden
        hideChartLoading();
        // Update card visibility in case day/night status changed
        updateCardVisibility();
        return;
      }

      // Structure changed or chart doesn't exist - recreate
      if (vibeChart) {
        vibeChart.destroy();
        vibeChart = null;
      }

      // Helper to format time (e.g., "4am", "12pm")
      function formatTime(date) {
        const { hour, minute } = zp(date);
        if (minute !== 0) return ""; // Only show labels on the hour
        const period = hour >= 12 ? "pm" : "am";
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}${period}`;
      }

      // Helper to format day (e.g., "Fri")
      function formatDay(date) {
        return date.toLocaleDateString([], inZone({ weekday: "short" }));
      }

      // Day separator plugin - vertical lines at midnight boundaries
      const daySeparatorPlugin = {
        id: "daySeparator",
        beforeDatasetsDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          const midnightIndices = [];
          for (let i = 1; i < labels.length; i++) {
            const prevDate = new Date(labels[i - 1]);
            const currDate = new Date(labels[i]);
            if (zp(prevDate).day !== zp(currDate).day) {
              midnightIndices.push(i);
            }
          }

          if (midnightIndices.length === 0) return;

          ctx.save();
          ctx.strokeStyle = "rgba(31, 42, 59, 0.5)"; // var(--border) with reduced opacity
          ctx.lineWidth = 1;
          ctx.setLineDash([]);

          midnightIndices.forEach((idx) => {
            const x = scales.x.getPixelForValue(idx);
            if (x >= chartArea.left && x <= chartArea.right) {
              ctx.beginPath();
              ctx.moveTo(x, chartArea.top);
              ctx.lineTo(x, chartArea.bottom);
              ctx.stroke();
            }
          });

          ctx.restore();
        },
      };

      // Day/night shading plugin
      const dayNightShadingPlugin = {
        id: "dayNightShading",
        beforeDatasetsDraw(chart) {
          // Check if night shading is enabled
          if (!nightShadingEnabled) return;

          const { ctx, chartArea, scales } = chart;

          // Get labels and sunTimes from chart instance (supports chart updates)
          const rawLabels = chart._rawLabels || [];
          const chartSunTimes = chart._sunTimes || sunTimes;

          if (!chartSunTimes.sunrises || chartSunTimes.sunrises.length === 0) {
            // Fallback to legacy properties
            if (!chartSunTimes.sunriseToday || !chartSunTimes.sunsetToday)
              return;
          }

          if (rawLabels.length === 0) {
            ctx.restore();
            return;
          }

          ctx.save();

          // Helper to get exact pixel position for a Date (interpolates between hour markers)
          function getPixelForExactTime(targetTime) {
            const target = new Date(targetTime);
            // Find the two nearest hour indices
            let beforeIdx = -1;
            let afterIdx = -1;
            let beforeTime = null;
            let afterTime = null;

            for (let i = 0; i < rawLabels.length; i++) {
              const labelTime = new Date(rawLabels[i]);
              if (labelTime <= target) {
                beforeIdx = i;
                beforeTime = labelTime;
              }
              if (labelTime >= target && afterIdx === -1) {
                afterIdx = i;
                afterTime = labelTime;
                break;
              }
            }

            // If exact match or at boundaries
            if (beforeIdx === afterIdx) {
              return scales.x.getPixelForValue(
                beforeIdx >= 0 ? beforeIdx : afterIdx
              );
            }

            // If before first label
            if (beforeIdx === -1) {
              return scales.x.getPixelForValue(0);
            }

            // If after last label
            if (afterIdx === -1) {
              return scales.x.getPixelForValue(rawLabels.length - 1);
            }

            // Interpolate between the two hour positions
            const beforePixel = scales.x.getPixelForValue(beforeIdx);
            const afterPixel = scales.x.getPixelForValue(afterIdx);
            const timeDiff = afterTime - beforeTime;
            const targetDiff = target - beforeTime;
            const fraction = timeDiff > 0 ? targetDiff / timeDiff : 0;

            return beforePixel + (afterPixel - beforePixel) * fraction;
          }

          // Get all sunrise/sunset events in the visible range
          const events = [];

          // Use arrays if available, otherwise fall back to legacy properties
          const sunrises =
            chartSunTimes.sunrises && chartSunTimes.sunrises.length > 0
              ? chartSunTimes.sunrises
              : (chartSunTimes.sunriseToday
                  ? [chartSunTimes.sunriseToday]
                  : []
                ).concat(
                  chartSunTimes.sunriseTomorrow
                    ? [chartSunTimes.sunriseTomorrow]
                    : []
                );
          const sunsets =
            chartSunTimes.sunsets && chartSunTimes.sunsets.length > 0
              ? chartSunTimes.sunsets
              : (chartSunTimes.sunsetToday
                  ? [chartSunTimes.sunsetToday]
                  : []
                ).concat(
                  chartSunTimes.sunsetTomorrow
                    ? [chartSunTimes.sunsetTomorrow]
                    : []
                );

          // Add all sunrise/sunset events with their actual times
          sunrises.forEach((time) => {
            if (time) {
              const timeDate = new Date(time);
              // Only include if within the visible range
              const firstLabel = new Date(rawLabels[0]);
              const lastLabel = new Date(rawLabels[rawLabels.length - 1]);
              if (timeDate >= firstLabel && timeDate <= lastLabel) {
                events.push({ time: timeDate, type: "sunrise" });
              }
            }
          });
          sunsets.forEach((time) => {
            if (time) {
              const timeDate = new Date(time);
              // Only include if within the visible range
              const firstLabel = new Date(rawLabels[0]);
              const lastLabel = new Date(rawLabels[rawLabels.length - 1]);
              if (timeDate >= firstLabel && timeDate <= lastLabel) {
                events.push({ time: timeDate, type: "sunset" });
              }
            }
          });

          // Sort events by time
          events.sort((a, b) => a.time - b.time);

          if (events.length === 0) {
            ctx.restore();
            return;
          }

          // Get the current theme
          const isLightMode =
            document.documentElement.getAttribute("data-theme") === "light";

          // Set fill style based on theme
          // Dark mode: highlight daytime with lighter background
          // Light mode: highlight nighttime with darker background
          ctx.fillStyle = isLightMode
            ? "rgba(0, 0, 0, 0.15)" // Darker for night in light mode
            : "rgba(255, 255, 255, 0.08)"; // Lighter for day in dark mode

          // Get the start and end times of the visible range
          const chartStartTime = new Date(rawLabels[0]);
          const chartEndTime = new Date(rawLabels[rawLabels.length - 1]);

          if (isLightMode) {
            // Light mode: shade nighttime (sunset to sunrise)

            // Determine if we start in night (before first sunrise)
            const firstEvent = events[0];
            if (
              firstEvent &&
              firstEvent.type === "sunrise" &&
              firstEvent.time > chartStartTime
            ) {
              // Night from start to first sunrise
              let xStart = getPixelForExactTime(chartStartTime);
              let xEnd = getPixelForExactTime(firstEvent.time);
              if (xStart < chartArea.right && xEnd > chartArea.left) {
                const rectX = Math.max(xStart, chartArea.left);
                const rectWidth = Math.min(xEnd, chartArea.right) - rectX;
                if (rectWidth > 0) {
                  ctx.fillRect(
                    rectX,
                    chartArea.top,
                    rectWidth,
                    chartArea.bottom - chartArea.top
                  );
                }
              }
            }

            // Process all sunset->sunrise pairs (night periods)
            for (let i = 0; i < events.length; i++) {
              const event = events[i];
              if (event.type === "sunset") {
                // Start of night period - use exact sunset time
                let xStart = getPixelForExactTime(event.time);
                // Find next sunrise
                let xEnd = getPixelForExactTime(chartEndTime);
                for (let j = i + 1; j < events.length; j++) {
                  if (events[j].type === "sunrise") {
                    xEnd = getPixelForExactTime(events[j].time);
                    break;
                  }
                }
                // Draw rectangle aligned exactly with sunrise/sunset times
                if (xStart < chartArea.right && xEnd > chartArea.left) {
                  const rectX = Math.max(xStart, chartArea.left);
                  const rectWidth = Math.min(xEnd, chartArea.right) - rectX;
                  if (rectWidth > 0) {
                    ctx.fillRect(
                      rectX,
                      chartArea.top,
                      rectWidth,
                      chartArea.bottom - chartArea.top
                    );
                  }
                }
              }
            }
          } else {
            // Dark mode: shade daytime (sunrise to sunset)

            // Determine if we start in day (before first sunset, after first sunrise)
            const firstEvent = events[0];
            if (
              firstEvent &&
              firstEvent.type === "sunrise" &&
              firstEvent.time > chartStartTime
            ) {
              // Day from first sunrise to next sunset (or end of chart)
              let xStart = getPixelForExactTime(firstEvent.time);
              let xEnd = getPixelForExactTime(chartEndTime);
              // Find next sunset
              for (let j = 0; j < events.length; j++) {
                if (
                  events[j].type === "sunset" &&
                  events[j].time > firstEvent.time
                ) {
                  xEnd = getPixelForExactTime(events[j].time);
                  break;
                }
              }
              if (xStart < chartArea.right && xEnd > chartArea.left) {
                const rectX = Math.max(xStart, chartArea.left);
                const rectWidth = Math.min(xEnd, chartArea.right) - rectX;
                if (rectWidth > 0) {
                  ctx.fillRect(
                    rectX,
                    chartArea.top,
                    rectWidth,
                    chartArea.bottom - chartArea.top
                  );
                }
              }
            }

            // Process all sunrise->sunset pairs (day periods)
            for (let i = 0; i < events.length; i++) {
              const event = events[i];
              if (event.type === "sunrise") {
                // Start of day period - use exact sunrise time
                let xStart = getPixelForExactTime(event.time);
                // Find next sunset
                let xEnd = getPixelForExactTime(chartEndTime);
                for (let j = i + 1; j < events.length; j++) {
                  if (events[j].type === "sunset") {
                    xEnd = getPixelForExactTime(events[j].time);
                    break;
                  }
                }
                // Draw rectangle aligned exactly with sunrise/sunset times
                if (xStart < chartArea.right && xEnd > chartArea.left) {
                  const rectX = Math.max(xStart, chartArea.left);
                  const rectWidth = Math.min(xEnd, chartArea.right) - rectX;
                  if (rectWidth > 0) {
                    ctx.fillRect(
                      rectX,
                      chartArea.top,
                      rectWidth,
                      chartArea.bottom - chartArea.top
                    );
                  }
                }
              }
            }
          }

          ctx.restore();
        },
      };

      // Selection highlight plugin
      const selectionHighlightPlugin = {
        id: "selectionHighlight",
        afterDatasetsDraw(chart) {
          if (!selectionRange) return;
          const { ctx, chartArea, scales } = chart;

          // Helper to get exact pixel position for a Date (same as in day/night shading)
          function getPixelForExactTime(targetTime) {
            const target = new Date(targetTime);
            let beforeIdx = -1;
            let afterIdx = -1;
            let beforeTime = null;
            let afterTime = null;

            for (let i = 0; i < labels.length; i++) {
              const labelTime = new Date(labels[i]);
              if (labelTime <= target) {
                beforeIdx = i;
                beforeTime = labelTime;
              }
              if (labelTime >= target && afterIdx === -1) {
                afterIdx = i;
                afterTime = labelTime;
                break;
              }
            }

            if (beforeIdx === afterIdx) {
              return scales.x.getPixelForValue(
                beforeIdx >= 0 ? beforeIdx : afterIdx
              );
            }
            if (beforeIdx === -1) return scales.x.getPixelForValue(0);
            if (afterIdx === -1)
              return scales.x.getPixelForValue(labels.length - 1);

            const beforePixel = scales.x.getPixelForValue(beforeIdx);
            const afterPixel = scales.x.getPixelForValue(afterIdx);
            const timeDiff = afterTime - beforeTime;
            const targetDiff = target - beforeTime;
            const fraction = timeDiff > 0 ? targetDiff / timeDiff : 0;

            return beforePixel + (afterPixel - beforePixel) * fraction;
          }

          const xStart = getPixelForExactTime(selectionRange.startTime);
          const xEnd = getPixelForExactTime(selectionRange.endTime);

          if (xStart >= chartArea.right || xEnd <= chartArea.left) return;

          ctx.save();
          ctx.fillStyle = "rgba(34, 197, 94, 0.15)"; // Green highlight with transparency
          ctx.fillRect(
            Math.max(xStart, chartArea.left),
            chartArea.top,
            Math.min(xEnd, chartArea.right) - Math.max(xStart, chartArea.left),
            chartArea.bottom - chartArea.top
          );
          ctx.restore();
        },
      };
      // Custom timeline labels plugin - two-line format (times on top, days below)

      const timelineLabelsPlugin = {
        id: "timelineLabels",
        afterDraw(chart) {
          const { ctx, scales, chartArea } = chart;
          const xScale = scales.x;

          // Use hourly labels for display (stored on timelineState)
          const hourlyLabels =
            window.timelineState?.hourlyLabels || chart._rawLabels || [];
          const fullLabels = chart._rawLabels || [];
          if (hourlyLabels.length === 0 || fullLabels.length === 0) return;

          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
          ctx.fillStyle =
            getComputedStyle(document.body).getPropertyValue("--muted") ||
            "#8aa0b6";

          // Measure text to determine minimum spacing
          const sampleTime = formatTime(new Date()) || "12pm";
          const sampleDay = formatDay(new Date()) || "Mon";
          const timeMetrics = ctx.measureText(sampleTime);
          const dayMetrics = ctx.measureText(sampleDay);
          const maxTextWidth = Math.max(timeMetrics.width, dayMetrics.width);
          const minSpacing = maxTextWidth * 1.5; // 1.5x text width for comfortable spacing

          // Filter ticks to prevent overlap - only show hourly ticks
          const visibleTicks = [];
          let lastX = -Infinity;

          // Find hourly positions in the full labels array
          hourlyLabels.forEach((hourlyLabel) => {
            const hourlyTime = new Date(hourlyLabel);
            // Find the index in full labels array that matches this hour
            const idx = fullLabels.findIndex((label) => {
              const labelTime = new Date(label);
              return labelTime.getTime() === hourlyTime.getTime();
            });

            if (idx === -1) return;

            const x = xScale.getPixelForValue(idx);
            if (x < chartArea.left || x > chartArea.right) return;

            if (x - lastX >= minSpacing || visibleTicks.length === 0) {
              visibleTicks.push({ x, date: hourlyTime });
              lastX = x;
            }
          });

          // Always include first and last hourly ticks if they exist
          if (hourlyLabels.length > 0) {
            const firstHourlyTime = new Date(hourlyLabels[0]);
            const lastHourlyTime = new Date(
              hourlyLabels[hourlyLabels.length - 1]
            );
            const firstIdx = fullLabels.findIndex((label) => {
              const labelTime = new Date(label);
              return labelTime.getTime() === firstHourlyTime.getTime();
            });
            const lastIdx = fullLabels.findIndex((label) => {
              const labelTime = new Date(label);
              return labelTime.getTime() === lastHourlyTime.getTime();
            });

            if (firstIdx !== -1) {
              const firstX = xScale.getPixelForValue(firstIdx);
              if (firstX >= chartArea.left && firstX <= chartArea.right) {
                const firstTimeStr = formatTime(firstHourlyTime);
                const firstDayStr = formatDay(firstHourlyTime);
                if (firstTimeStr) {
                  ctx.fillText(firstTimeStr, firstX, chartArea.bottom + 4);
                }
                if (firstDayStr) {
                  ctx.fillText(firstDayStr, firstX, chartArea.bottom + 18);
                }
              }
            }

            if (lastIdx !== -1) {
              const lastX = xScale.getPixelForValue(lastIdx);
              if (lastX >= chartArea.left && lastX <= chartArea.right) {
                const lastTimeStr = formatTime(lastHourlyTime);
                const lastDayStr = formatDay(lastHourlyTime);
                if (lastTimeStr) {
                  ctx.fillText(lastTimeStr, lastX, chartArea.bottom + 4);
                }
                if (lastDayStr) {
                  ctx.fillText(lastDayStr, lastX, chartArea.bottom + 18);
                }
              }
            }
          }

          // Draw the visible ticks
          visibleTicks.forEach(({ x, date }) => {
            const timeStr = formatTime(date);
            const dayStr = formatDay(date);

            if (timeStr) {
              ctx.fillText(timeStr, x, chartArea.bottom + 4);
            }
            if (dayStr) {
              ctx.fillText(dayStr, x, chartArea.bottom + 18);
            }
          });

          ctx.restore();
        },
      };

      // Hover indicator plugin - red dot at bottom of chart with vertical line
      const hoverIndicatorPlugin = {
        id: "hoverIndicator",
        afterDraw(chart) {
          if (chart._hoverX === null || chart._hoverX === undefined) return;

          const ctx = chart.ctx;
          const chartArea = chart.chartArea;
          const x = chart._hoverX;

          // Ensure x is within chart area
          if (x < chartArea.left || x > chartArea.right) return;

          ctx.save();

          // Get the time for this hover position
          // Use stored hover index if available, otherwise calculate from pixel position
          let hoverTime = null;
          const rawLabels = chart._rawLabels || [];
          const hoverIndex =
            chart._hoverIndex !== undefined && chart._hoverIndex !== null
              ? chart._hoverIndex
              : Math.round(chart.scales.x.getValueForPixel(x));

          if (
            Number.isFinite(hoverIndex) &&
            hoverIndex >= 0 &&
            hoverIndex < rawLabels.length
          ) {
            hoverTime = new Date(rawLabels[hoverIndex]);
          }

          // Draw thin vertical red line from bottom to top of chart area
          ctx.strokeStyle = "#ef4444"; // red-500
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();

          // Draw red dot at bottom of chart
          ctx.fillStyle = "#ef4444"; // red-500
          ctx.beginPath();
          ctx.arc(x, chartArea.bottom, 4, 0, Math.PI * 2);
          ctx.fill();

          // Draw time label above the line in red
          if (hoverTime) {
            ctx.fillStyle = "#ef4444"; // red-500
            ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "bottom";
            const timeStr = fmtHM(hoverTime);
            // Position label above chart area with some margin
            const labelY = chartArea.top - 8;
            ctx.fillText(timeStr, x, labelY);
          }

          ctx.restore();
        },
      };

      // Vertical line for current time in same green as the clock
      const currentLine = {
        id: "currentLine",
        afterDatasetsDraw(chart) {
          const nowIdx = chart._nowIdx;
          if (nowIdx === -1 || nowIdx === undefined) return;
          const { ctx, chartArea, scales } = chart;
          const x = scales.x.getPixelForValue(nowIdx);
          const timeColor =
            (els.nowTime && getComputedStyle(els.nowTime).color) || "#22c55e";
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.lineWidth = 2;
          ctx.strokeStyle = timeColor;
          ctx.setLineDash([5, 5]);
          ctx.stroke();

          // Draw green dot at bottom of chart
          ctx.fillStyle = timeColor;
          ctx.beginPath();
          ctx.arc(x, chartArea.bottom, 4, 0, Math.PI * 2);
          ctx.fill();

          // Draw current time label above the line in green
          // Use actual current time, not the data point time
          const actualCurrentTime = new Date();
          ctx.fillStyle = timeColor;
          ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const timeStr = fmtHM(actualCurrentTime);
          // Position label above chart area with some margin
          const labelY = chartArea.top - 8;
          ctx.fillText(timeStr, x, labelY);

          ctx.restore();
        },
      };

      // ☀️ markers over the Sun Vibe line
      const sunMarkerPlugin = {
        id: "sunMarkers",
        afterDatasetsDraw(chart) {
          if (!sunMarkersEnabled) return; // Don't draw if disabled
          const { ctx, scales, chartArea } = chart;
          const sunDsIndex = chart.data.datasets.findIndex(
            (d) => d.label === "Sun Vibe"
          );
          if (sunDsIndex === -1) return;
          const sunData = chart.data.datasets[sunDsIndex].data; // display units

          // Helper to get exact pixel position for a Date (same as in day/night shading)
          function getPixelForExactTime(targetTime) {
            const target = new Date(targetTime);
            // Find the two nearest hour indices
            let beforeIdx = -1;
            let afterIdx = -1;
            let beforeTime = null;
            let afterTime = null;

            for (let i = 0; i < labels.length; i++) {
              const labelTime = new Date(labels[i]);
              if (labelTime <= target) {
                beforeIdx = i;
                beforeTime = labelTime;
              }
              if (labelTime >= target && afterIdx === -1) {
                afterIdx = i;
                afterTime = labelTime;
                break;
              }
            }

            // If exact match or at boundaries
            if (beforeIdx === afterIdx) {
              return scales.x.getPixelForValue(
                beforeIdx >= 0 ? beforeIdx : afterIdx
              );
            }

            // If before first label
            if (beforeIdx === -1) {
              return scales.x.getPixelForValue(0);
            }

            // If after last label
            if (afterIdx === -1) {
              return scales.x.getPixelForValue(labels.length - 1);
            }

            // Interpolate between the two hour positions
            const beforePixel = scales.x.getPixelForValue(beforeIdx);
            const afterPixel = scales.x.getPixelForValue(afterIdx);
            const timeDiff = afterTime - beforeTime;
            const targetDiff = target - beforeTime;
            const fraction = timeDiff > 0 ? targetDiff / timeDiff : 0;

            return beforePixel + (afterPixel - beforePixel) * fraction;
          }

          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";

          markers.forEach((m) => {
            // Get exact x position for the sunrise/sunset time
            const x = getPixelForExactTime(m.time);

            // Only draw if within chart area
            if (x < chartArea.left || x > chartArea.right) return;

            // Find the two nearest data points to interpolate y position
            let beforeIdx = -1;
            let afterIdx = -1;
            let beforeTime = null;
            let afterTime = null;

            for (let i = 0; i < labels.length; i++) {
              const labelTime = new Date(labels[i]);
              if (labelTime <= m.time) {
                beforeIdx = i;
                beforeTime = labelTime;
              }
              if (labelTime >= m.time && afterIdx === -1) {
                afterIdx = i;
                afterTime = labelTime;
                break;
              }
            }

            let ySun;
            if (
              beforeIdx === afterIdx &&
              beforeIdx >= 0 &&
              beforeIdx < sunData.length
            ) {
              // Exact match
              ySun = scales.y.getPixelForValue(sunData[beforeIdx]);
            } else if (
              beforeIdx >= 0 &&
              afterIdx >= 0 &&
              beforeIdx < sunData.length &&
              afterIdx < sunData.length
            ) {
              // Interpolate between two points
              const beforeY = scales.y.getPixelForValue(sunData[beforeIdx]);
              const afterY = scales.y.getPixelForValue(sunData[afterIdx]);
              const timeDiff = afterTime - beforeTime;
              const targetDiff = m.time - beforeTime;
              const fraction = timeDiff > 0 ? targetDiff / timeDiff : 0;
              ySun = beforeY + (afterY - beforeY) * fraction;
            } else if (beforeIdx >= 0 && beforeIdx < sunData.length) {
              // Use before point
              ySun = scales.y.getPixelForValue(sunData[beforeIdx]);
            } else if (afterIdx >= 0 && afterIdx < sunData.length) {
              // Use after point
              ySun = scales.y.getPixelForValue(sunData[afterIdx]);
            } else {
              return; // Can't determine position
            }

            ctx.fillText(m.emoji, x, ySun - 8);
          });

          ctx.restore();
        },
      };

      // Touch Grass marker plugin - shows ideal temperature time per day
      const touchGrassPlugin = {
        id: "touchGrass",
        afterDatasetsDraw(chart) {
          const touchGrassTimes = chart._touchGrassTimes || [];
          if (touchGrassTimes.length === 0) return;

          const { ctx, scales, chartArea } = chart;
          const sunDsIndex = chart.data.datasets.findIndex(
            (d) => d.label === "Sun Vibe"
          );
          if (sunDsIndex === -1) return;
          const sunData = chart.data.datasets[sunDsIndex].data;

          // Store positions for hover detection
          const positions = [];

          ctx.save();
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";

          touchGrassTimes.forEach((tgTime) => {
            // Get x position for the time
            const x = scales.x.getPixelForValue(tgTime.index);

            // Only draw if within chart area
            if (x < chartArea.left || x > chartArea.right) return;

            // Get y position on sun vibe line
            const ySun = scales.y.getPixelForValue(sunData[tgTime.index]);

            // Store position for hover detection
            positions.push({
              x,
              y: ySun,
              time: tgTime.time,
              temp: tgTime.temp,
              index: tgTime.index,
            });

            // Draw leaf icon
            ctx.fillText("🍃", x, ySun - 8);
          });

          chart._touchGrassPositions = positions;
          ctx.restore();
        },
      };

      // Wind chill indicator plugin - shows when wind significantly affects feel
      const windChillPlugin = {
        id: "windChill",
        afterDatasetsDraw(chart) {
          if (!windIconsEnabled) return; // Don't draw if disabled
          if (!timelineState || !timelineState.windByHour) return;
          const { ctx, chartArea, scales } = chart;
          const { labels, shadeVals, windByHour } = timelineState;

          ctx.save();
          ctx.strokeStyle = "rgba(100, 150, 255, 0.4)";
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);

          // Draw wind indicators where wind speed > 15 mph (significant impact)
          for (let i = 0; i < labels.length; i++) {
            if (windByHour[i] > 15) {
              const x = scales.x.getPixelForValue(i);
              if (x < chartArea.left || x > chartArea.right) continue;
              const y = scales.y.getPixelForValue(shadeVals[i]);
              ctx.beginPath();
              ctx.moveTo(x, chartArea.top);
              ctx.lineTo(x, y);
              ctx.stroke();
              // Add wind icon
              ctx.fillStyle = "rgba(100, 150, 255, 0.6)";
              ctx.font = "12px system-ui";
              ctx.textAlign = "center";
              ctx.fillText("\u{1F4A8}", x, chartArea.top - 8); // 💨
            }
          }
          ctx.restore();
        },
      };

      // Rain/Snow/Ice icons plugin - shows weather condition icons at hourly boundaries only
      const precipitationIconsPlugin = {
        id: "precipitationIcons",
        afterDatasetsDraw(chart) {
          if (!timelineState) return;
          const { ctx, chartArea, scales } = chart;
          const rawLabels = chart._rawLabels || [];
          const { labels, shadeVals, precipitationByHour, weathercodeByHour } =
            timelineState;

          // Helper function to determine weather condition
          const getWeatherCondition = (tempF, precip, wmo, index) => {
            // WMO weather codes: https://open-meteo.com/en/docs
            // Rain codes: 51-67, 80-82
            // Snow codes: 71-77, 85-86
            // Freezing rain: 56, 57, 66, 67

            if (precip > 0) {
              // Check WMO code first for accuracy
              if (wmo >= 51 && wmo <= 67) {
                // Rain or freezing rain
                if (wmo === 56 || wmo === 57 || wmo === 66 || wmo === 67) {
                  return "freezing_rain"; // Could be ice
                }
                if (tempF < 32) {
                  return "snow"; // Freezing rain becomes snow
                }
                return "rain";
              } else if (wmo >= 71 && wmo <= 77) {
                return "snow";
              } else if (wmo >= 80 && wmo <= 82) {
                return "rain";
              } else if (wmo >= 85 && wmo <= 86) {
                return "snow";
              }

              // Fallback to temperature-based logic
              if (tempF < 32) {
                return "snow";
              } else if (tempF < 50) {
                return "ice"; // Freezing conditions
              } else {
                return "rain";
              }
            }
            return null;
          };

          ctx.save();
          ctx.font = "14px system-ui";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";

          // Only process points at hourly boundaries (minutes === 0)
          for (let i = 0; i < rawLabels.length; i++) {
            const label = rawLabels[i];
            const date = new Date(label);
            const minutes = zp(date).minute;

            // Skip non-hourly points
            if (minutes !== 0) continue;

            // Check if icons are enabled and conditions are met
            const tempF = shadeVals[i];
            const precip = precipitationByHour?.[i] ?? 0;
            const wmo = weathercodeByHour?.[i] ?? 0;
            const condition = getWeatherCondition(tempF, precip, wmo, i);

            if (!condition) continue;

            // Check if the appropriate icon toggle is enabled
            let icon = null;
            if (condition === "rain" && rainIconsEnabled && precip > 0) {
              icon = "\u{1F327}\u{FE0F}"; // 🌧️
            } else if (condition === "snow" && snowIconsEnabled && precip > 0) {
              icon = "\u{2744}\u{FE0F}"; // ❄️
            } else if (condition === "ice" && iceIconsEnabled && tempF < 50) {
              icon = "\u{1F9CA}"; // 🧊
            } else if (condition === "freezing_rain" && iceIconsEnabled) {
              icon = "\u{1F9CA}"; // 🧊
            }

            if (!icon) continue;

            const x = scales.x.getPixelForValue(i);
            if (x < chartArea.left || x > chartArea.right) continue;

            // Position icon above the chart area
            const y = chartArea.top - 10;

            ctx.fillStyle = "rgba(100, 150, 255, 0.8)";
            ctx.fillText(icon, x, y);
          }

          ctx.restore();
        },
      };

      // Temperature zones plugin - color-coded comfort zones
      const temperatureZonesPlugin = {
        id: "temperatureZones",
        beforeDatasetsDraw(chart) {
          if (!temperatureZonesEnabled) return;
          const { ctx, chartArea, scales } = chart;
          const yScale = scales.y;

          // Define comfort zones in user's unit (convert thresholds if needed)
          const getZones = () => {
            if (unit === "F") {
              return [
                {
                  min: -Infinity,
                  max: 32,
                  color: "rgba(100, 150, 255, 0.25)",
                  label: "Very Cold",
                },
                {
                  min: 32,
                  max: 50,
                  color: "rgba(150, 200, 255, 0.25)",
                  label: "Cold",
                },
                {
                  min: 50,
                  max: 65,
                  color: "rgba(200, 220, 255, 0.25)",
                  label: "Cool",
                },
                {
                  min: 65,
                  max: 75,
                  color: "rgba(100, 255, 150, 0.25)",
                  label: "Comfortable",
                },
                {
                  min: 75,
                  max: 85,
                  color: "rgba(255, 220, 100, 0.25)",
                  label: "Warm",
                },
                {
                  min: 85,
                  max: 95,
                  color: "rgba(255, 180, 100, 0.25)",
                  label: "Hot",
                },
                {
                  min: 95,
                  max: Infinity,
                  color: "rgba(255, 100, 100, 0.25)",
                  label: "Very Hot",
                },
              ];
            } else {
              // Celsius zones
              return [
                {
                  min: -Infinity,
                  max: 0,
                  color: "rgba(100, 150, 255, 0.25)",
                  label: "Very Cold",
                },
                {
                  min: 0,
                  max: 10,
                  color: "rgba(150, 200, 255, 0.25)",
                  label: "Cold",
                },
                {
                  min: 10,
                  max: 18,
                  color: "rgba(200, 220, 255, 0.25)",
                  label: "Cool",
                },
                {
                  min: 18,
                  max: 24,
                  color: "rgba(100, 255, 150, 0.25)",
                  label: "Comfortable",
                },
                {
                  min: 24,
                  max: 29,
                  color: "rgba(255, 220, 100, 0.25)",
                  label: "Warm",
                },
                {
                  min: 29,
                  max: 35,
                  color: "rgba(255, 180, 100, 0.25)",
                  label: "Hot",
                },
                {
                  min: 35,
                  max: Infinity,
                  color: "rgba(255, 100, 100, 0.25)",
                  label: "Very Hot",
                },
              ];
            }
          };

          const zones = getZones();
          ctx.save();

          zones.forEach((zone) => {
            const yMin = yScale.getPixelForValue(zone.max);
            const yMax = yScale.getPixelForValue(zone.min);

            if (yMax < chartArea.top || yMin > chartArea.bottom) return;

            ctx.fillStyle = zone.color;
            ctx.fillRect(
              chartArea.left,
              Math.max(yMin, chartArea.top),
              chartArea.right - chartArea.left,
              Math.min(yMax, chartArea.bottom) - Math.max(yMin, chartArea.top)
            );
          });

          ctx.restore();
        },
      };

      // Humidity impact visualization plugin
      const humidityPlugin = {
        id: "humidity",
        beforeDatasetsDraw(chart) {
          if (!humidityVisualizationEnabled) return;
          if (!timelineState || !timelineState.humidityByHour) return;
          const { ctx, chartArea, scales } = chart;
          const { labels, humidityByHour } = timelineState;

          ctx.save();

          // Draw humidity impact as background gradient
          // High humidity (>70%) makes it feel warmer, low humidity (<30%) makes it feel cooler
          for (let i = 0; i < labels.length - 1; i++) {
            const x1 = scales.x.getPixelForValue(i);
            const x2 = scales.x.getPixelForValue(i + 1);
            if (x2 < chartArea.left || x1 > chartArea.right) continue;

            const humidity = humidityByHour[i];
            let alpha = 0;
            let color = "";

            if (humidity > 70) {
              // High humidity - warmer feel (red tint)
              alpha = Math.min(((humidity - 70) / 30) * 0.15, 0.15);
              color = `rgba(255, 100, 100, ${alpha})`;
            } else if (humidity < 30) {
              // Low humidity - cooler feel (blue tint)
              alpha = Math.min(((30 - humidity) / 30) * 0.15, 0.15);
              color = `rgba(100, 150, 255, ${alpha})`;
            }

            if (alpha > 0) {
              ctx.fillStyle = color;
              ctx.fillRect(
                Math.max(x1, chartArea.left),
                chartArea.top,
                Math.min(x2, chartArea.right) - Math.max(x1, chartArea.left),
                chartArea.bottom - chartArea.top
              );
            }
          }
          ctx.restore();
        },
      };

      // Highlight dataset removed - visual highlight is handled by selectionHighlightPlugin only

      // Use chart colors from global scope (already loaded from localStorage)

      const datasets = [
        {
          label: "Sun Vibe",
          data: sunVals,
          showLine: false, // Completely disable Chart.js line drawing - our plugin will draw it
          borderWidth: 0, // Hide default border, gradient plugin will draw it
          borderColor: "transparent",
          backgroundColor: "transparent", // Hide default fill, gradient plugin will draw it
          pointRadius: 0,
          tension: 0.4,
          fill: false, // Disable default fill
        },
        {
          label: "Shade Vibe",
          data: shadeVals,
          showLine: false, // Completely disable Chart.js line drawing - our plugin will draw it
          borderWidth: 0, // Hide default border, gradient plugin will draw it
          borderColor: "transparent",
          backgroundColor: "transparent", // Hide default fill, gradient plugin will draw it
          pointRadius: 0,
          tension: 0.4,
          fill: false, // Disable default fill
        },
      ];
      // Gradient plugin for smooth gradient fills
      const gradientFillPlugin = {
        id: "gradientFill",
        afterDatasetsDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          const datasets = chart.data.datasets;
          const rawLabels = chart._rawLabels || [];
          const sunTimes = chart._sunTimes || { sunrises: [], sunsets: [] };

          // Helper function to get pixel position for exact time (same as day/night shading)
          function getPixelForExactTime(targetTime) {
            const target = new Date(targetTime);
            const labels = rawLabels;
            // Find the two nearest hour indices
            let beforeIdx = -1;
            let afterIdx = -1;
            let beforeTime = null;
            let afterTime = null;

            for (let i = 0; i < labels.length; i++) {
              const labelTime = new Date(labels[i]);
              if (labelTime <= target) {
                beforeIdx = i;
                beforeTime = labelTime;
              }
              if (labelTime >= target && afterIdx === -1) {
                afterIdx = i;
                afterTime = labelTime;
                break;
              }
            }

            // If exact match or at boundaries
            if (beforeIdx === afterIdx) {
              return scales.x.getPixelForValue(
                beforeIdx >= 0 ? beforeIdx : afterIdx
              );
            }

            // If before first label
            if (beforeIdx === -1) {
              return scales.x.getPixelForValue(0);
            }

            // If after last label
            if (afterIdx === -1) {
              return scales.x.getPixelForValue(labels.length - 1);
            }

            // Interpolate between the two hour positions
            const beforePixel = scales.x.getPixelForValue(beforeIdx);
            const afterPixel = scales.x.getPixelForValue(afterIdx);
            const timeDiff = afterTime - beforeTime;
            const targetDiff = target - beforeTime;
            const fraction = timeDiff > 0 ? targetDiff / timeDiff : 0;

            return beforePixel + (afterPixel - beforePixel) * fraction;
          }

          // Each line's points: every plotted point, plus split points at
          // sunrise and sunset.
          function drawPointsFor(points) {
            const drawPoints = [];

            // Get all sunrise/sunset events
            const allEvents = [
              ...sunTimes.sunsets.map((t) => new Date(t).getTime()),
              ...sunTimes.sunrises.map((t) => new Date(t).getTime()),
            ].sort((a, b) => a - b);

            for (let i = 0; i < points.length; i++) {
              const point = points[i];
              const timeMs = new Date(rawLabels[i]).getTime();
              drawPoints.push({ x: point.x, y: point.y, time: timeMs });

              if (i < points.length - 1) {
                const nextTimeMs = new Date(rawLabels[i + 1]).getTime();
                // Add split points for each event between this and the next
                for (const eventTime of allEvents) {
                  if (eventTime <= timeMs || eventTime >= nextTimeMs) continue;
                  const nextPoint = points[i + 1];
                  const t = (eventTime - timeMs) / (nextTimeMs - timeMs);
                  drawPoints.push({
                    x: getPixelForExactTime(new Date(eventTime)),
                    // Linear interpolation for y value between current and next point
                    y: point.y + (nextPoint.y - point.y) * t,
                    time: eventTime,
                  });
                }
              }
            }

            // Sort by time and drop duplicates (points at the same second)
            drawPoints.sort((a, b) => a.time - b.time);
            const unique = [];
            const seenTimes = new Set();
            for (const dp of drawPoints) {
              const timeKey = Math.floor(dp.time / 1000);
              if (!seenTimes.has(timeKey)) {
                seenTimes.add(timeKey);
                unique.push(dp);
              }
            }
            return unique;
          }

          const lines = [];
          datasets.forEach((dataset, datasetIndex) => {
            if (
              dataset.label !== "Sun Vibe" &&
              dataset.label !== "Shade Vibe"
            )
              return;
            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta || !meta.data || meta.data.length === 0) return;
            const pts = drawPointsFor(meta.data);
            lines.push({
              label: dataset.label,
              color:
                dataset.label === "Sun Vibe"
                  ? chartColors.sun.start
                  : chartColors.shade.start,
              pts,
              slopes: MonotoneCurve.slopes(pts),
            });
          });

          // Where the two lines meet (all night, and any hour with no sun),
          // they share a slope, so the sun line never dips under the shade
          // line between points.
          const sunLine = lines.find((l) => l.label === "Sun Vibe");
          const shadeLine = lines.find((l) => l.label === "Shade Vibe");
          if (sunLine && shadeLine) {
            MonotoneCurve.shareSlopesWhereEqual(
              sunLine.pts,
              sunLine.slopes,
              shadeLine.pts,
              shadeLine.slopes,
              0.01
            );
          }

          lines.forEach(({ color, pts, slopes }) => {
            ctx.save();
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            ctx.lineCap = "round";
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            if (pts.length === 1) ctx.lineTo(pts[0].x, pts[0].y);
            for (let i = 0; i < pts.length - 1; i++) {
              const p1 = pts[i];
              const p2 = pts[i + 1];
              const dx = p2.x - p1.x;
              if (lineSmoothing > 0 && dx > 0) {
                // Monotone cubic (curve.js), its Bezier handles a third of
                // the way along on each point's slope, blended toward a
                // straight line by the "Line smoothing" setting. Either way
                // it stays between the two points' values.
                const [m1, m2] = MonotoneCurve.segmentSlopes(
                  pts,
                  slopes,
                  i,
                  lineSmoothing
                );
                const third = dx / 3;
                ctx.bezierCurveTo(
                  p1.x + third,
                  p1.y + m1 * third,
                  p2.x - third,
                  p2.y - m2 * third,
                  p2.x,
                  p2.y
                );
              } else {
                ctx.lineTo(p2.x, p2.y);
              }
            }
            ctx.stroke();
            ctx.restore();
          });
        },
      };
      // Show canvas so Chart.js can render, but keep skeleton visible until animation completes
      if (els.chartCanvas) els.chartCanvas.style.display = "block";

      vibeChart = new Chart(ctx, {
        type: "line",
        data: {
          labels: displayLabels,
          datasets: datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "x", intersect: false },
          animation: false,
          animations: {
            x: false,
            y: false,
            colors: false,
            numbers: false,
          },
          layout: {
            padding: {
              top: 20, // Extra space for time labels above lines
              bottom: 40, // Extra space for two-line labels
            },
          },
          scales: {
            x: {
              ticks: {
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 20,
                callback: function (value, index) {
                  // Return empty string to hide default labels (we'll draw custom ones)
                  return "";
                },
              },
              grid: {
                drawOnChartArea: true,
              },
            },
            y: {
              ticks: {
                callback: (val) =>
                  `${typeof val === "number" ? val : Number(val)}°`,
              },
              suggestedMin: Math.min(...shadeVals, ...sunVals) - 3,
              suggestedMax: Math.max(...shadeVals, ...sunVals) + 3,
            },
          },
          plugins: {
            legend: {
              display: true,
              labels: {
                usePointStyle: true,
                pointStyle: "rectRounded",
                boxWidth: 14,
                boxHeight: 8,
                filter: (item) => {
                  // Hide Sun Vibe and Shade Vibe from legend
                  return item.text !== "Sun Vibe" && item.text !== "Shade Vibe";
                },
              },
            },
            // The readout (renderReadout) replaces Chart.js's tooltip.
            tooltip: { enabled: false },
          },
        },
        plugins: [
          temperatureZonesPlugin,
          humidityPlugin,
          gradientFillPlugin,
          dayNightShadingPlugin,
          selectionHighlightPlugin,
          currentLine,
          sunMarkerPlugin,
          touchGrassPlugin,
          windChillPlugin,
          precipitationIconsPlugin,
          timelineLabelsPlugin,
          hoverIndicatorPlugin,
        ],
      });

      // Store raw labels and other data on chart instance for plugins and optimization
      vibeChart._rawLabels = labels;
      vibeChart._markers = markers;
      vibeChart._nowIdx = nowIdx;
      vibeChart._isDayByHour = isDayByHour;
      vibeChart._sunTimes = sunTimes; // Store sunrise/sunset times for exact day/night detection
      vibeChart._touchGrassTimes = touchGrassTimes; // Store Touch Grass times for plugin
      // The constructor's first draw ran before these existed (animation is
      // off, so it draws at once): draw again with them.
      vibeChart.update("none");

      // Hide skeleton immediately after chart is created
      hideChartLoading();

      // Update card visibility based on current time
      updateCardVisibility();

      // Pointer, keyboard and the readout are wired once (below); refresh an
      // open readout for the new data.
      wireChartPointer();
      refreshReadout();
    }


    // ── The chart's readout: pointer, keyboard, and the details box ──
    // Hover with a mouse, or tap, to see a point's details (the card below
    // follows too); the arrow keys move through the points. A sideways drag
    // selects a time range, which is shared as before (Bryan, 2026-09-25).
    const readoutEl = $("#chartReadout");
    const readoutLiveEl = $("#chartReadoutLive");
    let readoutIndex = null; // the point the readout shows
    let readoutPinned = false; // opened by a tap or the keyboard

    // "2pm", "2:15pm" in the place's zone
    function fmtClock(d) {
      const { hour, minute } = zp(d);
      const h12 = hour % 12 || 12;
      const mm = minute ? `:${String(minute).padStart(2, "0")}` : "";
      return `${h12}${mm}${hour < 12 ? "am" : "pm"}`;
    }

    // "Now (10:20am)", "3pm today", "7am tomorrow", "11pm yesterday", "10am Saturday"
    function whenWords(t, stepMs) {
      const now = new Date();
      if (t <= now && now < t.getTime() + stepMs) return `Now (${fmtClock(now)})`;
      const days = PlaceTime.daysBetween(now, t, placeZone);
      const day =
        days === 0
          ? "today"
          : days === 1
          ? "tomorrow"
          : days === -1
          ? "yesterday"
          : t.toLocaleDateString("en-US", inZone({ weekday: "long" }));
      return `${fmtClock(t)} ${day}`;
    }

    // An event is named on the points within an hour of it, judged at the
    // minute it prints (a 7:00:04pm sunset prints "7pm").
    const HOUR_MS = 3600000;
    const nearEvent = (t, eventTime) => {
      const printed = Math.floor(new Date(eventTime).getTime() / 60000) * 60000;
      return Math.abs(t.getTime() - printed) < HOUR_MS;
    };

    // Everything the readout says about point i, as words.
    function readoutFor(i) {
      const s = timelineState;
      if (!s || i == null || i < 0 || i >= s.labels.length) return null;
      const t = s.labels[i];
      const stepMs =
        s.labels.length > 1 ? s.labels[1].getTime() - s.labels[0].getTime() : HOUR_MS;
      const temp = (f) =>
        Number.isFinite(f) ? `${formatTemp(f)}${unitSuffix()}` : null;
      const isDay = s.isDayByHour[i] === 1;
      const airF = s.airTempByHour?.[i];
      const rh = s.humidityByHour?.[i];
      const wind = s.windByHour?.[i];
      const pop = s.popByHour?.[i];
      const hi = VibeWeather.heatIndexOrNull(airF, rh);
      const facts = [
        ["Air", temp(airF)],
        [
          "Heat index",
          hi !== null && hi >= VibeWeather.HEAT_INDEX_CAUTION_F ? temp(hi) : null,
        ],
        ["Humidity", Number.isFinite(rh) ? `${Math.round(rh)}%` : null],
        ["Wind", Number.isFinite(wind) ? `${Math.round(wind)} mph` : null],
        ["Rain", Number.isFinite(pop) ? `${Math.round(pop)}%` : null],
      ].filter(([, v]) => v);
      const marks = [];
      for (const [kind, list] of [
        ["Sunrise", sunTimes.sunrises || []],
        ["Sunset", sunTimes.sunsets || []],
      ]) {
        for (const e of list) {
          if (e && nearEvent(t, e)) marks.push({ kind: "sun", text: `${kind} ${fmtClock(new Date(e))}` });
        }
      }
      for (const tg of (vibeChart && vibeChart._touchGrassTimes) || []) {
        if (nearEvent(t, tg.time))
          marks.push({ kind: "leaf", text: `Touch grass: ${fmtClock(new Date(tg.time))}` });
      }
      return {
        when: whenWords(t, stepMs),
        sun: temp(s.sunVals[i]),
        shade: temp(s.shadeVals[i]),
        words: combinedVibeDescriptor(
          s.shadeVals[i],
          s.sunVals[i],
          s.solarByHour[i],
          isDay,
          t
        ),
        facts,
        sky: VibeWeather.conditionLabel(s.weathercodeByHour?.[i], isDay),
        marks,
      };
    }

    function readoutSentence(r) {
      return [
        `${r.when}.`,
        r.sun === r.shade
          ? `In the sun or the shade, ${r.shade}.`
          : `In the sun ${r.sun}, in the shade ${r.shade}.`,
        r.facts.length
          ? `${r.facts.map(([k, v], n) => `${n ? k.toLowerCase() : k} ${v}`).join(", ")}.`
          : "",
        r.sky ? `${r.sky}.` : "",
        ...r.marks.map((m) => `${m.text}.`),
      ]
        .filter(Boolean)
        .join(" ");
    }

    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    }

    function renderReadout(i, { speak = false } = {}) {
      if (!readoutEl || !vibeChart) return;
      const r = readoutFor(i);
      if (!r) return hideReadout();
      readoutIndex = i;
      const nodes = [el("p", "readout-when", r.when)];
      if (r.sun === r.shade) {
        const one = el("p", "readout-one");
        one.append(el("span", "readout-label", "In the sun or the shade "), el("strong", "", r.shade));
        nodes.push(one);
      } else {
        const chips = el("div", "readout-chips");
        for (const [kind, label, value, color] of [
          ["sun", "In the sun", r.sun, chartColors.sun.start],
          ["shade", "In the shade", r.shade, chartColors.shade.start],
        ]) {
          // The line's own colour (set in Advanced), for the border and,
          // on the dark theme, the number.
          const chip = el("div", `readout-chip readout-chip--${kind}`);
          chip.style.setProperty("--chip-color", color);
          chip.append(
            el("span", "readout-label", label),
            el("strong", "readout-chip-value", value)
          );
          chips.append(chip);
        }
        nodes.push(chips);
      }
      if (r.words) nodes.push(el("p", "readout-words", r.words));
      if (r.facts.length)
        nodes.push(el("p", "readout-facts", r.facts.map(([k, v]) => `${k} ${v}`).join(" · ")));
      if (r.sky) nodes.push(el("p", "readout-facts", r.sky));
      for (const m of r.marks) {
        nodes.push(
          el("p", `readout-mark readout-mark--${m.kind}`, `${m.kind === "leaf" ? "\u{1F343}" : "\u{2600}\u{FE0F}"} ${m.text}`)
        );
      }
      readoutEl.replaceChildren(...nodes);
      readoutEl.hidden = false;

      // Across: centred on the point, kept inside the chart box.
      const box = readoutEl.parentElement.getBoundingClientRect();
      const x = vibeChart.scales.x.getPixelForValue(i);
      const w = readoutEl.offsetWidth;
      readoutEl.style.left = `${Math.max(0, Math.min(box.width - w, x - w / 2))}px`;
      // Up and down: above the chart, or below it when the top of the
      // screen is too close.
      readoutEl.classList.toggle("chart-readout--below", box.top < readoutEl.offsetHeight + 16);

      if (speak && readoutLiveEl) readoutLiveEl.textContent = readoutSentence(r);
    }

    function hideReadout() {
      readoutIndex = null;
      readoutPinned = false;
      if (readoutEl) readoutEl.hidden = true;
      if (readoutLiveEl) readoutLiveEl.textContent = "";
      if (vibeChart) {
        vibeChart._hoverX = null;
        vibeChart._hoverIndex = null;
        vibeChart.draw();
      }
      if (simActive) paintRealtimeCards();
      simActive = false;
    }

    // After the data changes, an open readout shows the new numbers.
    function refreshReadout() {
      if (readoutIndex === null || !timelineState) return;
      if (readoutIndex >= timelineState.labels.length) return hideReadout();
      renderReadout(readoutIndex);
    }

    // Point i under the guide line, in the card, and in the readout.
    function showPoint(i, options) {
      if (!vibeChart || !timelineState) return;
      vibeChart._hoverX = vibeChart.scales.x.getPixelForValue(i);
      vibeChart._hoverIndex = i;
      simActive = true;
      paintSimulatedIndex(i);
      vibeChart.draw();
      renderReadout(i, options);
    }

    // The point now falls on: the last one at or before now.
    function nowPointIndex() {
      const labels = timelineState ? timelineState.labels : [];
      const now = Date.now();
      let i = 0;
      while (i < labels.length - 1 && labels[i + 1].getTime() <= now) i++;
      return i;
    }

    function pointIndexAt(clientX) {
      if (!vibeChart || !timelineState) return null;
      const rect = els.chartCanvas.getBoundingClientRect();
      const { left, right } = vibeChart.chartArea;
      const x = Math.min(right, Math.max(left, clientX - rect.left));
      const i = Math.round(vibeChart.scales.x.getValueForPixel(x));
      return Number.isFinite(i)
        ? Math.min(timelineState.labels.length - 1, Math.max(0, i))
        : null;
    }

    // The time under clientX, held to the plot's ends, so a drag released
    // past an edge still ends at that edge.
    function timeAtClientX(clientX) {
      if (!vibeChart || !timelineState) return null;
      const rect = els.chartCanvas.getBoundingClientRect();
      const { left, right } = vibeChart.chartArea;
      const x = Math.min(right, Math.max(left, clientX - rect.left));
      return pixelToTime(x, timelineState.labels, vibeChart.scales);
    }

    // Near a touch-grass leaf, the card names it (as it always has).
    function paintLeafCardIfNear(clientX, clientY) {
      const rect = els.chartCanvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      for (const pos of vibeChart._touchGrassPositions || []) {
        if (Math.hypot(x - pos.x, y - pos.y) >= 20) continue;
        const tempStr = `${formatUserTemp(pos.temp)}${unitSuffix()}`;
        if (els.combinedLabel)
          els.combinedLabel.textContent = `\u{1F343} Touch Grass - ${fmtHM(pos.time)} - ${tempStr}`;
        if (els.combinedTemp) els.combinedTemp.textContent = tempStr;
        if (els.combinedTempWrapper) els.combinedTempWrapper.style.display = "flex";
        if (els.sunTempWrapper) els.sunTempWrapper.style.display = "none";
        if (els.shadeTempWrapper) els.shadeTempWrapper.style.display = "none";
        els.sunTempWrapper?.parentElement?.classList.add("sun-hidden");
        return;
      }
    }

    // A finished drag: select the range and share it.
    function finishSelection(startTime, endTime) {
      const from = startTime < endTime ? startTime : endTime;
      const to = startTime < endTime ? endTime : startTime;
      // Only create selection if it's meaningful (at least 5 minutes)
      if (to - from < 5 * 60 * 1000) {
        clearHighlight();
        return;
      }
      selectionRange = { startTime: from, endTime: to };
      isSelectingActive = false; // Selection is now finalized
      updateCardVisibility(); // Now hide the cards
      vibeChart.update("none");

      // Copy URL to clipboard and update browser URL
      const url = generateShareURL(from, to);
      const urlObj = new URL(url);
      history.pushState({}, "", urlObj.pathname + urlObj.search);
      copyToClipboard(url).then((success) => {
        if (success) {
          showNotification(
            "Link copied to clipboard! Share this URL to show this time range.",
            "success"
          );
        } else {
          showNotification("Failed to copy to clipboard. URL: " + url, "error", 5000);
        }
      });

      // Generate weather summary
      updateWeatherSummary();
    }

    let chartPointerWired = false;
    function wireChartPointer() {
      if (chartPointerWired || !els.chartCanvas) return;
      chartPointerWired = true;
      const canvas = els.chartCanvas;
      // Vertical swipes scroll the page and two fingers zoom; a tap or a
      // sideways drag reaches the chart.
      canvas.style.touchAction = "pan-y pinch-zoom";
      let drag = null; // { x, id, startTime, selecting, previous }

      canvas.addEventListener("pointerdown", (e) => {
        if (!vibeChart || !timelineState || e.button > 0) return;
        drag = {
          x: e.clientX,
          id: e.pointerId,
          startTime: timeAtClientX(e.clientX),
          selecting: false,
          previous: selectionRange,
        };
        // Capture now, so the release reaches the chart wherever it happens.
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {}
      });

      // A press that ended without a release here (a context menu, a lost
      // capture) must not turn the next hover into a drag.
      const dropDrag = () => {
        if (drag && drag.selecting) {
          selectionRange = drag.previous;
          isSelectingActive = false;
          vibeChart && vibeChart.update("none");
        }
        drag = null;
      };

      canvas.addEventListener("pointermove", (e) => {
        if (!vibeChart || !timelineState) return;
        if (drag && e.pointerType === "mouse" && e.buttons === 0) dropDrag();
        if (drag && drag.id === e.pointerId) {
          if (!drag.selecting && drag.startTime && Math.abs(e.clientX - drag.x) > 5) {
            drag.selecting = true;
            isSelectingActive = true;
            hideReadout();
          }
          if (drag.selecting) {
            const now = timeAtClientX(e.clientX);
            if (now) {
              selectionRange = {
                startTime: now < drag.startTime ? now : drag.startTime,
                endTime: now < drag.startTime ? drag.startTime : now,
              };
              vibeChart.update("none");
            }
          }
          return;
        }
        if (e.pointerType === "mouse" && !readoutPinned) {
          const i = pointIndexAt(e.clientX);
          if (i !== null) {
            showPoint(i);
            paintLeafCardIfNear(e.clientX, e.clientY);
          }
        }
      });

      canvas.addEventListener("pointerup", (e) => {
        if (!drag || drag.id !== e.pointerId) return;
        const d = drag;
        drag = null;
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {}
        if (d.selecting) {
          isSelectingActive = false;
          const end = timeAtClientX(e.clientX);
          if (end) finishSelection(d.startTime, end);
          return;
        }
        // A tap or a click: show that point, and keep it open after a
        // finger lifts.
        const i = pointIndexAt(e.clientX);
        if (i === null) return;
        showPoint(i);
        paintLeafCardIfNear(e.clientX, e.clientY);
        readoutPinned = e.pointerType !== "mouse";
      });

      // The browser took the gesture (a scroll): drop an unfinished drag.
      canvas.addEventListener("pointercancel", dropDrag);
      canvas.addEventListener("lostpointercapture", (e) => {
        if (drag && drag.id === e.pointerId) dropDrag();
      });

      canvas.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "mouse" && !drag && !readoutPinned) hideReadout();
      });

      // A tap anywhere else closes a readout a tap opened.
      document.addEventListener("pointerdown", (e) => {
        if (readoutPinned && e.target !== canvas && document.activeElement !== canvas)
          hideReadout();
      });

      // Keys: an hour with the arrows (15 minutes with Shift), a day with
      // Page Up and Page Down, Home and End for the ends, Escape to close.
      canvas.addEventListener("keydown", (e) => {
        if (!vibeChart || !timelineState) return;
        const n = timelineState.labels.length;
        const stepMs =
          n > 1 ? timelineState.labels[1].getTime() - timelineState.labels[0].getTime() : HOUR_MS;
        const perHour = Math.max(1, Math.round(HOUR_MS / stepMs));
        const start = readoutIndex ?? nowPointIndex();
        const step = (k) => (readoutIndex === null ? start : Math.min(n - 1, Math.max(0, start + k)));
        let next = null;
        if (e.key === "ArrowRight") next = step(e.shiftKey ? 1 : perHour);
        else if (e.key === "ArrowLeft") next = step(e.shiftKey ? -1 : -perHour);
        else if (e.key === "PageDown") next = step(24 * perHour);
        else if (e.key === "PageUp") next = step(-24 * perHour);
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = n - 1;
        else if (e.key === "Escape" && readoutIndex !== null) {
          e.preventDefault();
          e.stopPropagation(); // don't also clear the selection
          hideReadout();
          return;
        }
        if (next === null) return;
        e.preventDefault();
        showPoint(next, { speak: true });
        readoutPinned = true;
      });

      canvas.addEventListener("focus", () => {
        // Only keyboard focus opens it at now; a click or a tap focuses too.
        if (!canvas.matches(":focus-visible") || !timelineState) return;
        showPoint(nowPointIndex(), { speak: true });
        readoutPinned = true;
      });
      canvas.addEventListener("blur", () => {
        if (readoutPinned) hideReadout();
      });
    }

    // Current time + next sun event
    function chooseNextSunEvent() {
      const now = new Date();
      const { sunriseToday, sunsetToday, sunriseTomorrow, sunsetTomorrow } =
        sunTimes;
      const candidates = [
        sunriseToday,
        sunsetToday,
        sunriseTomorrow,
        sunsetTomorrow,
      ]
        .filter(Boolean)
        .filter((t) => t > now)
        .sort((a, b) => a - b);
      if (!candidates.length) return null;
      const next = candidates[0];
      const isSunrise =
        next === sunTimes.sunriseToday || next === sunTimes.sunriseTomorrow;
      return { next, kind: isSunrise ? "Sunrise" : "Sunset" };
    }

    function paintRealtimeCards() {
      compute();
      updateCardVisibility();
    }

    function paintSimulatedIndex(i) {
      if (!timelineState) return;
      const { labels, shadeVals, sunVals, solarByHour, isDayByHour } =
        timelineState;
      if (i < 0 || i >= labels.length) return;

      const dt = labels[i];
      els.nowTime && (els.nowTime.textContent = fmtHM(dt));

      const isDay = !!isDayByHour[i];
      // Don't change sun card visibility during hover - only update temperature values
      // This prevents layout shifts that cause feedback loops on mobile

      const shadeDisp = toUserTemp(shadeVals[i]);
      const sunDisp = toUserTemp(sunVals[i]);

      // Check if temps are within 2.5°C during daytime
      const shadeC = fToC(shadeVals[i]);
      const sunC = fToC(sunVals[i]);
      const tempDiffC = Math.abs(sunC - shadeC);
      const showCombined = isDay && tempDiffC <= 2.5;

      const cardTemps = els.sunTempWrapper?.parentElement;

      if (showCombined) {
        // Show combined view
        const avgTemp = (shadeVals[i] + sunVals[i]) / 2;
        if (els.combinedTemp) {
          els.combinedTemp.innerHTML = `${formatTemp(avgTemp)}${unitSuffix()}`;
        }
        if (els.combinedTempWrapper) {
          els.combinedTempWrapper.style.display = "flex";
        }
        if (els.sunTempWrapper) {
          els.sunTempWrapper.style.display = "none";
        }
        if (els.shadeTempWrapper) {
          els.shadeTempWrapper.style.display = "none";
        }
        if (cardTemps) {
          cardTemps.classList.add("sun-hidden");
        }
      } else {
        // Show separate views
        els.shade &&
          (els.shade.innerHTML = `${formatTemp(shadeVals[i])}${unitSuffix()}`);
        els.sun &&
          (els.sun.innerHTML = `${formatTemp(sunVals[i])}${unitSuffix()}`);

        if (els.combinedTempWrapper) {
          els.combinedTempWrapper.style.display = "none";
        }
        if (els.shadeTempWrapper) {
          els.shadeTempWrapper.style.display = "flex";
        }

        // Hide sun vibe temperature when sun is not up
        if (els.sunTempWrapper) {
          els.sunTempWrapper.style.display = isDay ? "flex" : "none";
          // Update card layout class
          if (cardTemps) {
            if (isDay) {
              cardTemps.classList.remove("sun-hidden");
            } else {
              cardTemps.classList.add("sun-hidden");
            }
          }
        }
      }

      const simSolar = solarByHour[i];
      if (els.combinedLabel) {
        els.combinedLabel.style.display = "";
        els.combinedLabel.innerHTML = combinedVibeDescriptor(
          shadeVals[i],
          sunVals[i],
          simSolar,
          isDay,
          dt
        );
      }
      // Keep backward compatibility for separate labels
      els.shadeLabel &&
        (els.shadeLabel.innerHTML = vibeDescriptor(shadeVals[i], {
          solar: simSolar,
          isDay,
          context: "shade",
        }));

      if (isDay && els.sunLabel) {
        // During daytime: check if within 2 hours of sunset
        const hoverTimeMs = dt.getTime();
        const twoHoursMs = 2 * 60 * 60 * 1000;
        const nextSunset = (sunTimes.sunsets || [])
          .map((t) => new Date(t).getTime())
          .find((sunsetMs) => sunsetMs > hoverTimeMs);

        if (nextSunset && nextSunset - hoverTimeMs <= twoHoursMs) {
          // Within 2 hours of sunset, show sunset time in temp area and hide description
          els.sun.innerHTML = `\u{1F31E} at ${fmtHMWithSmallAMPM(
            new Date(nextSunset)
          )}`;
          els.sunLabel.style.display = "none";
        } else {
          // Normal descriptor - show description section
          els.sunLabel.style.display = "";
          els.sunLabel.innerHTML = vibeDescriptor(sunVals[i], {
            solar: simSolar,
            isDay,
            context: "sun",
          });
        }
      }
      if (!isDay && els.sunLabel && els.sunLabel.style.display !== "none") {
        // At night, if description is still visible, hide it
        els.sunLabel.style.display = "none";
      }

      // Remove skeleton loading state
      hideCardLoading();
    }

    // Scheduler
    function clearPollTimer() {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
    }
    // Open-Meteo refreshes current conditions every 15 minutes, so polling
    // faster only repeats the same numbers.
    const DEFAULT_UPDATE_MINUTES = 15;
    function scheduleNextTick(minutes) {
      const ms =
        Math.max(0.5, parseFloat(minutes) || DEFAULT_UPDATE_MINUTES) * 60 * 1000;
      nextUpdateAt = new Date(Date.now() + ms);
      els.nextUpdated && (els.nextUpdated.textContent = fmtHMS(nextUpdateAt));
      updateAdvStats();
      // One chain of polls: a new schedule replaces any pending one.
      clearTimeout(pollTimer);
      pollTimer = setTimeout(runUpdateCycle, ms);
    }
    async function runUpdateCycle({ force = false } = {}) {
      // A hidden tab waits; it refreshes when it is shown again.
      if (!lastCoords || (document.hidden && !force)) {
        scheduleNextTick(els.updateInterval?.value || DEFAULT_UPDATE_MINUTES);
        return;
      }

      // Check if current selection has expired (before updating weather)
      if (selectionRange) {
        const now = new Date();
        if (selectionRange.endTime < now) {
          // Selection has expired, show modal
          showExpiredSelectionModal();
        }
      }

      const { latitude, longitude } = lastCoords;

      try {
        const wantHourly = !!els.updateHourlyToggle?.checked;
        // Refetch unless the copy is under a minute old (or always, for
        // Update Now).
        const seq = primeSeq;
        const data = await getForecast(latitude, longitude, {
          maxAgeMs: force ? 0 : 60 * 1000,
        });
        // Another place was chosen while this loaded: leave it be.
        if (seq !== primeSeq) return;
        const cur = data.current;
        const hourlyMaybe = wantHourly ? data.hourly : null;

        applyCurrentConditions(cur);
        compute();
        updateChartTitle();

        if (hourlyMaybe) {
          sunTimes = sunTimesFrom(data.daily, daysAhead);
          // Only show loading if chart doesn't exist yet
          if (!vibeChart) showChartLoading();
          let ds;
          try {
            ds = buildTimelineDataset(hourlyMaybe);
            if (!ds || !ds.labels || ds.labels.length === 0) {
              throw new Error("Empty dataset from buildTimelineDataset");
            }
          } catch (e) {
            console.error("Error building timeline dataset:", e);
            // Fallback: try to continue with hourly data only
            throw new Error(
              "Failed to process weather data. Please try again."
            );
          }
          timelineState = ds;
          window.timelineState = timelineState; // Expose for tooltip data access
          // Store hourly labels separately for axis display
          window.timelineState.hourlyLabels = ds.hourlyLabels || ds.labels;
          await renderChart(
            ds.labels,
            ds.shadeVals,
            ds.sunVals,
            ds.now,
            ds.isDayByHour
          );
          // Update remainder of day summary after chart renders
          await updateRemainderOfDaySummary();
          // Update summary if selection exists (weather data may have changed)
          if (selectionRange) {
            updateWeatherSummary();
          }
        }

        const nowTime = new Date();
        els.lastUpdated && (els.lastUpdated.textContent = fmtHMS(nowTime));
        updateAdvStats();
      } catch (e) {
        console.warn("Update cycle failed", e);
        // Don't show error for update cycle failures, just log them
        // User can manually retry with "Update Now" button
      } finally {
        scheduleNextTick(els.updateInterval?.value || DEFAULT_UPDATE_MINUTES);
      }
    }
    function restartScheduler() {
      clearPollTimer();
      scheduleNextTick(els.updateInterval?.value || DEFAULT_UPDATE_MINUTES);
    }
    // Coming back to a tab whose data has gone stale refreshes it at once.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden || !lastCoords) return;
      const held = peekForecast(lastCoords.latitude, lastCoords.longitude);
      if (!held || held.age >= FORECAST_FRESH_MS) {
        clearPollTimer();
        runUpdateCycle();
      }
    });

    // Prime weather
    let primeSeq = 0; // the latest place asked for wins
    let drawnSeq = 0; // the request whose forecast is on screen

    // Draws a forecast for a place: cards, chart, summaries, status.
    async function applyForecast(
      data,
      { latitude, longitude, sourceLabel, placeName, seq }
    ) {
      if (seq !== primeSeq) return; // a newer place was chosen meanwhile
      drawnSeq = seq;
      placeZone = PlaceTime.isValidZone(data.timezone)
        ? data.timezone
        : browserZone;
      updateHeadlineDate();
      const cur = data.current;
      const hourly = data.hourly;
      const dailySun = sunTimesFrom(data.daily, daysAhead);
      sunTimes = dailySun;
      lastCoords = { latitude, longitude };

      // The place comes from the ZIP lookup (or a saved favorite); a GPS
      // fix has none, since there is no reverse geocoding.
      currentPlaceName = placeName;
      updateChartTitle();
      updateAdvStats();

      applyCurrentConditions(cur);
      compute();
      updateChartTitle();

      // Only show loading if chart doesn't exist yet
      if (!vibeChart) showChartLoading();
      let ds;
      try {
        ds = buildTimelineDataset(hourly);
        if (!ds || !ds.labels || ds.labels.length === 0) {
          throw new Error("Empty dataset from buildTimelineDataset");
        }
      } catch (e) {
        console.error("Error building timeline dataset:", e);
        // Fallback: try to continue with hourly data only
        throw new Error("Failed to process weather data. Please try again.");
      }
      timelineState = ds;
      window.timelineState = timelineState; // Expose for tooltip data access
      // Store hourly labels separately for axis display
      window.timelineState.hourlyLabels = ds.hourlyLabels || ds.labels;
      await renderChart(
        ds.labels,
        ds.shadeVals,
        ds.sunVals,
        ds.now,
        ds.isDayByHour
      );
      // Update remainder of day summary after chart renders
      await updateRemainderOfDaySummary();
      updateAdvStats(); // Update stats after chart is rendered
      // Update summary if selection exists (weather data may have changed)
      if (selectionRange) {
        updateWeatherSummary();
      }

      const nowTime = new Date();
      els.lastUpdated && (els.lastUpdated.textContent = fmtHMS(nowTime));
      updateAdvStats();
      statusEl &&
        (statusEl.textContent = sourceLabel
          ? `Using ${sourceLabel}`
          : "Using chosen coordinates");
      restartScheduler();
      hideError();

      // Update favorites UI and offer to save current location
      updateFavoritesUI();
      if (currentPlaceName && lastCoords) {
        offerToSaveFavorite();
      }

    }

    // Prime weather: draw from a copy we already hold (instant on reload),
    // then fetch a fresh one if that copy is older than FORECAST_FRESH_MS.
    async function primeWeatherForCoords(
      latitude,
      longitude,
      sourceLabel = "",
      placeName = ""
    ) {
      statusEl &&
        (statusEl.textContent = sourceLabel
          ? `Getting weather for ${sourceLabel}…`
          : "Getting weather…");
      // Only show loading if chart doesn't exist yet
      if (!vibeChart) showChartLoading();
      const seq = ++primeSeq;
      const place = { latitude, longitude, sourceLabel, placeName, seq };
      const held = peekForecast(latitude, longitude);
      let drawn = false;
      if (held) {
        try {
          await applyForecast(held.data, place);
          drawn = true;
        } catch (e) {
          log(e);
        }
        if (drawn && held.age < FORECAST_FRESH_MS) return;
      }
      try {
        const data = await getForecast(latitude, longitude, { maxAgeMs: 0 });
        if (!drawn || data !== held.data) await applyForecast(data, place);
      } catch (e) {
        log(e);
        if (drawn || seq !== primeSeq) return; // keep showing what we have
        if (lastCoords && statusEl) {
          // The place on screen stays; say that the new one didn't load.
          statusEl.textContent = sourceLabel
            ? `Couldn't get weather for ${sourceLabel}.`
            : "Couldn't get weather for that place.";
        }

        // Delay showing error to allow time for localStorage/cookies to be read
        setTimeout(() => {
          // A newer place was chosen since, or this place loaded after all
          if (seq !== primeSeq || drawnSeq === seq) return;

          let errorTitle = "Weather Fetch Failed";
          let errorDetails = "Could not retrieve weather data.";
          let errorSuggestion = "";

          if (e.message === "TIMEOUT") {
            errorTitle = "Weather Is Taking Too Long";
            errorDetails = `The weather service didn't answer within ${
              FETCH_TIMEOUT_MS / 1000
            } seconds.`;
            errorSuggestion = "Try again, or enter a ZIP code.";
          } else if (e.message === "RATE_LIMIT") {
            errorTitle = "Rate Limit Exceeded";
            errorDetails =
              "Too many requests to the weather service. Please wait a moment.";
            errorSuggestion = "Wait a few seconds and try again.";
          } else if (e.message === "SERVER_ERROR") {
            errorTitle = "Weather Service Error";
            errorDetails = "The weather service is temporarily unavailable.";
            errorSuggestion = "Please try again in a moment.";
          } else if (e.message === "NETWORK_ERROR") {
            errorTitle = "Network Error";
            errorDetails =
              "Could not connect to the weather service. Check your internet connection.";
            errorSuggestion = "Check your connection and try again.";
          } else if (e.message === "INVALID_RESPONSE") {
            errorTitle = "Invalid Response";
            errorDetails = "Received unexpected data from the weather service.";
            errorSuggestion = "Please try again.";
          }

          showError(errorTitle, errorDetails, errorSuggestion, {
            retry: () =>
              primeWeatherForCoords(
                latitude,
                longitude,
                sourceLabel,
                placeName
              ),
            zip: () => {}, // ZIP input will be shown in error message
          });
          statusEl && (statusEl.textContent = "Failed to fetch weather data.");
        }, 1500); // 1.5 second delay
      }
    }

    // Favorites functions
    function saveFavorite(name, lat, lon) {
      const favorite = { name, lat, lon, id: Date.now() };
      favorites.push(favorite);
      storageCacheSet(FAVORITES_KEY, JSON.stringify(favorites));
      updateFavoritesUI();
      showNotification(`Saved "${name}" to favorites`, "success");
    }

    function deleteFavorite(id) {
      favorites = favorites.filter((f) => f.id !== id);
      storageCacheSet(FAVORITES_KEY, JSON.stringify(favorites));
      updateFavoritesUI();
    }

    function updateFavoritesUI() {
      if (!favoritesList) return;

      if (favorites.length === 0) {
        if (favoritesDropdown) favoritesDropdown.style.display = "none";
        return;
      }

      if (favoritesDropdown) favoritesDropdown.style.display = "block";
      favoritesList.innerHTML = "";

      favorites.forEach((fav) => {
        const lat = Number(fav.lat);
        const lon = Number(fav.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const item = document.createElement("div");
        item.className = "favorite-item";

        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.className = "favorite-name";
        nameBtn.textContent = String(fav.name ?? "");
        nameBtn.addEventListener("click", () => {
          primeWeatherForCoords(
            lat,
            lon,
            nameBtn.textContent,
            nameBtn.textContent
          );
          if (favoritesToggle) favoritesToggle.textContent = "⭐ Favorites";
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "favorite-delete";
        deleteBtn.title = "Delete";
        deleteBtn.textContent = "×";
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Delete this favorite?")) {
            deleteFavorite(fav.id);
          }
        });

        item.append(nameBtn, deleteBtn);
        favoritesList.appendChild(item);
      });
    }

    function offerToSaveFavorite() {
      if (!currentPlaceName || !lastCoords) return;
      const exists = favorites.some(
        (f) =>
          Math.abs(f.lat - lastCoords.latitude) < 0.01 &&
          Math.abs(f.lon - lastCoords.longitude) < 0.01
      );
      if (exists) return;

      // Show a subtle notification with save option
      const name = currentPlaceName;
      const { latitude, longitude } = lastCoords;
      const notification = document.createElement("div");
      notification.className = "notification success favorite-offer";
      const text = document.createElement("span");
      text.textContent = `Save "${name}" to favorites?`;
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "favorite-save-btn";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        notification.remove();
        saveFavorite(name, latitude, longitude);
      });
      notification.append(text, saveBtn);
      if (statusEl && statusEl.parentElement) {
        statusEl.parentElement.appendChild(notification);
        setTimeout(() => notification.remove(), 10000);
      }
    }

    // Geolocation - precise location (requires permission)
    function useLocation() {
      statusEl && (statusEl.textContent = "Getting precise location…");
      hideError();
      if (!navigator.geolocation) {
        showError(
          "Geolocation Unavailable",
          "Your browser doesn't support location services.",
          "Please enter a ZIP code below or use coordinates in Advanced Configuration.",
          {
            zip: () => {}, // ZIP input will be shown in error message
          }
        );
        statusEl &&
          (statusEl.textContent =
            "Geolocation unavailable. Enter values manually.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            // Force fresh weather data fetch for the new location
            await primeWeatherForCoords(latitude, longitude, "device location");
            hideError();
            // Ensure location display is updated (primeWeatherForCoords already calls this, but ensure it's current)
            updateChartTitle();
            updateAdvStats();
          } catch (e) {
            log(e);

            // Delay showing error to allow time for localStorage/cookies to be read
            setTimeout(() => {
              // Check if error was already resolved (e.g., by saved ZIP or another location method)
              if (lastCoords) {
                return; // Location was successfully determined, don't show error
              }

              let errorTitle = "Weather Fetch Failed";
              let errorDetails = "Could not retrieve weather data.";
              let errorSuggestion = "";

              if (e.message === "RATE_LIMIT") {
                errorTitle = "Rate Limit Exceeded";
                errorDetails =
                  "Too many requests to the weather service. Please wait a moment.";
                errorSuggestion = "Wait a few seconds and try again.";
              } else if (e.message === "SERVER_ERROR") {
                errorTitle = "Weather Service Error";
                errorDetails =
                  "The weather service is temporarily unavailable.";
                errorSuggestion = "Please try again in a moment.";
              } else if (e.message === "NETWORK_ERROR") {
                errorTitle = "Network Error";
                errorDetails =
                  "Could not connect to the weather service. Check your internet connection.";
                errorSuggestion = "Check your connection and try again.";
              } else if (e.message === "INVALID_RESPONSE") {
                errorTitle = "Invalid Response";
                errorDetails =
                  "Received unexpected data from the weather service.";
                errorSuggestion = "Please try again.";
              }

              showError(errorTitle, errorDetails, errorSuggestion, {
                zip: () => {}, // ZIP input will be shown in error message
              });
              statusEl &&
                (statusEl.textContent =
                  "Could not fetch weather. Enter values manually.");
            }, 1500); // 1.5 second delay
          }
        },
        (err) => {
          log(err);

          // Delay showing error to allow time for localStorage/cookies to be read
          setTimeout(() => {
            // Check if error was already resolved (e.g., by saved ZIP)
            if (lastCoords) {
              return; // Location was successfully determined, don't show error
            }

            let errorTitle = "Location Access Denied";
            let errorDetails = "Location permission was denied or unavailable.";
            let errorSuggestion = "";

            if (err.code === err.PERMISSION_DENIED) {
              errorTitle = "Location Permission Denied";
              errorDetails = "Location access was denied.";
              errorSuggestion = "";
            } else if (err.code === err.POSITION_UNAVAILABLE) {
              errorTitle = "Location Unavailable";
              errorDetails = "Could not determine your precise location.";
            } else if (err.code === err.TIMEOUT) {
              errorTitle = "Location Request Timeout";
              errorDetails = "Location request took too long.";
              errorSuggestion =
                "Please try again or enter a ZIP code manually.";
            }

            showError(errorTitle, errorDetails, errorSuggestion, {
              zip: () => {}, // ZIP input will be shown in error message
            });
            statusEl &&
              (statusEl.textContent =
                "Location denied. Enter values manually or set a ZIP.");
          }, 1500); // 1.5 second delay
        },
        // City-level accuracy is plenty for weather, and a fix up to ten
        // minutes old saves waiting on the GPS.
        { timeout: 8000, maximumAge: 600000 }
      );
    }

    // Inputs auto-update
    ["input", "change"].forEach((evt) => {
      ["temp", "humidity", "wind", "solar", "reflect", "reflectCustom"].forEach(
        (id) => {
          const el = els[id];
          el &&
            el.addEventListener(evt, () => {
              // Debounce compute for input events to avoid excessive calculations
              if (evt === "input") {
                debouncedCompute(200);
              } else {
                compute(); // Change events fire less frequently, no debounce needed
              }
              if ((id === "reflect" || id === "reflectCustom") && lastCoords) {
                hourlyForShownPlace()
                  .then(async (hourly) => {
                    if (!hourly) return; // another place was chosen meanwhile
                    const ds = buildTimelineDataset(hourly);
                    timelineState = ds;
                    window.timelineState = timelineState;
                    await renderChart(
                      ds.labels,
                      ds.shadeVals,
                      ds.sunVals,
                      ds.now,
                      ds.isDayByHour
                    );
                  })
                  .catch(() => {});
              }
            });
        }
      );
    });

      // Time preset functions
      function setTimePreset(preset) {
        // Reset date offset when preset is selected
        dateOffset = 0;

        // Clear active state from all presets
        const allPresetBtns = [
          presetTodayBtn,
          presetTomorrowBtn,
          presetDefaultBtn,
          presetWeekBtn,
          preset3DayBtn,
          preset5DayBtn,
          presetOneWeekBtn,
        ];
        allPresetBtns.forEach((btn) => {
          if (btn) {
            btn.classList.remove("active");
            btn.classList.remove("loading");
          }
        });

        // Show loading state on the clicked button
        let clickedBtn = null;
        let newDaysAhead = daysAhead;
        let startFromTomorrow = false;

        switch (preset) {
          case "today":
            newDaysAhead = 1;
            startFromTomorrow = false;
            clickedBtn = presetTodayBtn;
            break;
          case "tomorrow":
            newDaysAhead = 1;
            startFromTomorrow = true;
            clickedBtn = presetTomorrowBtn;
            break;
          case "default":
            newDaysAhead = 2;
            startFromTomorrow = false;
            clickedBtn = presetDefaultBtn;
            break;
          case "week":
            newDaysAhead = 7;
            startFromTomorrow = false;
            clickedBtn = presetWeekBtn;
            break;
          case "3day":
            newDaysAhead = 3;
            startFromTomorrow = false;
            clickedBtn = preset3DayBtn;
            break;
          case "5day":
            newDaysAhead = 5;
            startFromTomorrow = false;
            clickedBtn = preset5DayBtn;
            break;
          case "oneWeek":
            newDaysAhead = 7;
            startFromTomorrow = false;
            clickedBtn = presetOneWeekBtn;
            break;
        }

        // Set active state immediately (synchronously) to prevent race conditions
        if (clickedBtn) {
          clickedBtn.classList.add("active");
          clickedBtn.classList.add("loading");
        }

        daysAhead = newDaysAhead;
        if (els.daysAhead) els.daysAhead.value = daysAhead;
        storageCacheSet(DAYS_AHEAD_KEY, String(daysAhead));

        // Update date display (needs to be after daysAhead is set)
        updateHeadlineDate();

        // Update chart title
        if (preset === "tomorrow") {
          if (chartTitleEl) chartTitleEl.textContent = "Tomorrow";
        } else if (preset === "default") {
          if (chartTitleEl) chartTitleEl.textContent = "24-Hour Forecast";
        } else {
          updateChartTitle();
        }

        // Update chart if we have data
        if (lastCoords) {
          hourlyForShownPlace()
            .then(async (hourly) => {
              if (!hourly) return; // another place was chosen meanwhile
              // Skip getDailySun if we already have enough sun data
              const sunDaysAhead = preset === "tomorrow" ? 2 : daysAhead;
              const needsSunData =
                !sunTimes ||
                !sunTimes.sunrises ||
                sunTimes.sunrises.length < sunDaysAhead + 1;

              if (needsSunData) {
                try {
                  const dailySun = await getDailySun(
                    lastCoords.latitude,
                    lastCoords.longitude,
                    sunDaysAhead
                  );
                  sunTimes = dailySun;
                } catch (e) {
                  console.warn("Failed to fetch sun times:", e);
                }
              }

              // For "tomorrow" preset, build dataset with 2 days to ensure we have all of tomorrow's data
              const datasetDaysAhead = preset === "tomorrow" ? 2 : daysAhead;
              let ds = buildTimelineDataset(hourly, datasetDaysAhead);

              // Filter data based on preset and date offset
              if (ds.labels.length > 0) {
                const now = new Date();
                let filterStart, filterEnd;

                // Days are the place's days
                const placeDay = (n) =>
                  new Date(PlaceTime.startOfDay(now, placeZone, n));
                if (preset === "today") {
                  // Filter to only today (from start of today to end of today)
                  filterStart = placeDay(dateOffset);
                  filterEnd = placeDay(dateOffset + 1);
                } else if (preset === "tomorrow") {
                  // Filter to only tomorrow (from start of tomorrow to end of tomorrow)
                  filterStart = placeDay(1 + dateOffset);
                  filterEnd = placeDay(2 + dateOffset);
                } else if (dateOffset !== 0) {
                  // For other presets, only filter if dateOffset is applied (arrow navigation)
                  filterStart = placeDay(dateOffset);
                  filterEnd = placeDay(dateOffset + daysAhead);
                }

                if (filterStart && filterEnd) {
                  // Optimize: Use timestamp comparisons and pre-allocate arrays
                  const filterStartTime = filterStart.getTime();
                  const filterEndTime = filterEnd.getTime();
                  const filteredIndices = [];

                  // First pass: collect indices
                  for (let i = 0; i < ds.labels.length; i++) {
                    const labelTime = new Date(ds.labels[i]).getTime();
                    if (
                      labelTime >= filterStartTime &&
                      labelTime < filterEndTime
                    ) {
                      filteredIndices.push(i);
                    }
                  }

                  if (filteredIndices.length > 0) {
                    // Keep every per-point series, cut to the same points
                    const len = ds.labels.length;
                    const cut = {};
                    for (const [key, value] of Object.entries(ds)) {
                      cut[key] =
                        Array.isArray(value) &&
                        value.length === len &&
                        key !== "hourlyLabels"
                          ? filteredIndices.map((i) => value[i])
                          : value;
                    }
                    cut.hourlyLabels = ds.hourlyLabels || ds.labels; // Preserve hourlyLabels
                    ds = cut;
                  }
                }
              }

              timelineState = ds;
              window.timelineState = timelineState;
              // Store hourly labels separately for axis display
              window.timelineState.hourlyLabels = ds.hourlyLabels || ds.labels;

              // Use updateChartData for faster updates instead of full renderChart
              if (vibeChart) {
                updateChartData(
                  ds.labels,
                  ds.shadeVals,
                  ds.sunVals,
                  ds.now,
                  ds.isDayByHour
                );
                // Update remainder of day summary after chart data updates
                await updateRemainderOfDaySummary();
              } else {
                // Chart doesn't exist yet, use renderChart
                await renderChart(
                  ds.labels,
                  ds.shadeVals,
                  ds.sunVals,
                  ds.now,
                  ds.isDayByHour
                );
                // Update remainder of day summary after chart renders
                await updateRemainderOfDaySummary();
              }

              if (selectionRange) {
                updateWeatherSummary();
              }

              // Remove loading state (active state already set synchronously)
              allPresetBtns.forEach((btn) => {
                if (btn) btn.classList.remove("loading");
              });
            })
            .catch(() => {
              // Remove loading state on error
              allPresetBtns.forEach((btn) => {
                if (btn) btn.classList.remove("loading");
              });
            });
        } else {
          // Remove loading state if no data (active state already set synchronously)
          allPresetBtns.forEach((btn) => {
            if (btn) btn.classList.remove("loading");
          });
        }
      }

      // Time preset buttons
      presetDefaultBtn &&
        presetDefaultBtn.addEventListener("click", () =>
          setTimePreset("default")
        );
      presetWeekBtn &&
        presetWeekBtn.addEventListener("click", () => setTimePreset("week"));

      // Day navigation function

      els.solar &&
        els.solar.addEventListener("input", () => {
          solarExact = null; // set by hand from now on
          els.solarVal &&
            (els.solarVal.textContent = parseFloat(els.solar.value).toFixed(1));
        });

      // Unit toggle
      function setUnit(newUnit, { persist = true, rerender = true } = {}) {
        if (newUnit !== "F" && newUnit !== "C") return;
        if (newUnit === unit) return;
        convertTempInputIfPresent(newUnit);
        unit = newUnit;
        persist && storageCacheSet(UNIT_KEY, unit);
        paintUnitToggle();
        applyUnitLabels();
        if (rerender) {
          compute();
          if (lastCoords) {
            hourlyForShownPlace()
              .then(async (hourly) => {
                if (!hourly) return; // another place was chosen meanwhile
                const ds = buildTimelineDataset(hourly);
                timelineState = ds;
                window.timelineState = timelineState;
                await renderChart(
                  ds.labels,
                  ds.shadeVals,
                  ds.sunVals,
                  ds.now,
                  ds.isDayByHour
                );
                // Update weather summary if there's a selection
                if (selectionRange) {
                  updateWeatherSummary();
                }
              })
              .catch(() => {});
          } else {
            // Even without coords, update summary if there's a selection (for manual input mode)
            if (selectionRange && timelineState) {
              updateWeatherSummary();
            }
          }
        } else {
          // Even if not rerendering, update summary if there's a selection (unit change affects displayed temps)
          if (selectionRange && timelineState) {
            updateWeatherSummary();
          }
        }
      }
      unitEls.F?.addEventListener("click", () => setUnit("F"));
      unitEls.C?.addEventListener("click", () => setUnit("C"));
      paintUnitToggle();
      applyUnitLabels();

      // Storage sync across tabs
      window.addEventListener("storage", (e) => {
        if (e.key === UNIT_KEY) {
          const newVal = e.newValue === "C" ? "C" : "F";
          if (newVal !== unit) setUnit(newVal, { persist: false });
        }
        if (e.key === ZIP_KEY) {
          const zipVal = e.newValue;
          zipEls.input && (zipEls.input.value = zipVal ?? "");
          updateZipClearButton();
          if (zipVal) {
            getCoordsForZip(zipVal)
              .then(({ latitude, longitude, place }) =>
                primeWeatherForCoords(
                  latitude,
                  longitude,
                  `ZIP ${zipVal} (${place})`,
                  place
                )
              )
              .then(() => hideError()) // Ensure error is hidden after successful weather fetch
              .catch(() => {});
          }
        }
      });

      // Scheduler controls
      function clearPollTimer() {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
      }
      els.updateInterval &&
        els.updateInterval.addEventListener("change", () => {
          clearPollTimer();
          scheduleNextTick(els.updateInterval?.value || DEFAULT_UPDATE_MINUTES);
        });
      els.updateHourlyToggle &&
        els.updateHourlyToggle.addEventListener("change", () => {
          clearPollTimer();
          scheduleNextTick(els.updateInterval?.value || DEFAULT_UPDATE_MINUTES);
        });
      els.updateNow &&
        els.updateNow.addEventListener("click", () => {
          clearPollTimer();
          runUpdateCycle({ force: true });
        });

      // Days ahead setting
      els.daysAhead && (els.daysAhead.value = daysAhead);
      updateChartTitle(); // Set initial title
      els.daysAhead &&
        els.daysAhead.addEventListener("change", () => {
          const newValue = parseInt(els.daysAhead.value, 10);
          if (newValue >= 1 && newValue <= 7) {
            daysAhead = newValue;
            storageCacheSet(DAYS_AHEAD_KEY, String(daysAhead));
            updateChartTitle();
            if (lastCoords) {
              const seq = primeSeq;
              Promise.all([
                getHourlyWeather(lastCoords.latitude, lastCoords.longitude),
                getDailySun(
                  lastCoords.latitude,
                  lastCoords.longitude,
                  daysAhead
                ),
              ])
                .then(async ([hourly, dailySun]) => {
                  if (seq !== primeSeq) return; // another place was chosen
                  sunTimes = dailySun;
                  const ds = buildTimelineDataset(hourly);
                  timelineState = ds;
                  window.timelineState = timelineState;
                  await renderChart(
                    ds.labels,
                    ds.shadeVals,
                    ds.sunVals,
                    ds.now,
                    ds.isDayByHour
                  );
                })
                .catch(() => {});
            }
          }
        });

      // Line smoothing setting
      els.lineSmoothing && (els.lineSmoothing.value = lineSmoothing);
      els.lineSmoothingVal &&
        (els.lineSmoothingVal.textContent = lineSmoothing.toFixed(1));
      els.lineSmoothing &&
        els.lineSmoothing.addEventListener("input", () => {
          lineSmoothing = parseFloat(els.lineSmoothing.value) || 0;
          els.lineSmoothingVal &&
            (els.lineSmoothingVal.textContent = lineSmoothing.toFixed(1));
          storageCacheSet(LINE_SMOOTHING_KEY, String(lineSmoothing));
          // Update chart if it exists (debounced)
          debouncedChartUpdate("none");
        });

      // Night shading toggle (default to true)
      els.nightShadingToggle &&
        (els.nightShadingToggle.checked = nightShadingEnabled);
      els.nightShadingToggle &&
        els.nightShadingToggle.addEventListener("change", () => {
          nightShadingEnabled = els.nightShadingToggle.checked;
          storageCacheSet(NIGHT_SHADING_KEY, String(nightShadingEnabled));
          // Update chart if it exists (debounced)
          debouncedChartUpdate("none");
        });

      // Temperature zones toggle
      const tempZonesToggle = $("#temperatureZonesToggle");
      tempZonesToggle && (tempZonesToggle.checked = temperatureZonesEnabled);
      tempZonesToggle &&
        tempZonesToggle.addEventListener("change", () => {
          temperatureZonesEnabled = tempZonesToggle.checked;
          storageCacheSet(TEMP_ZONES_KEY, String(temperatureZonesEnabled));
          debouncedChartUpdate("none");
        });

      // Humidity visualization toggle
      const humidityVisToggle = $("#humidityVisToggle");
      humidityVisToggle &&
        (humidityVisToggle.checked = humidityVisualizationEnabled);
      humidityVisToggle &&
        humidityVisToggle.addEventListener("change", () => {
          humidityVisualizationEnabled = humidityVisToggle.checked;
          storageCacheSet(
            HUMIDITY_VIS_KEY,
            String(humidityVisualizationEnabled)
          );
          debouncedChartUpdate("none");
        });

      // Sun markers toggle
      const sunMarkersToggle = $("#sunMarkersToggle");
      sunMarkersToggle && (sunMarkersToggle.checked = sunMarkersEnabled);
      sunMarkersToggle &&
        sunMarkersToggle.addEventListener("change", () => {
          sunMarkersEnabled = sunMarkersToggle.checked;
          storageCacheSet(SUN_MARKERS_KEY, String(sunMarkersEnabled));
          debouncedChartUpdate("none");
        });

      // Rain icons toggle
      const rainIconsToggle = $("#rainIconsToggle");
      rainIconsToggle && (rainIconsToggle.checked = rainIconsEnabled);
      rainIconsToggle &&
        rainIconsToggle.addEventListener("change", () => {
          rainIconsEnabled = rainIconsToggle.checked;
          storageCacheSet(RAIN_ICONS_KEY, String(rainIconsEnabled));
          debouncedChartUpdate("none");
        });

      // Snow icons toggle
      const snowIconsToggle = $("#snowIconsToggle");
      snowIconsToggle && (snowIconsToggle.checked = snowIconsEnabled);
      snowIconsToggle &&
        snowIconsToggle.addEventListener("change", () => {
          snowIconsEnabled = snowIconsToggle.checked;
          storageCacheSet(SNOW_ICONS_KEY, String(snowIconsEnabled));
          debouncedChartUpdate("none");
        });

      // Ice icons toggle
      const iceIconsToggle = $("#iceIconsToggle");
      iceIconsToggle && (iceIconsToggle.checked = iceIconsEnabled);
      iceIconsToggle &&
        iceIconsToggle.addEventListener("change", () => {
          iceIconsEnabled = iceIconsToggle.checked;
          storageCacheSet(ICE_ICONS_KEY, String(iceIconsEnabled));
          debouncedChartUpdate("none");
        });

      // Wind icons toggle
      const windIconsToggle = $("#windIconsToggle");
      windIconsToggle && (windIconsToggle.checked = windIconsEnabled);
      windIconsToggle &&
        windIconsToggle.addEventListener("change", () => {
          windIconsEnabled = windIconsToggle.checked;
          storageCacheSet(WIND_ICONS_KEY, String(windIconsEnabled));
          debouncedChartUpdate("none");
        });

      // Color customization
      const sunColorStart = $("#sunColorStart");
      const sunColorEnd = $("#sunColorEnd");
      const shadeColorStart = $("#shadeColorStart");
      const shadeColorEnd = $("#shadeColorEnd");
      const resetColorsBtn = $("#resetColors");

      // Initialize color inputs
      if (sunColorStart) sunColorStart.value = chartColors.sun.start;
      if (sunColorEnd) sunColorEnd.value = chartColors.sun.end;
      if (shadeColorStart) shadeColorStart.value = chartColors.shade.start;
      if (shadeColorEnd) shadeColorEnd.value = chartColors.shade.end;

      // Debounce color updates to prevent excessive redraws
      let colorUpdateTimeout = null;
      function updateChartColors() {
        if (sunColorStart) chartColors.sun.start = sunColorStart.value;
        if (sunColorEnd) chartColors.sun.end = sunColorEnd.value;
        if (shadeColorStart) chartColors.shade.start = shadeColorStart.value;
        if (shadeColorEnd) chartColors.shade.end = shadeColorEnd.value;
        storageCacheSet(CHART_COLORS_KEY, JSON.stringify(chartColors));

        // Debounce rapid color changes
        if (colorUpdateTimeout) clearTimeout(colorUpdateTimeout);
        colorUpdateTimeout = setTimeout(() => {
          // Optimize: Just trigger chart update - gradient plugin will use updated chartColors
          debouncedChartUpdate("none", 300);
          if (!vibeChart && lastCoords) {
            // Fallback: recreate if chart doesn't exist
            hourlyForShownPlace()
              .then(async (hourly) => {
                if (!hourly) return; // another place was chosen meanwhile
                const ds = buildTimelineDataset(hourly);
                timelineState = ds;
                window.timelineState = timelineState;
                await renderChart(
                  ds.labels,
                  ds.shadeVals,
                  ds.sunVals,
                  ds.now,
                  ds.isDayByHour
                );
              })
              .catch(() => {});
          }
        }, 150);
      }

      sunColorStart &&
        sunColorStart.addEventListener("input", updateChartColors);
      sunColorEnd && sunColorEnd.addEventListener("input", updateChartColors);
      shadeColorStart &&
        shadeColorStart.addEventListener("input", updateChartColors);
      shadeColorEnd &&
        shadeColorEnd.addEventListener("input", updateChartColors);

      resetColorsBtn &&
        resetColorsBtn.addEventListener("click", () => {
          chartColors = structuredClone(DEFAULT_CHART_COLORS);
          if (sunColorStart) sunColorStart.value = chartColors.sun.start;
          if (sunColorEnd) sunColorEnd.value = chartColors.sun.end;
          if (shadeColorStart) shadeColorStart.value = chartColors.shade.start;
          if (shadeColorEnd) shadeColorEnd.value = chartColors.shade.end;
          updateChartColors();
        });

      // Calibration controls
      const calibHumidityCoeff = $("#calibHumidityCoeff");
      const calibHumidityCoeffVal = $("#calibHumidityCoeffVal");
      const calibHumidityBaseline = $("#calibHumidityBaseline");
      const calibHumidityBaselineVal = $("#calibHumidityBaselineVal");
      const calibWindCoeff = $("#calibWindCoeff");
      const calibWindCoeffVal = $("#calibWindCoeffVal");
      const calibSolarCoeff = $("#calibSolarCoeff");
      const calibSolarCoeffVal = $("#calibSolarCoeffVal");
      const calibReflectCoeff = $("#calibReflectCoeff");
      const calibReflectCoeffVal = $("#calibReflectCoeffVal");
      const calibCloudExp = $("#calibCloudExp");
      const calibCloudExpVal = $("#calibCloudExpVal");
      const resetCalibrationBtn = $("#resetCalibration");

      // Initialize calibration inputs
      if (calibHumidityCoeff) {
        calibHumidityCoeff.value = calibration.humidityCoeff;
        if (calibHumidityCoeffVal)
          calibHumidityCoeffVal.textContent =
            calibration.humidityCoeff.toFixed(4);
      }
      if (calibHumidityBaseline) {
        calibHumidityBaseline.value = calibration.humidityBaseline;
        if (calibHumidityBaselineVal)
          calibHumidityBaselineVal.textContent = calibration.humidityBaseline;
      }
      if (calibWindCoeff) {
        calibWindCoeff.value = calibration.windCoeff;
        if (calibWindCoeffVal)
          calibWindCoeffVal.textContent = calibration.windCoeff.toFixed(1);
      }
      if (calibSolarCoeff) {
        calibSolarCoeff.value = calibration.solarCoeff;
        if (calibSolarCoeffVal)
          calibSolarCoeffVal.textContent = calibration.solarCoeff;
      }
      if (calibReflectCoeff) {
        calibReflectCoeff.value = calibration.reflectCoeff;
        if (calibReflectCoeffVal)
          calibReflectCoeffVal.textContent = calibration.reflectCoeff;
      }
      if (calibCloudExp) {
        calibCloudExp.value = calibration.cloudExp;
        if (calibCloudExpVal)
          calibCloudExpVal.textContent = calibration.cloudExp.toFixed(1);
      }
      // Debounce calibration updates
      let calibrationUpdateTimeout = null;
      // A slider writes only its own coefficient: reading all six would snap
      // the humidity default 1/15 to the slider's 0.067 step.
      function updateCalibration(key, value, { save = true } = {}) {
        if (key && Number.isFinite(value)) calibration[key] = value;

        if (save) {
          try {
            storageCacheSet(CALIBRATION_KEY, JSON.stringify(calibration));
          } catch (e) {}
        }

        // Debounce recalculation
        if (calibrationUpdateTimeout) clearTimeout(calibrationUpdateTimeout);
        calibrationUpdateTimeout = setTimeout(() => {
          // Recalculate and update chart if data exists
          if (lastCoords) {
            hourlyForShownPlace()
              .then(async (hourly) => {
                if (!hourly) return; // another place was chosen meanwhile
                const ds = buildTimelineDataset(hourly);
                timelineState = ds;
                window.timelineState = timelineState;
                await renderChart(
                  ds.labels,
                  ds.shadeVals,
                  ds.sunVals,
                  ds.now,
                  ds.isDayByHour
                );
              })
              .catch(() => {});
          } else if (els.temp && els.humidity && els.wind) {
            // Update cards if manual inputs are present
            compute();
          }
        }, 300);
      }

      // Calibration event listeners
      calibHumidityCoeff &&
        calibHumidityCoeff.addEventListener("input", () => {
          if (calibHumidityCoeffVal)
            calibHumidityCoeffVal.textContent = parseFloat(
              calibHumidityCoeff.value
            ).toFixed(4);
          updateCalibration("humidityCoeff", parseFloat(calibHumidityCoeff.value));
        });
      calibHumidityBaseline &&
        calibHumidityBaseline.addEventListener("input", () => {
          if (calibHumidityBaselineVal)
            calibHumidityBaselineVal.textContent = parseFloat(
              calibHumidityBaseline.value
            );
          updateCalibration("humidityBaseline", parseFloat(calibHumidityBaseline.value));
        });
      calibWindCoeff &&
        calibWindCoeff.addEventListener("input", () => {
          if (calibWindCoeffVal)
            calibWindCoeffVal.textContent = parseFloat(
              calibWindCoeff.value
            ).toFixed(1);
          updateCalibration("windCoeff", parseFloat(calibWindCoeff.value));
        });
      calibSolarCoeff &&
        calibSolarCoeff.addEventListener("input", () => {
          if (calibSolarCoeffVal)
            calibSolarCoeffVal.textContent = parseFloat(calibSolarCoeff.value);
          updateCalibration("solarCoeff", parseFloat(calibSolarCoeff.value));
        });
      calibReflectCoeff &&
        calibReflectCoeff.addEventListener("input", () => {
          if (calibReflectCoeffVal)
            calibReflectCoeffVal.textContent = parseFloat(
              calibReflectCoeff.value
            );
          updateCalibration("reflectCoeff", parseFloat(calibReflectCoeff.value));
        });
      calibCloudExp &&
        calibCloudExp.addEventListener("input", () => {
          if (calibCloudExpVal)
            calibCloudExpVal.textContent = parseFloat(
              calibCloudExp.value
            ).toFixed(1);
          updateCalibration("cloudExp", parseFloat(calibCloudExp.value));
        });

      resetCalibrationBtn &&
        resetCalibrationBtn.addEventListener("click", () => {
          calibration = { ...defaultCalibration };
          if (calibHumidityCoeff) {
            calibHumidityCoeff.value = calibration.humidityCoeff;
            if (calibHumidityCoeffVal)
              calibHumidityCoeffVal.textContent =
                calibration.humidityCoeff.toFixed(4);
          }
          if (calibHumidityBaseline) {
            calibHumidityBaseline.value = calibration.humidityBaseline;
            if (calibHumidityBaselineVal)
              calibHumidityBaselineVal.textContent =
                calibration.humidityBaseline;
          }
          if (calibWindCoeff) {
            calibWindCoeff.value = calibration.windCoeff;
            if (calibWindCoeffVal)
              calibWindCoeffVal.textContent = calibration.windCoeff.toFixed(1);
          }
          if (calibSolarCoeff) {
            calibSolarCoeff.value = calibration.solarCoeff;
            if (calibSolarCoeffVal)
              calibSolarCoeffVal.textContent = calibration.solarCoeff;
          }
          if (calibReflectCoeff) {
            calibReflectCoeff.value = calibration.reflectCoeff;
            if (calibReflectCoeffVal)
              calibReflectCoeffVal.textContent = calibration.reflectCoeff;
          }
          if (calibCloudExp) {
            calibCloudExp.value = calibration.cloudExp;
            if (calibCloudExpVal)
              calibCloudExpVal.textContent = calibration.cloudExp.toFixed(1);
          }
          // Back to the defaults, and forget the saved ones.
          try {
            storageCacheRemove(CALIBRATION_KEY);
          } catch (e) {}
          updateCalibration(null, NaN, { save: false });
        });

      // ZIP input handler - submit on Enter or blur
      async function handleZipSubmit() {
        if (!zipEls.input) return;
        const raw = zipEls.input.value.trim();

        // If empty, clear ZIP and use device location
        if (!raw) {
          storageCacheRemove(ZIP_KEY);
          currentPlaceName = null;
          updateChartTitle();
          updateAdvStats();
          if (navigator.geolocation) {
            useLocation();
          }
          return;
        }

        const zip5 = normalizeZip(raw);
        if (!zip5) {
          showError(
            "Invalid ZIP Code",
            "Please enter a valid 5-digit US ZIP code.",
            "",
            {
              zip: () => {
                if (zipEls.input) zipEls.input.focus();
              },
            }
          );
          return;
        }

        // Show loading state
        if (zipEls.loadingSpinner)
          zipEls.loadingSpinner.style.display = "block";
        if (zipEls.input) {
          zipEls.input.disabled = true;
        }
        updateZipClearButton();
        if (!vibeChart) showChartLoading();

        try {
          hideError();
          const { latitude, longitude, place } = await getCoordsForZip(zip5);
          storageCacheSet(ZIP_KEY, zip5);
          await primeWeatherForCoords(
            latitude,
            longitude,
            `ZIP ${zip5} (${place})`,
            place
          );
          hideError();

          // Clear highlighted vibe selection when ZIP code results are returned
          clearHighlight();

          updateChartTitle();
        } catch (e) {
          console.warn(e);
          let errorTitle = "ZIP Lookup Failed";
          let errorDetails = "Could not find that ZIP code.";
          let errorSuggestion = "Please check the ZIP code and try again.";

          if (e.message === "ZIP_NOT_FOUND") {
            errorTitle = "ZIP Code Not Found";
            errorDetails = `The ZIP code "${zip5}" was not found.`;
            errorSuggestion =
              "Please verify the ZIP code and try again, or use your device location.";
          } else if (e.message === "ZIP_LOOKUP_FAILED") {
            errorTitle = "ZIP Lookup Service Error";
            errorDetails = "The ZIP lookup service is temporarily unavailable.";
            errorSuggestion =
              "Please try again in a moment or use your device location.";
          }

          showError(errorTitle, errorDetails, errorSuggestion, {
            zip: () => {
              if (zipEls.input) zipEls.input.focus();
            },
          });
        } finally {
          // Always clear loading state
          if (zipEls.loadingSpinner)
            zipEls.loadingSpinner.style.display = "none";
          if (zipEls.input) {
            zipEls.input.disabled = false;
          }
          updateZipClearButton();
        }
      }

      // Debounce ZIP input to avoid excessive lookups
      let zipSubmitTimeout = null;
      if (zipEls.input) {
        zipEls.input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (zipSubmitTimeout) clearTimeout(zipSubmitTimeout);
            handleZipSubmit();
          }
        });

        zipEls.input.addEventListener("input", (e) => {
          // Only allow numeric input
          const value = e.target.value.replace(/\D/g, "");
          if (e.target.value !== value) {
            e.target.value = value;
          }

          const currentValue = value.trim();
          // Auto-submit if exactly 5 digits (standard ZIP code)
          if (currentValue.length === 5 && /^\d{5}$/.test(currentValue)) {
            // Clear any existing timeout
            if (zipSubmitTimeout) clearTimeout(zipSubmitTimeout);
            // The field holds 5 characters, so 5 digits is a whole ZIP:
            // submit almost at once (the short wait absorbs a paste).
            zipSubmitTimeout = setTimeout(() => {
              handleZipSubmit();
            }, 50);
          } else {
            // Clear timeout if not 5 digits
            if (zipSubmitTimeout) clearTimeout(zipSubmitTimeout);
          }
        });

        zipEls.input.addEventListener("input", () => {
          updateZipClearButton();
        });

        zipEls.input.addEventListener("blur", () => {
          const currentValue = zipEls.input.value.trim();
          updateZipClearButton();

          // If ZIP code is deleted (empty), strip zip from URL and get user's current location
          if (currentValue === "") {
            // Clear saved ZIP from storage
            storageCacheRemove(ZIP_KEY);
            currentPlaceName = null;

            // Strip zip parameter from URL
            const params = new URLSearchParams(location.search);
            params.delete("zip");
            const newUrl = params.toString()
              ? `${location.pathname}?${params.toString()}`
              : location.pathname;
            history.pushState({}, "", newUrl);

            // Clear highlighted vibe selection
            clearHighlight();

            // Get user's current location based on browser
            // This will update chart title, stats, and weather data via primeWeatherForCoords
            if (navigator.geolocation) {
              useLocation();
            } else {
              // If geolocation not available, still update the display
              updateChartTitle();
              updateAdvStats();
            }
            return;
          }

          // Only submit if value changed
          const savedZip = storageCacheGet(ZIP_KEY);
          if (currentValue !== savedZip && currentValue !== currentPlaceName) {
            if (zipSubmitTimeout) clearTimeout(zipSubmitTimeout);
            zipSubmitTimeout = setTimeout(handleZipSubmit, 300);
          }
        });
      }

      // ZIP clear button
      zipEls.clearBtn &&
        zipEls.clearBtn.addEventListener("click", () => {
          // Clear ZIP input
          if (zipEls.input) {
            zipEls.input.value = "";
            updateZipClearButton();
          }
          // Clear saved ZIP from storage
          storageCacheRemove(ZIP_KEY);
          currentPlaceName = null;

          // Strip zip parameter from URL
          const params = new URLSearchParams(location.search);
          params.delete("zip");
          const newUrl = params.toString()
            ? `${location.pathname}?${params.toString()}`
            : location.pathname;
          history.pushState({}, "", newUrl);

          // Clear highlighted vibe selection
          clearHighlight();

          // Get user's current location based on browser
          if (navigator.geolocation) {
            useLocation();
          } else {
            // If geolocation not available, still update the display
            updateChartTitle();
            updateAdvStats();
          }

          updateZipClearButton();
        });

      // Buttons
      els.useLocationBtn &&
        els.useLocationBtn.addEventListener("click", () => {
          useLocation();
          // Stats will be updated when location is set via primeWeatherForCoords
        });

      // GPS location button in headline
      gpsLocationBtn &&
        gpsLocationBtn.addEventListener("click", () => {
          useLocation();
        });

      // Initialize headline date
      updateHeadlineDate();

      // Favorites toggle
      favoritesToggle &&
        favoritesToggle.addEventListener("click", () => {
          if (favoritesList) {
            const isVisible =
              favoritesList.style.display !== "none" &&
              favoritesList.style.display !== "";
            favoritesList.style.display = isVisible ? "none" : "block";
            if (!isVisible) favoritesList.classList.add("show");
            else favoritesList.classList.remove("show");
          }
        });

      // Initialize favorites UI
      updateFavoritesUI();

      // Clear highlight button
      clearHighlightBtn &&
        clearHighlightBtn.addEventListener("click", () => {
          clearHighlight();

          // If we don't have location yet, request it now
          if (!lastCoords) {
            const savedZip = storageCacheGet(ZIP_KEY);
            if (savedZip && zipEls.input) {
              getCoordsForZip(savedZip)
                .then(({ latitude, longitude, place }) =>
                  primeWeatherForCoords(
                    latitude,
                    longitude,
                    `ZIP ${savedZip} (${place})`,
                    place
                  )
                )
                .then(() => {
                  hideError();
                  updateChartTitle();
                })
                .catch(() => useLocation());
            } else {
              useLocation();
            }
          }
        });

      // Copy summary button
      copySummaryBtn &&
        copySummaryBtn.addEventListener("click", async () => {
          if (!summaryTextEl || !summaryTextEl.textContent) return;
          const summaryText = summaryTextEl.textContent.trim();
          if (
            !summaryText ||
            summaryText === "Generating summary..." ||
            summaryText === "Unable to generate summary at this time."
          )
            return;

          const success = await copyToClipboard(summaryText);
          if (success) {
            showNotification("Summary copied to clipboard!", "success");
          } else {
            showNotification(
              "Failed to copy summary. Please select and copy manually.",
              "error",
              5000
            );
          }
        });

      // Export buttons

      // Expired selection modal buttons
      keepCustomBtn &&
        keepCustomBtn.addEventListener("click", handleKeepCustomSettings);
      useDefaultsBtn &&
        useDefaultsBtn.addEventListener("click", handleUseDefaults);

      // Close modal on ESC key
      document.addEventListener("keydown", (e) => {
        if (
          e.key === "Escape" &&
          expiredModalEl &&
          expiredModalEl.style.display !== "none"
        ) {
          hideExpiredSelectionModal();
        }
      });

      // Close modal on overlay click
      expiredModalEl &&
        expiredModalEl.addEventListener("click", (e) => {
          if (e.target === expiredModalEl) {
            hideExpiredSelectionModal();
          }
        });

      // Keyboard shortcuts
      function showShortcutsModal() {
        if (shortcutsModalEl) {
          shortcutsModalEl.style.display = "flex";
          if (closeShortcutsBtn) closeShortcutsBtn.focus();
        }
      }

      function hideShortcutsModal() {
        if (shortcutsModalEl) {
          shortcutsModalEl.style.display = "none";
        }
      }

      closeShortcutsBtn &&
        closeShortcutsBtn.addEventListener("click", hideShortcutsModal);

      // Set initial active preset button based on daysAhead
      // First, clear all active states to ensure only one is active
      const allPresetBtns = [
        presetTodayBtn,
        presetTomorrowBtn,
        presetDefaultBtn,
        presetWeekBtn,
        preset3DayBtn,
        preset5DayBtn,
        presetOneWeekBtn,
      ];
      allPresetBtns.forEach((btn) => {
        if (btn) btn.classList.remove("active");
      });

      // Then set the appropriate button as active
      if (daysAhead === 1) {
        if (presetTodayBtn) presetTodayBtn.classList.add("active");
      } else if (daysAhead === 2) {
        if (presetDefaultBtn) presetDefaultBtn.classList.add("active");
      } else if (daysAhead === 3) {
        if (preset3DayBtn) preset3DayBtn.classList.add("active");
      } else if (daysAhead === 5) {
        if (preset5DayBtn) preset5DayBtn.classList.add("active");
      } else if (daysAhead === 7) {
        if (presetWeekBtn) presetWeekBtn.classList.add("active");
      }

      // Dismiss error button
      errorDismissBtn &&
        errorDismissBtn.addEventListener("click", () => {
          hideError();
        });

      // ZIP input handlers are set up earlier (around line 4125)

      shortcutsModalEl &&
        shortcutsModalEl.addEventListener("click", (e) => {
          if (e.target === shortcutsModalEl) {
            hideShortcutsModal();
          }
        });

      // Global keyboard shortcuts
      document.addEventListener("keydown", (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable
        ) {
          // Allow Escape to work even in inputs
          if (e.key === "Escape") {
            e.target.blur();
            if (shortcutsModalEl && shortcutsModalEl.style.display !== "none") {
              hideShortcutsModal();
            }
            if (expiredModalEl && expiredModalEl.style.display !== "none") {
              hideExpiredSelectionModal();
            }
            clearHighlight();
          }
          return;
        }

        // C - Clear highlight
        if (e.key === "c" || e.key === "C") {
          clearHighlight();
        }

        // S - Share/copy selection URL
        if (e.key === "s" || e.key === "S") {
          if (selectionRange) {
            const url = generateShareURL(
              selectionRange.startTime,
              selectionRange.endTime
            );
            copyToClipboard(url).then((success) => {
              if (success) {
                showNotification(
                  "Link copied to clipboard! Share this URL to show this time range.",
                  "success"
                );
              } else {
                showNotification(
                  "Failed to copy to clipboard. URL: " + url,
                  "error",
                  5000
                );
              }
            });
          }
        }

        // F - Toggle Fahrenheit
        if (e.key === "f" || e.key === "F") {
          if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
            setUnit(unit === "F" ? "C" : "F");
          }
        }

        // ? or H - Show shortcuts help
        if (e.key === "?" || e.key === "h" || e.key === "H") {
          if (e.key === "?" || (!e.shiftKey && !e.ctrlKey && !e.metaKey)) {
            showShortcutsModal();
          }
        }

        // Escape - Close modals, or clear the selection
        if (e.key === "Escape") {
          if (shortcutsModalEl && shortcutsModalEl.style.display !== "none") {
            hideShortcutsModal();
          } else if (
            expiredModalEl &&
            expiredModalEl.style.display !== "none"
          ) {
            hideExpiredSelectionModal();
          } else if (selectionRange) {
            clearHighlight();
          }
        }
      });
      // Parse URL parameters and apply settings. Returns true when the URL
      // named a place and its weather is loading.
      function applyURLParameters() {
        const params = new URLSearchParams(location.search);
        let loadingPlace = false;

        // Apply unit
        const urlUnit = params.get("unit");
        if (urlUnit === "C" || urlUnit === "F") {
          setUnit(urlUnit, { persist: false, rerender: false });
        }

        // Apply days ahead
        const urlDays = params.get("days");
        if (urlDays) {
          const days = parseInt(urlDays, 10);
          if (days >= 1 && days <= 7) {
            daysAhead = days;
            storageCacheSet(DAYS_AHEAD_KEY, String(daysAhead));
            if (els.daysAhead) els.daysAhead.value = daysAhead;
            updateChartTitle();
          }
        }

        // Apply location (lat/lon or zip)
        const urlLat = params.get("lat");
        const urlLon = params.get("lon");
        const urlZip = params.get("zip");
        const urlStart = params.get("start");
        const urlEnd = params.get("end");
        const hasHighlight = urlStart && urlEnd;

        if (urlLat && urlLon) {
          const lat = parseFloat(urlLat);
          const lon = parseFloat(urlLon);
          if (!isNaN(lat) && !isNaN(lon)) {
            primeWeatherForCoords(lat, lon, "shared location");
            loadingPlace = true;
          }
        } else if (urlZip) {
          const zip5 = normalizeZip(urlZip);
          if (zip5) {
            // Populate ZIP in input field
            if (zipEls.input) zipEls.input.value = zip5;
            updateZipClearButton();
            // Save ZIP to localStorage
            storageCacheSet(ZIP_KEY, zip5);

            // Only fetch weather if there's no highlight (highlight will wait for location)
            if (!hasHighlight) {
              loadingPlace = true;
              getCoordsForZip(zip5)
                .then(({ latitude, longitude, place }) =>
                  primeWeatherForCoords(
                    latitude,
                    longitude,
                    `ZIP ${zip5} (${place})`,
                    place
                  )
                )
                .catch(() => {});
            }
          }
        }

        // Apply time range selection
        if (hasHighlight) {
          try {
            const startTime = new Date(urlStart);
            const endTime = new Date(urlEnd);
            const now = new Date();

            // Check if time has passed
            if (endTime < now) {
              // Show modal instead of setting selectionRange
              showExpiredSelectionModal();
              return loadingPlace; // Don't set selectionRange if expired
            }
            // Still show the highlight if not expired
            selectionRange = { startTime, endTime };
            updateCardVisibility();
            // Update chart if it already exists
            if (vibeChart) {
              vibeChart.update("none");
            }

            // If we have a ZIP in URL, fetch weather for it now
            if (urlZip) {
              const zip5 = normalizeZip(urlZip);
              if (zip5) {
                getCoordsForZip(zip5)
                  .then(({ latitude, longitude, place }) =>
                    primeWeatherForCoords(
                      latitude,
                      longitude,
                      `ZIP ${zip5} (${place})`,
                      place
                    )
                  )
                  .catch(() => {});
              }
            }

            // Generate weather summary (will wait for timelineState if not ready)
            if (timelineState) {
              updateWeatherSummary();
            }
          } catch (e) {
            console.warn("Failed to parse time range from URL", e);
          }
        }
        return loadingPlace;
      }

      // Boot
      (() => {
        statusEl &&
          (statusEl.textContent = "Trying to get your local weather…");

        // Apply URL parameters first
        const params = new URLSearchParams(location.search);
        const urlZip = params.get("zip");
        const urlStart = params.get("start");
        const urlEnd = params.get("end");
        const hasUrlHighlight = urlStart && urlEnd;

        const loadingFromUrl = applyURLParameters();

        // If there's a ZIP in URL with a highlight, skip location request
        // Location will be requested when highlight is cleared
        if (hasUrlHighlight && urlZip) {
          // Don't request location yet - wait for highlight to be cleared
          if (lastCoords) {
            updateChartTitle();
          }
        } else if (!lastCoords && !loadingFromUrl) {
          // If no location was set from URL, use saved ZIP or prompt for browser location
          const savedZip = storageCacheGet(ZIP_KEY);
          if (savedZip && zipEls.input) {
            zipEls.input.value = savedZip;
            updateZipClearButton();
            getCoordsForZip(savedZip)
              .then(({ latitude, longitude, place }) =>
                primeWeatherForCoords(
                  latitude,
                  longitude,
                  `ZIP ${savedZip} (${place})`,
                  place
                )
              )
              .then(() => {
                hideError(); // Ensure error is hidden after successful weather fetch
                updateChartTitle(); // Update input display
              })
              .catch(() => useLocation());
          } else {
            // Prompt for browser location first, fall back to IP if denied
            useLocation();
          }
        } else {
          // Update chart title to show location even if set from URL
          updateChartTitle();
        }
      })();

    // Cleanup on page unload to prevent memory leaks
    window.addEventListener("beforeunload", () => {
      // Destroy chart instance
      if (vibeChart) {
        try {
          vibeChart.destroy();
          vibeChart = null;
        } catch (e) {
          console.warn("Error destroying chart:", e);
        }
      }

      // Clear timeouts
      if (chartUpdateTimeout) clearTimeout(chartUpdateTimeout);
      if (computeTimeout) clearTimeout(computeTimeout);
      if (pollTimer) clearTimeout(pollTimer);
      if (colorUpdateTimeout) clearTimeout(colorUpdateTimeout);
      if (calibrationUpdateTimeout) clearTimeout(calibrationUpdateTimeout);
    });
  });
})();
