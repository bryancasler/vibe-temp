(() => {
  // Load Chart.js dynamically
  const CHART_JS_URL =
    "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
  let CHART_READY = null;

  function loadScriptOnce(src) {
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
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }
  function ensureChartJs() {
    if (!CHART_READY) CHART_READY = loadScriptOnce(CHART_JS_URL);
    return CHART_READY;
  }

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
    const presetTodayBtn = $("#presetToday");
    const cardsContainer = $(".cards");
    const presetTomorrowBtn = $("#presetTomorrow");
    const presetDefaultBtn = $("#presetDefault");
    const preset3DaysBtn = $("#preset3Days");
    const presetWeekBtn = $("#presetWeek");
    const favoritesDropdown = $("#favoritesDropdown");
    const favoritesToggle = $("#favoritesToggle");
    const favoritesList = $("#favoritesList");
    const notificationsBtn = $("#notificationsBtn");
    const themeToggle = $("#themeToggle");

    // Theme management - respect browser preference by default
    // Note: Use localStorage directly here since storageCache isn't initialized yet
    const THEME_KEY = "vibeTheme";
    function getDefaultTheme() {
      // Check if user has a saved preference
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) return saved;

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

    function applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      currentTheme = theme;
      // Use localStorage directly since storageCache may not be initialized yet
      // The cache will be populated automatically on first access via storageCacheGet
      localStorage.setItem(THEME_KEY, theme);
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
      applyTheme(newTheme);
    }

    // Listen for system theme changes
    if (window.matchMedia) {
      window
        .matchMedia("(prefers-color-scheme: light)")
        .addEventListener("change", (e) => {
          // Only auto-update if user hasn't manually set a preference
          if (!storageCacheGet(THEME_KEY)) {
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
      // Cache shade card element to avoid repeated queries
      if (!els.shadeCard) {
        els.shadeCard = document.querySelector(".card--shade");
      }
      const shadeCard = els.shadeCard;

      // Only hide cards if selection is finalized (not during active selection)
      if (selectionRange && !isSelectingActive) {
        // Hide cards when selection is finalized
        if (els.sunCard) els.sunCard.style.display = "none";
        if (shadeCard) shadeCard.style.display = "none";
      } else {
        // Show cards when no selection
        // Sun card visibility depends on daylight
        if (els.sunCard) {
          els.sunCard.style.display = isDaylightNow() ? "" : "none";
        }
        if (shadeCard) shadeCard.style.display = "";

        // Update cards container class for dynamic width
        if (cardsContainer) {
          cardsContainer.classList.toggle(
            "sun-card-hidden",
            els.sunCard && els.sunCard.style.display === "none"
          );
        }
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
      shadeLabel: $("#shadeLabel"),
      sunLabel: $("#sunLabel"),
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
      nightShadingToggle: $("#nightShadingToggle"),
      nightLineDarkeningToggle: $("#nightLineDarkeningToggle"),
      useLocationBtn: $("#use-location"),
      sunCard: $("#sunCard"),
    };

    // Advanced Configuration Modal
    const advConfigBtn = $("#advConfigBtn");
    const advConfigModal = $("#advConfigModal");
    const advConfigClose = $("#advConfigClose");

    function openAdvConfig() {
      if (advConfigModal) {
        advConfigModal.style.display = "flex";
        updateAdvStats(); // Update stats when modal opens
        // Focus first input for accessibility
        const firstInput = advConfigModal.querySelector("input, select");
        if (firstInput) firstInput.focus();
      }
    }

    function closeAdvConfig() {
      if (advConfigModal) {
        advConfigModal.style.display = "none";
      }
    }

    if (advConfigBtn) {
      advConfigBtn.addEventListener("click", openAdvConfig);
    }
    if (advConfigClose) {
      advConfigClose.addEventListener("click", closeAdvConfig);
    }
    if (advConfigModal) {
      // Close on overlay click
      advConfigModal.addEventListener("click", (e) => {
        if (e.target === advConfigModal) {
          closeAdvConfig();
        }
      });
      // Close on ESC key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && advConfigModal.style.display !== "none") {
          closeAdvConfig();
        }
      });
    }

    // Units & ZIP
    const unitEls = { F: $("#unitF"), C: $("#unitC") };
    const zipEls = {
      input: $("#chartLocation"), // Now references the input in chart header
      status: null, // Status removed from advanced modal
    };

    // State
    const UNIT_KEY = "vibeUnit";
    const ZIP_KEY = "vibeZip";
    const DAYS_AHEAD_KEY = "vibeDaysAhead";
    const NIGHT_SHADING_KEY = "vibeNightShading";
    const NIGHT_LINE_DARKENING_KEY = "vibeNightLineDarkening";
    const FAVORITES_KEY = "vibeFavorites";
    const CHART_COLORS_KEY = "vibeChartColors";
    const TEMP_ZONES_KEY = "vibeTempZones";
    const HUMIDITY_VIS_KEY = "vibeHumidityVis";
    const SUN_MARKERS_KEY = "vibeSunMarkers";
    const RAIN_ICONS_KEY = "vibeRainIcons";
    const SNOW_ICONS_KEY = "vibeSnowIcons";
    const ICE_ICONS_KEY = "vibeIceIcons";
    const CALIBRATION_KEY = "vibeCalibration";
    // THEME_KEY is defined earlier (line 82) for getDefaultTheme()

    // localStorage cache layer to reduce repeated access
    const storageCache = new Map();
    const storageCacheGet = (key, defaultValue = null) => {
      if (!storageCache.has(key)) {
        const value = localStorage.getItem(key);
        storageCache.set(key, value !== null ? value : defaultValue);
      }
      return storageCache.get(key);
    };
    const storageCacheSet = (key, value) => {
      localStorage.setItem(key, value);
      storageCache.set(key, value);
    };
    const storageCacheRemove = (key) => {
      localStorage.removeItem(key);
      storageCache.delete(key);
    };

    // Initialize cached values
    let unit = storageCacheGet(UNIT_KEY, "F") === "C" ? "C" : "F";
    let daysAhead = parseInt(storageCacheGet(DAYS_AHEAD_KEY, "2"), 10);
    let nightShadingEnabled = storageCacheGet(NIGHT_SHADING_KEY) === "true";
    let nightLineDarkeningEnabled = storageCacheGet(NIGHT_LINE_DARKENING_KEY) === "true";
    let temperatureZonesEnabled = storageCacheGet(TEMP_ZONES_KEY) === "true";
    let humidityVisualizationEnabled =
      storageCacheGet(HUMIDITY_VIS_KEY) === "true";
    let sunMarkersEnabled =
      storageCacheGet(SUN_MARKERS_KEY, "true") !== "false";
    let rainIconsEnabled = storageCacheGet(RAIN_ICONS_KEY, "true") !== "false";
    let snowIconsEnabled = storageCacheGet(SNOW_ICONS_KEY, "true") !== "false";
    let iceIconsEnabled = storageCacheGet(ICE_ICONS_KEY, "true") !== "false";

    // Calibration defaults
    const defaultCalibration = {
      humidityCoeff: 1 / 15, // 0.0667
      humidityBaseline: 40,
      windCoeff: 0.7,
      solarCoeff: 8,
      reflectCoeff: 4,
      cloudExp: 0.7,
    };

    // Load calibration from localStorage or use defaults
    let calibration = defaultCalibration;
    try {
      const saved = storageCacheGet(CALIBRATION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        calibration = { ...defaultCalibration, ...parsed };
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
    let favorites = JSON.parse(storageCacheGet(FAVORITES_KEY, "[]"));
    let chartColors = JSON.parse(
      storageCacheGet(CHART_COLORS_KEY) ||
        JSON.stringify({
          sun: { start: "#ffb86b", end: "#ff9500" },
          shade: { start: "#6ea8fe", end: "#4a90e2" },
        })
    );
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

    let timelineState = null; // { labels, shadeVals, sunVals, solarByHour, isDayByHour, windByHour, humidityByHour, precipitationByHour, weathercodeByHour, now } all in °F
    window.timelineState = null; // expose for tooltip use
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
      if (lastCoords) {
        params.set("lat", String(lastCoords.latitude));
        params.set("lon", String(lastCoords.longitude));
      }
      const savedZip = storageCacheGet(ZIP_KEY);
      if (savedZip) params.set("zip", savedZip);

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
            hour: time.getHours(),
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

    // Generate AI summary using free public API
    async function generateWeatherSummary(weatherData) {
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

      // Get vibe descriptions for key points
      const vibeDescriptions = [];
      const samplePoints = [
        dataPoints[0], // First point
        dataPoints[Math.floor(dataPoints.length / 2)], // Middle point
        dataPoints[dataPoints.length - 1], // Last point
      ].filter(Boolean);

      samplePoints.forEach((point) => {
        if (point.description) {
          vibeDescriptions.push(point.description);
        }
      });

      // Calculate representative temperature for the prompt
      const repTemp = stats.avgRepresentative || stats.avgShade;
      const maxRep = Math.max(stats.maxSun, stats.maxShade);
      const minRep = stats.minShade;

      // Format the prompt focusing on vibe temperatures
      const prompt = `Summarize how the weather will feel for a ${duration.toFixed(
        1
      )}-hour period from ${start.toLocaleString()} to ${end.toLocaleString()}.

Vibe temperature data (how it actually feels):
- Representative vibe: ${repTemp.toFixed(
        1
      )}${unitSuffix()} (typical feel during this period)
- Shade vibe: ${stats.avgShade.toFixed(
        1
      )}${unitSuffix()} (range: ${stats.minShade.toFixed(
        1
      )}-${stats.maxShade.toFixed(1)}${unitSuffix()})
- Sun vibe: ${stats.avgSun.toFixed(
        1
      )}${unitSuffix()} (range: ${stats.minSun.toFixed(
        1
      )}-${stats.maxSun.toFixed(1)}${unitSuffix()})
- Overall range: ${minRep.toFixed(1)}${unitSuffix()} to ${maxRep.toFixed(
        1
      )}${unitSuffix()}
- Daytime hours: ${stats.dayHours}, Nighttime hours: ${stats.nightHours}
${
  vibeDescriptions.length > 0
    ? `- Sample descriptions: ${vibeDescriptions.slice(0, 3).join(", ")}`
    : ""
}

Provide a brief, conversational summary (3-4 sentences) describing:
1. How it will FEEL during this time period based on the vibe temperatures
2. Clothing recommendations (what to wear for comfort)
3. Activity suggestions (what activities are suitable - e.g., hiking, staying indoors, outdoor sports)

Use the representative vibe as the primary temperature reference. Focus on comfort, what to wear, and suitable activities. Ignore actual air temperature - only use the vibe temperatures which represent how it actually feels.`;

      try {
        // Use Hugging Face Inference API with a free model
        // Try using a smaller, faster model that's more likely to be available
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(
          "https://api-inference.huggingface.co/models/google/flan-t5-base",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                max_length: 200,
                temperature: 0.7,
              },
            }),
            signal: controller.signal,
          }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          // If model is loading, wait a bit and try fallback
          if (response.status === 503) {
            throw new Error("Model is loading, using fallback");
          }
          throw new Error(`API error: ${response.status}`);
        }

        const result = await response.json();

        // Handle different response formats
        let summary = "";
        if (Array.isArray(result) && result[0]?.generated_text) {
          summary = result[0].generated_text.trim();
        } else if (result.generated_text) {
          summary = result.generated_text.trim();
        } else if (typeof result === "string") {
          summary = result.trim();
        } else if (Array.isArray(result) && result[0]?.summary_text) {
          summary = result[0].summary_text.trim();
        } else {
          // Fallback: generate a simple summary
          return generateFallbackSummary(weatherData);
        }

        // Clean up the summary (remove prompt if included)
        summary = summary.replace(prompt, "").trim();
        // Remove any leading/trailing quotes or formatting
        summary = summary.replace(/^["']|["']$/g, "").trim();
        if (summary.length === 0 || summary.length < 20) {
          return generateFallbackSummary(weatherData);
        }

        return summary;
      } catch (error) {
        console.warn("AI summary generation failed:", error);
        // Fallback to a simple generated summary
        return generateFallbackSummary(weatherData);
      }
    }

    // Generate fallback summary without AI (based on vibe temps)
    function generateFallbackSummary(weatherData) {
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

      const icon = getWeatherIcon();
      return `${icon} ${sentences.join(". ")}.`;
    }

    // Generate smart title for highlighted range
    function generateHighlightTitle(startTime, endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);

      const startDay = start.toLocaleDateString([], { weekday: "long" });
      const endDay = end.toLocaleDateString([], { weekday: "long" });
      const startHour = start.getHours();
      const endHour = end.getHours();

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
      const isSameDay = start.toDateString() === end.toDateString();

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
        const startDate = start.getDate();
        const endDate = end.getDate();
        const startMonth = start.getMonth();
        const endMonth = end.getMonth();
        const startYear = start.getFullYear();
        const endYear = end.getFullYear();

        // Check if consecutive days (same calendar date difference)
        const startDayOnly = new Date(startYear, startMonth, startDate);
        const endDayOnly = new Date(endYear, endMonth, endDate);
        const daysDiff = Math.round(
          (endDayOnly - startDayOnly) / (1000 * 60 * 60 * 24)
        );

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
        const startStr = start.toLocaleString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        const endStr = end.toLocaleString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
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

        const summary = await generateWeatherSummary(weatherData);

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

    function fmtHM(d) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    function fmtHMWithSmallAMPM(d) {
      const timeStr = d.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      // Split time and AM/PM, wrap AM/PM in span with smaller font
      // Handle both "6:43 AM" and "6:43AM" formats
      const parts = timeStr.split(/(\s*[AP]M)/i);
      if (parts.length === 3) {
        return `${parts[0]}<span class="time-ampm">${parts[1]}</span>`;
      }
      return timeStr;
    }
    function fmtHMS(d) {
      return d.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
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
    async function getCoordsForZip(zip5) {
      try {
        const r = await fetch(`https://api.zippopotam.us/us/${zip5}`);
        if (!r.ok) {
          if (r.status === 404) throw new Error("ZIP_NOT_FOUND");
          throw new Error("ZIP_LOOKUP_FAILED");
        }
        const data = await r.json();
        const p = data.places?.[0];
        if (!p) throw new Error("ZIP_NOT_FOUND");
        return {
          latitude: parseFloat(p.latitude),
          longitude: parseFloat(p.longitude),
          place: `${p["place name"]}, ${p["state abbreviation"]}`,
        };
      } catch (e) {
        if (e.message === "ZIP_NOT_FOUND") throw new Error("ZIP_NOT_FOUND");
        throw new Error("ZIP_LOOKUP_FAILED");
      }
    }
    async function getPlaceName(lat, lon) {
      try {
        const apiUrl = new URL(
          "https://geocoding-api.open-meteo.com/v1/reverse"
        );
        apiUrl.search = new URLSearchParams({
          latitude: lat,
          longitude: lon,
          language: "en",
          format: "json",
        });

        // Use CORS proxy for development (works in Simple Browser)
        // The proxy wraps the request to avoid CORS issues
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
          apiUrl.toString()
        )}`;

        const r = await fetch(proxyUrl);
        if (!r.ok) throw new Error("reverse geocode failed");
        const j = await r.json();
        const p = j?.results?.[0];
        if (!p) return "";
        const city = p.name || "";
        const admin = p.admin1 || p.admin2 || p.country || "";
        return admin && admin !== city ? `${city}, ${admin}` : city;
      } catch (e) {
        // Silently fail - location name is optional
        console.debug("Could not fetch location name:", e);
        return "";
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
          ? "Great in sun, cool in shade"
          : "Cool in shade, warm in sun";
      if (tempF < 65)
        return context === "sun"
          ? "Perfect in sun, cool otherwise"
          : "Cool; find sun";
      if (tempF < 70) return "Balanced, light layers";
      if (tempF < 75) return "Mild and comfy";
      if (tempF < 80) return "Warm and glowy";
      if (tempF < 85) return "Quite warm; shade helps";
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

    // Formulas
    function shadeVibeOf(T, RH, Wind) {
      return (
        T +
        (RH - calibration.humidityBaseline) / (1 / calibration.humidityCoeff) -
        calibration.windCoeff * Wind
      );
    }
    function sunVibeOf(shadeV, solarExposure, R) {
      // Only apply reflectivity when there's actual solar exposure
      const reflectivityEffect =
        solarExposure > 0 ? calibration.reflectCoeff * R : 0;
      return (
        shadeV + calibration.solarCoeff * solarExposure + reflectivityEffect
      );
    }
    function reflectivity() {
      const sel = parseFloat(els.reflect?.value ?? "0");
      if (sel === 0)
        return clamp(parseFloat(els.reflectCustom?.value ?? "0") || 0, 0, 1);
      return clamp(sel, 0, 1);
    }

    // Solar exposure
    function solarFromUVandCloud({
      uv_index,
      uv_index_clear_sky,
      cloud_cover,
      is_day,
    }) {
      const isDaylight = is_day === 1 || is_day === true;
      const baseUV =
        typeof uv_index_clear_sky === "number" && uv_index_clear_sky > 0
          ? uv_index / uv_index_clear_sky
          : typeof uv_index === "number"
          ? uv_index / 10
          : 0;
      const cloudAtten =
        1 - Math.pow((cloud_cover ?? 0) / 100, calibration.cloudExp);
      const solar = isDaylight ? baseUV * cloudAtten : 0;
      return clamp(solar, 0, 1);
    }

    // Compute card values (cards show °F/°C)
    function compute() {
      const Traw = parseFloat(els.temp?.value ?? "NaN");
      const RH = parseFloat(els.humidity?.value ?? "NaN");
      const Wind = parseFloat(els.wind?.value ?? "NaN");
      const Solar = parseFloat(els.solar?.value ?? "NaN");
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

      els.shade &&
        (els.shade.innerHTML = `${shadeDisplay.toFixed(1)}${unitSuffix()}`);
      els.sun &&
        (els.sun.innerHTML = `${sunDisplay.toFixed(1)}${unitSuffix()}`);

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

      if (!simActive && els.sunCard) {
        // Hide sun card if selection is active, otherwise show based on daylight
        if (selectionRange) {
          els.sunCard.style.display = "none";
        } else {
          els.sunCard.style.display = isDaylightNow() ? "" : "none";
        }
        // Update cards container class based on sun card visibility
        if (cardsContainer) {
          cardsContainer.classList.toggle(
            "sun-card-hidden",
            els.sunCard.style.display === "none"
          );
        }
      }
      statusEl && (statusEl.textContent = "Computed from current inputs.");
    }

    function autoSolarFromCloudCover(cloudCoverPct) {
      const solar = clamp(1 - cloudCoverPct / 100, 0.2, 1);
      els.solar && (els.solar.value = solar.toFixed(1));
      els.solarVal && (els.solarVal.textContent = solar.toFixed(1));
      return solar;
    }

    // API request cache and deduplication
    const apiRequestCache = new Map();
    const pendingRequests = new Map();
    const CACHE_TTL = 60000; // 1 minute cache TTL

    function getCacheKey(type, lat, lon, extra = "") {
      return `${type}_${lat.toFixed(4)}_${lon.toFixed(4)}_${extra}`;
    }

    function isCacheValid(entry) {
      return Date.now() - entry.timestamp < CACHE_TTL;
    }

    // API with error handling and request deduplication
    async function getCurrentWeather(lat, lon) {
      const cacheKey = getCacheKey("current", lat, lon);

      // Check cache
      if (apiRequestCache.has(cacheKey)) {
        const cached = apiRequestCache.get(cacheKey);
        if (isCacheValid(cached)) {
          return cached.data;
        }
      }

      // Check for pending request
      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
      }

      // Create new request
      const requestPromise = (async () => {
        try {
          const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            current:
              "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,is_day",
            temperature_unit: "fahrenheit",
            wind_speed_unit: "mph",
            timezone: "auto",
          });
          const r = await fetch(
            `https://api.open-meteo.com/v1/forecast?${params}`
          );
          if (!r.ok) {
            if (r.status === 429) {
              throw new Error("RATE_LIMIT");
            } else if (r.status >= 500) {
              throw new Error("SERVER_ERROR");
            } else {
              throw new Error(`API_ERROR_${r.status}`);
            }
          }
          const data = await r.json();
          if (!data.current) throw new Error("INVALID_RESPONSE");
          const result = data.current;

          // Cache the result
          apiRequestCache.set(cacheKey, {
            data: result,
            timestamp: Date.now(),
          });
          pendingRequests.delete(cacheKey);

          return result;
        } catch (e) {
          pendingRequests.delete(cacheKey);
          if (e.message === "RATE_LIMIT") throw new Error("RATE_LIMIT");
          if (e.message === "SERVER_ERROR") throw new Error("SERVER_ERROR");
          if (e.message.startsWith("API_ERROR_")) throw e;
          if (e.message === "INVALID_RESPONSE")
            throw new Error("INVALID_RESPONSE");
          throw new Error("NETWORK_ERROR");
        }
      })();

      pendingRequests.set(cacheKey, requestPromise);
      return requestPromise;
    }
    async function getHourlyWeather(lat, lon) {
      const cacheKey = getCacheKey("hourly", lat, lon);

      // Check cache
      if (apiRequestCache.has(cacheKey)) {
        const cached = apiRequestCache.get(cacheKey);
        if (isCacheValid(cached)) {
          return cached.data;
        }
      }

      // Check for pending request
      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey);
      }

      // Create new request
      const requestPromise = (async () => {
        try {
          const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            hourly:
              "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,is_day,precipitation,weathercode",
            temperature_unit: "fahrenheit",
            wind_speed_unit: "mph",
            timezone: "auto",
          });
          const r = await fetch(
            `https://api.open-meteo.com/v1/forecast?${params}`
          );
          if (!r.ok) {
            if (r.status === 429) {
              throw new Error("RATE_LIMIT");
            } else if (r.status >= 500) {
              throw new Error("SERVER_ERROR");
            } else {
              throw new Error(`API_ERROR_${r.status}`);
            }
          }
          const data = await r.json();
          if (!data.hourly) throw new Error("INVALID_RESPONSE");
          const result = data.hourly;

          // Cache the result
          apiRequestCache.set(cacheKey, {
            data: result,
            timestamp: Date.now(),
          });
          pendingRequests.delete(cacheKey);

          return result;
        } catch (e) {
          pendingRequests.delete(cacheKey);
          if (e.message === "RATE_LIMIT") throw new Error("RATE_LIMIT");
          if (e.message === "SERVER_ERROR") throw new Error("SERVER_ERROR");
          if (e.message.startsWith("API_ERROR_")) throw e;
          if (e.message === "INVALID_RESPONSE")
            throw new Error("INVALID_RESPONSE");
          throw new Error("NETWORK_ERROR");
        }
      })();

      pendingRequests.set(cacheKey, requestPromise);
      return requestPromise;
    }
    async function getDailySun(lat, lon, daysAheadParam = daysAhead) {
      try {
        const params = new URLSearchParams({
          latitude: lat,
          longitude: lon,
          daily: "sunrise,sunset",
          timezone: "auto",
          forecast_days: Math.max(daysAheadParam, 7), // Request at least 7 days to ensure we have enough
        });
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params}`
        );
        if (!r.ok) {
          if (r.status === 429) throw new Error("RATE_LIMIT");
          if (r.status >= 500) throw new Error("SERVER_ERROR");
          throw new Error(`API_ERROR_${r.status}`);
        }
        const data = await r.json();
        if (!data.daily) throw new Error("INVALID_RESPONSE");
        const rises = data?.daily?.sunrise?.map((t) => new Date(t)) ?? [];
        const sets = data?.daily?.sunset?.map((t) => new Date(t)) ?? [];
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
      } catch (e) {
        if (e.message === "RATE_LIMIT") throw new Error("RATE_LIMIT");
        if (e.message === "SERVER_ERROR") throw new Error("SERVER_ERROR");
        if (e.message.startsWith("API_ERROR_")) throw e;
        if (e.message === "INVALID_RESPONSE")
          throw new Error("INVALID_RESPONSE");
        throw new Error("NETWORK_ERROR");
      }
    }

    // Timeline
    function buildTimelineDataset(hourly, daysAheadParam = daysAhead) {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() + daysAheadParam);
      end.setHours(0, 0, 0, 0);

      const times = hourly.time.map((t) => new Date(t));
      const startIdx = times.findIndex((d) => d >= start);
      const endIdx = times.findIndex((d) => d >= end);
      const s = startIdx === -1 ? 0 : startIdx;
      const e = endIdx === -1 ? times.length : endIdx;

      const labels = [],
        shadeVals = [],
        sunVals = [],
        solarByHour = [],
        isDayByHour = [],
        windByHour = [],
        humidityByHour = [],
        precipitationByHour = [],
        weathercodeByHour = [];

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
          is_day: isDay ? 1 : 0,
        });
        const sun = sunVibeOf(shade, solar, reflectivity());

        labels.push(times[i]);
        shadeVals.push(parseFloat(shade.toFixed(1))); // °F
        sunVals.push(parseFloat(sun.toFixed(1))); // °F
        solarByHour.push(solar);
        isDayByHour.push(isDay ? 1 : 0);
        windByHour.push(Wind ?? 0);
        humidityByHour.push(RH ?? 0);
        precipitationByHour.push(precip);
        weathercodeByHour.push(wmo);
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
        now,
      };
    }
    function hourKey(d) {
      const k = new Date(d);
      k.setMinutes(0, 0, 0);
      return k.getTime();
    }

    function nearestLabelIndex(labelDates, target) {
      if (!target) return -1;
      const tg = new Date(target);
      tg.setMinutes(0, 0, 0);
      let bestIdx = -1,
        bestDiff = Infinity;
      for (let i = 0; i < labelDates.length; i++) {
        const d = new Date(labelDates[i]);
        d.setMinutes(0, 0, 0);
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
      if (isLocationError) {
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
                `ZIP ${zip5} (${place})`
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
        d.toLocaleString([], { weekday: "short", hour: "numeric" })
      );
      const nowIdx = labels.findIndex((d) => hourKey(d) === hourKey(now));
      const markers = buildSunMarkers(labels);

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
        const hour = date.getHours();
        const minute = date.getMinutes();
        if (minute !== 0) return ""; // Only show labels on the hour
        const period = hour >= 12 ? "pm" : "am";
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}${period}`;
      }

      // Helper to format day (e.g., "Fri")
      function formatDay(date) {
        return date.toLocaleDateString([], { weekday: "short" });
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
            if (prevDate.getDate() !== currDate.getDate()) {
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
          if (!sunTimes.sunrises || sunTimes.sunrises.length === 0) {
            // Fallback to legacy properties
            if (!sunTimes.sunriseToday || !sunTimes.sunsetToday) return;
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

          // Get all sunrise/sunset events in the visible range
          const events = [];

          // Use arrays if available, otherwise fall back to legacy properties
          const sunrises =
            sunTimes.sunrises && sunTimes.sunrises.length > 0
              ? sunTimes.sunrises
              : (sunTimes.sunriseToday ? [sunTimes.sunriseToday] : []).concat(
                  sunTimes.sunriseTomorrow ? [sunTimes.sunriseTomorrow] : []
                );
          const sunsets =
            sunTimes.sunsets && sunTimes.sunsets.length > 0
              ? sunTimes.sunsets
              : (sunTimes.sunsetToday ? [sunTimes.sunsetToday] : []).concat(
                  sunTimes.sunsetTomorrow ? [sunTimes.sunsetTomorrow] : []
                );

          // Add all sunrise/sunset events with their actual times
          sunrises.forEach((time) => {
            if (time) {
              const timeDate = new Date(time);
              // Only include if within the visible range
              const firstLabel = new Date(labels[0]);
              const lastLabel = new Date(labels[labels.length - 1]);
              if (timeDate >= firstLabel && timeDate <= lastLabel) {
                events.push({ time: timeDate, type: "sunrise" });
              }
            }
          });
          sunsets.forEach((time) => {
            if (time) {
              const timeDate = new Date(time);
              // Only include if within the visible range
              const firstLabel = new Date(labels[0]);
              const lastLabel = new Date(labels[labels.length - 1]);
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
          const chartStartTime = new Date(labels[0]);
          const chartEndTime = new Date(labels[labels.length - 1]);

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

          // Get the default tick positions
          const ticks = xScale.ticks;
          if (!ticks || ticks.length === 0) return;

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

          // Filter ticks to prevent overlap
          const visibleTicks = [];
          let lastX = -Infinity;

          ticks.forEach((tick) => {
            const tickValue = tick.value;
            if (
              typeof tickValue !== "number" ||
              tickValue < 0 ||
              tickValue >= labels.length
            )
              return;

            const date = new Date(labels[tickValue]);
            const x = xScale.getPixelForValue(tickValue);

            // Only consider ticks within chart area
            if (x < chartArea.left || x > chartArea.right) return;

            // Check if this tick is far enough from the last one
            if (x - lastX >= minSpacing || visibleTicks.length === 0) {
              visibleTicks.push({ tick, x, date });
              lastX = x;
            } else {
              // If too close, prefer keeping the first and last ticks
              const isFirst = visibleTicks.length === 0;
              const isLast = tick === ticks[ticks.length - 1];
              if (isFirst || isLast) {
                // For first/last, replace the previous if this one is more important
                if (visibleTicks.length > 0 && !isFirst) {
                  visibleTicks.pop();
                }
                visibleTicks.push({ tick, x, date });
                lastX = x;
              }
            }
          });

          // Always include first and last ticks if they exist
          const firstTick = ticks[0];
          const lastTick = ticks[ticks.length - 1];
          const firstTickValue = firstTick?.value;
          const lastTickValue = lastTick?.value;

          if (
            typeof firstTickValue === "number" &&
            firstTickValue >= 0 &&
            firstTickValue < labels.length
          ) {
            const firstX = xScale.getPixelForValue(firstTickValue);
            if (firstX >= chartArea.left && firstX <= chartArea.right) {
              const firstDate = new Date(labels[firstTickValue]);
              if (!visibleTicks.find((t) => t.tick === firstTick)) {
                visibleTicks.unshift({
                  tick: firstTick,
                  x: firstX,
                  date: firstDate,
                });
              }
            }
          }

          if (
            typeof lastTickValue === "number" &&
            lastTickValue >= 0 &&
            lastTickValue < labels.length
          ) {
            const lastX = xScale.getPixelForValue(lastTickValue);
            if (lastX >= chartArea.left && lastX <= chartArea.right) {
              const lastDate = new Date(labels[lastTickValue]);
              if (!visibleTicks.find((t) => t.tick === lastTick)) {
                visibleTicks.push({ tick: lastTick, x: lastX, date: lastDate });
              }
            }
          }

          // Sort by x position and remove duplicates
          visibleTicks.sort((a, b) => a.x - b.x);
          const finalTicks = [];
          lastX = -Infinity;
          visibleTicks.forEach((item) => {
            if (item.x - lastX >= minSpacing || finalTicks.length === 0) {
              finalTicks.push(item);
              lastX = item.x;
            }
          });

          // Draw the filtered ticks
          finalTicks.forEach((item) => {
            const x = item.x;
            const date = item.date;

            // Draw time on top line
            const timeStr = formatTime(date);
            if (timeStr) {
              const timeY = chartArea.bottom + 8;
              ctx.fillText(timeStr, x, timeY);

              // Draw day on bottom line, centered under the time
              const dayStr = formatDay(date);
              const dayY = chartArea.bottom + 24;
              ctx.fillText(dayStr, x, dayY);
            }
          });

          ctx.restore();
        },
      };

      // Vertical line for current time in same green as the clock
      const currentLine = {
        id: "currentLine",
        afterDatasetsDraw(chart) {
          if (nowIdx === -1) return;
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

      // Wind chill indicator plugin - shows when wind significantly affects feel
      const windChillPlugin = {
        id: "windChill",
        afterDatasetsDraw(chart) {
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
            const minutes = date.getMinutes();

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

          // Helper function to interpolate y position for a given x position on a bezier curve
          function getYOnBezierCurve(p1, p2, cp1x, cp1y, cp2x, cp2y, x) {
            // Binary search to find t value that gives us the desired x
            let t = 0.5;
            let iterations = 20;
            for (let i = 0; i < iterations; i++) {
              const bezierX =
                Math.pow(1 - t, 3) * p1.x +
                3 * Math.pow(1 - t, 2) * t * cp1x +
                3 * (1 - t) * Math.pow(t, 2) * cp2x +
                Math.pow(t, 3) * p2.x;

              if (Math.abs(bezierX - x) < 0.1) break;

              if (bezierX < x) {
                t = t + (1 - t) / 2;
              } else {
                t = t / 2;
              }
            }

            // Calculate y at this t
            return (
              Math.pow(1 - t, 3) * p1.y +
              3 * Math.pow(1 - t, 2) * t * cp1y +
              3 * (1 - t) * Math.pow(t, 2) * cp2y +
              Math.pow(t, 3) * p2.y
            );
          }

          // Helper function to subdivide a bezier curve at parameter t using de Casteljau's algorithm
          // Returns control points for the first portion of the curve (from p1 to point at t)
          // Parameters: p1 (start point), p2 (end point), cp1x/cp1y (first control point), cp2x/cp2y (second control point), t (0-1)
          // Returns: { cp1x, cp1y, cp2x, cp2y, endX, endY } where endX/endY is the point at t
          function subdivideBezier(p1, p2, cp1x, cp1y, cp2x, cp2y, t) {
            // De Casteljau's algorithm for cubic bezier subdivision
            // For a cubic bezier: P(t) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
            // Where P0=p1, P1=cp1, P2=cp2, P3=p2
            
            // Intermediate points for subdivision
            const q0x = p1.x;
            const q0y = p1.y;
            const q1x = (1 - t) * p1.x + t * cp1x;
            const q1y = (1 - t) * p1.y + t * cp1y;
            const q2x = (1 - t) * cp1x + t * cp2x;
            const q2y = (1 - t) * cp1y + t * cp2y;
            const q3x = (1 - t) * cp2x + t * p2.x;
            const q3y = (1 - t) * cp2y + t * p2.y;
            
            const r0x = (1 - t) * q0x + t * q1x;
            const r0y = (1 - t) * q0y + t * q1y;
            const r1x = (1 - t) * q1x + t * q2x;
            const r1y = (1 - t) * q1y + t * q2y;
            const r2x = (1 - t) * q2x + t * q3x;
            const r2y = (1 - t) * q2y + t * q3y;
            
            const s0x = (1 - t) * r0x + t * r1x;
            const s0y = (1 - t) * r0y + t * r1y;
            const s1x = (1 - t) * r1x + t * r2x;
            const s1y = (1 - t) * r1y + t * r2y;
            
            // The point at t
            const endX = (1 - t) * s0x + t * s1x;
            const endY = (1 - t) * s0y + t * s1y;
            
            // Control points for the first portion: p1 (q0), r0, s0, end point
            return {
              cp1x: r0x,
              cp1y: r0y,
              cp2x: s0x,
              cp2y: s0y,
              endX: endX,
              endY: endY
            };
          }

          // Helper function to check if a time is nighttime (between sunset and sunrise)
          function isNighttime(time) {
            if (!time || !sunTimes.sunrises || !sunTimes.sunsets) return false;
            const timeMs = new Date(time).getTime();

            // Get all sunrise and sunset times, sorted
            const allEvents = [
              ...sunTimes.sunsets.map((t) => ({
                time: new Date(t).getTime(),
                type: "sunset",
              })),
              ...sunTimes.sunrises.map((t) => ({
                time: new Date(t).getTime(),
                type: "sunrise",
              })),
            ].sort((a, b) => a.time - b.time);

            if (allEvents.length === 0) return false;

            // Find the most recent event before or at this time
            let lastEvent = null;
            for (let i = 0; i < allEvents.length; i++) {
              if (allEvents[i].time <= timeMs) {
                lastEvent = allEvents[i];
              } else {
                break;
              }
            }

            // If no event found, check if we're before the first event
            if (!lastEvent) {
              // Before first event - check if it's a sunrise (day) or sunset (night)
              return allEvents[0].type === "sunset";
            }

            // If last event was a sunset, we're in nighttime
            // If last event was a sunrise, we're in daytime
            return lastEvent.type === "sunset";
          }

          datasets.forEach((dataset, datasetIndex) => {
            if (
              dataset.label === "Sun Vibe" ||
              dataset.label === "Shade Vibe"
            ) {
              const meta = chart.getDatasetMeta(datasetIndex);
              if (!meta || !meta.data || meta.data.length === 0) return;

              ctx.save();
              ctx.lineWidth = 3;
              ctx.lineJoin = "round";
              ctx.lineCap = "round";

              const points = meta.data;

              // Dark blue color for night
              const nightColor = "#2d4a6b";

              // Day colors
              const dayColors =
                dataset.label === "Sun Vibe"
                  ? chartColors.sun
                  : chartColors.shade;

              if (points.length === 0) {
                ctx.restore();
                return;
              }

              if (points.length === 1) {
                // Single point
                const time = rawLabels[0];
                const isDay = !isNighttime(time);
                ctx.strokeStyle = isDay || !nightLineDarkeningEnabled ? dayColors.start : nightColor;
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                ctx.lineTo(points[0].x, points[0].y);
                ctx.stroke();
                ctx.restore();
                return;
              }

              // Build list of all points to draw, including sunset/sunrise splits
              const drawPoints = [];

              // Get all sunrise/sunset events
              const allEvents = [
                ...sunTimes.sunsets.map((t) => ({
                  time: new Date(t).getTime(),
                  type: "sunset",
                })),
                ...sunTimes.sunrises.map((t) => ({
                  time: new Date(t).getTime(),
                  type: "sunrise",
                })),
              ].sort((a, b) => a.time - b.time);

              // Process each segment between consecutive data points
              for (let i = 0; i < points.length; i++) {
                const point = points[i];
                const time = rawLabels[i];
                const timeMs = new Date(time).getTime();
                const isDay = !isNighttime(time);

                // Add the data point
                drawPoints.push({
                  x: point.x,
                  y: point.y,
                  time: timeMs,
                  isDay: isDay,
                });

                // If this is not the last point, check for events between this and next point
                if (i < points.length - 1) {
                  const nextTime = rawLabels[i + 1];
                  const nextTimeMs = new Date(nextTime).getTime();

                  // Find events between this point and the next
                  const eventsBetween = allEvents.filter(
                    (e) => e.time > timeMs && e.time < nextTimeMs
                  );

                  // Add split points for each event
                  for (const event of eventsBetween) {
                    const eventX = getPixelForExactTime(new Date(event.time));
                    // Linear interpolation for y value between current and next point
                    const nextPoint = points[i + 1];
                    const t = (event.time - timeMs) / (nextTimeMs - timeMs);
                    const eventY = point.y + (nextPoint.y - point.y) * t;

                    drawPoints.push({
                      x: eventX,
                      y: eventY,
                      time: event.time,
                      isDay: event.type === "sunrise",
                    });
                  }
                }
              }

              // Sort all points by time to ensure correct order
              drawPoints.sort((a, b) => a.time - b.time);

              // Remove duplicates (points at the same time)
              const uniqueDrawPoints = [];
              const seenTimes = new Set();
              for (const dp of drawPoints) {
                const timeKey = Math.floor(dp.time / 1000); // Round to nearest second
                if (!seenTimes.has(timeKey)) {
                  seenTimes.add(timeKey);
                  uniqueDrawPoints.push(dp);
                }
              }

              // Draw lines between consecutive points
              if (uniqueDrawPoints.length > 1) {
                for (let i = 0; i < uniqueDrawPoints.length - 1; i++) {
                  const p1 = uniqueDrawPoints[i];
                  const p2 = uniqueDrawPoints[i + 1];

                  // Determine color based on day/night status
                  if ((p1.isDay && p2.isDay) || !nightLineDarkeningEnabled) {
                    ctx.strokeStyle = dayColors.start;
                  } else {
                    ctx.strokeStyle = nightColor;
                  }

                  ctx.beginPath();
                  ctx.moveTo(p1.x, p1.y);
                  ctx.lineTo(p2.x, p2.y);
                  ctx.stroke();
                }
              }

              ctx.restore();
            }
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
          interaction: { mode: "index", intersect: false },
          animation: false,
          animations: {
            x: false,
            y: false,
            colors: false,
            numbers: false,
          },
          layout: {
            padding: {
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
            tooltip: {
              itemSort: (a, b) => {
                const order = ["Sun Vibe", "Shade Vibe", "Highlighted Vibes"];
                return (
                  order.indexOf(a.dataset.label) -
                  order.indexOf(b.dataset.label)
                );
              },
              filter: (item) => item.dataset.label !== "Highlighted Vibes", // Hide highlight from tooltip
              external: (context) => {
                // Check if hovering near a sun marker
                const chart = context.chart;
                const markerPositions = chart._sunMarkerPositions || [];
                if (!markerPositions.length) return;

                const canvasPosition = Chart.helpers.getRelativePosition(
                  context.event,
                  chart
                );
                const chartArea = chart.chartArea;

                // Check if mouse is near any marker (within 20px)
                for (const marker of markerPositions) {
                  const dx = canvasPosition.x - marker.x;
                  const dy = canvasPosition.y - marker.y;
                  const distance = Math.sqrt(dx * dx + dy * dy);

                  if (distance < 20) {
                    // Show custom tooltip for sun marker
                    const timeStr = fmtHM(new Date(marker.time));
                    const tooltip = chart.tooltip;
                    tooltip.setContent({
                      title: `${marker.label}`,
                      body: [{ lines: [timeStr] }],
                    });
                    tooltip.opacity = 1;
                    tooltip.update(true);
                    return;
                  }
                }

                // Not near a marker, use default tooltip
                const tooltip = chart.tooltip;
                tooltip.opacity = 0;
              },
              callbacks: {
                // Keep the time label as title, with sunrise/sunset info if near
                title: (items) => {
                  const defaultTitle = items?.[0]?.label ?? "";
                  if (!items || items.length === 0) return defaultTitle;

                  // Get the hovered time from the first item
                  const item = items[0];
                  const dataIndex = item.dataIndex;
                  const chart = item.chart;
                  const rawLabels = chart._rawLabels || [];
                  const sunTimes = chart._sunTimes || {
                    sunrises: [],
                    sunsets: [],
                  };

                  if (dataIndex >= 0 && dataIndex < rawLabels.length) {
                    const hoveredTime = new Date(rawLabels[dataIndex]);
                    const hoveredTimeMs = hoveredTime.getTime();
                    const twoHoursMs = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

                    // Check all sunrises and sunsets
                    const allEvents = [
                      ...sunTimes.sunrises.map((t) => ({
                        time: new Date(t).getTime(),
                        type: "sunrise",
                        label: "Sunrise",
                      })),
                      ...sunTimes.sunsets.map((t) => ({
                        time: new Date(t).getTime(),
                        type: "sunset",
                        label: "Sunset",
                      })),
                    ];

                    // Find events within 2 hours before or after
                    const nearbyEvents = allEvents.filter((e) => {
                      const timeDiff = Math.abs(e.time - hoveredTimeMs);
                      return timeDiff <= twoHoursMs;
                    });

                    if (nearbyEvents.length > 0) {
                      // Sort events by time difference
                      const sortedEvents = nearbyEvents
                        .map((e) => ({
                          ...e,
                          diff: Math.abs(e.time - hoveredTimeMs),
                        }))
                        .sort((a, b) => a.diff - b.diff);

                      // Build inline tooltip: "Fri, 6pm - Sunset 6:35pm"
                      const eventStrings = sortedEvents.map((event) => {
                        const exactTime = fmtHM(new Date(event.time));
                        return `${event.label} ${exactTime}`;
                      });

                      // Combine with default title
                      return `${defaultTitle} - ${eventStrings.join(", ")}`;
                    }
                  }

                  return defaultTitle;
                },
                // Custom label with color indicator: "● Sun: 84.9° Balanced, light layers"
                label: (ctx) => {
                  if (ctx.dataset.label === "Highlighted Vibes") return null; // Don't show in tooltip
                  const short =
                    ctx.dataset.label === "Sun Vibe" ? "Sun" : "Shade";
                  const tempDisplay = Number(ctx.parsed.y).toFixed(1); // already in current unit
                  // Get color for the dataset
                  const isSun = ctx.dataset.label === "Sun Vibe";
                  const color = isSun
                    ? chartColors.sun.start
                    : chartColors.shade.start;
                  let desc = "";
                  try {
                    const i = ctx.dataIndex;
                    const ts = window.timelineState;
                    if (ts && Number.isFinite(i)) {
                      const isDay = !!ts.isDayByHour?.[i];
                      const solar = ts.solarByHour?.[i] ?? 0;
                      const tempF =
                        ctx.dataset.label === "Sun Vibe"
                          ? ts.sunVals?.[i]
                          : ts.shadeVals?.[i]; // °F
                      const context =
                        ctx.dataset.label === "Sun Vibe" ? "sun" : "shade";
                      if (typeof tempF === "number") {
                        desc =
                          vibeDescriptor(tempF, { solar, isDay, context }) ||
                          "";
                      }
                    }
                  } catch {}
                  // Return label (color is shown via labelColor callback)
                  return desc
                    ? `${short}: ${tempDisplay}° ${desc}`
                    : `${short}: ${tempDisplay}°`;
                },
                labelColor: (ctx) => {
                  // Return color for the tooltip item indicator
                  if (ctx.dataset.label === "Sun Vibe") {
                    return {
                      borderColor: chartColors.sun.start,
                      backgroundColor: chartColors.sun.start,
                    };
                  } else if (ctx.dataset.label === "Shade Vibe") {
                    return {
                      borderColor: chartColors.shade.start,
                      backgroundColor: chartColors.shade.start,
                    };
                  }
                  return {
                    borderColor: ctx.dataset.borderColor,
                    backgroundColor: ctx.dataset.backgroundColor,
                  };
                },
              },
            },
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
          windChillPlugin,
          precipitationIconsPlugin,
          timelineLabelsPlugin,
        ],
      });

      // Store raw labels and other data on chart instance for plugins and optimization
      vibeChart._rawLabels = labels;
      vibeChart._markers = markers;
      vibeChart._nowIdx = nowIdx;
      vibeChart._isDayByHour = isDayByHour;
      vibeChart._sunTimes = sunTimes; // Store sunrise/sunset times for exact day/night detection

      // Hide skeleton immediately after chart is created
      hideChartLoading();

      // Update card visibility based on current time
      updateCardVisibility();

      // Pointer interactions: hover + tap/drag simulation + drag selection
      els.chartCanvas.style.touchAction = "none";
      let isPointerDown = false;
      let isSelecting = false;
      let selectionStartX = null;
      let selectionStartTime = null;
      let touchStartTime = null;
      let hasMoved = false;

      function updateFromClientX(clientX) {
        if (!vibeChart || !timelineState) return;
        const rect = els.chartCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const idxFloat = vibeChart.scales.x.getValueForPixel(x);
        const idx = Math.round(idxFloat);
        if (
          Number.isFinite(idx) &&
          idx >= 0 &&
          idx < timelineState.labels.length
        ) {
          simActive = true;
          paintSimulatedIndex(idx);
        }
      }

      function getTimeFromClientX(clientX) {
        if (!vibeChart || !timelineState) return null;
        const rect = els.chartCanvas.getBoundingClientRect();
        const x = clientX - rect.left;
        return pixelToTime(x, timelineState.labels, vibeChart.scales);
      }

      els.chartCanvas.addEventListener("pointerdown", (e) => {
        // Check if shift key is held for selection mode
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          isSelecting = true;
          isSelectingActive = true; // Mark that selection is in progress
          selectionStartX = e.clientX;
          selectionStartTime = getTimeFromClientX(e.clientX);
          try {
            els.chartCanvas.setPointerCapture(e.pointerId);
          } catch {}
          e.preventDefault();
        } else {
          isPointerDown = true;
          try {
            els.chartCanvas.setPointerCapture(e.pointerId);
          } catch {}
          updateFromClientX(e.clientX);
        }
      });

      els.chartCanvas.addEventListener("pointermove", (e) => {
        if (isSelecting && selectionStartTime) {
          hasMoved = true;
          // Prevent scrolling on mobile during selection
          if (e.pointerType === "touch") {
            e.preventDefault();
          }
          const currentTime = getTimeFromClientX(e.clientX);
          if (currentTime && selectionStartTime) {
            const startTime =
              currentTime < selectionStartTime
                ? currentTime
                : selectionStartTime;
            const endTime =
              currentTime > selectionStartTime
                ? currentTime
                : selectionStartTime;
            selectionRange = { startTime, endTime };
            // Don't call updateCardVisibility() here - keep cards visible during selection
            vibeChart.update("none");
          }
        } else {
          const isMouse = e.pointerType === "mouse";
          if (isMouse || isPointerDown) updateFromClientX(e.clientX);
        }
      });

      function endPointer(e) {
        if (isSelecting && selectionStartTime) {
          const isTouch = e.pointerType === "touch";
          const endTime = getTimeFromClientX(e.clientX);

          // For touch, check if it was a tap (not a drag) - if so, don't create selection
          if (isTouch && !hasMoved && Date.now() - touchStartTime < 300) {
            // It was a tap, not a drag - just show the value at that point
            isSelecting = false;
            selectionStartX = null;
            selectionStartTime = null;
            isPointerDown = false;
            try {
              els.chartCanvas.releasePointerCapture(e.pointerId);
            } catch {}
            return;
          }

          if (endTime && selectionStartTime) {
            const startTime =
              endTime < selectionStartTime ? endTime : selectionStartTime;
            const finalEndTime =
              endTime > selectionStartTime ? endTime : selectionStartTime;

            // Only create selection if it's meaningful (at least 5 minutes)
            const duration = Math.abs(finalEndTime - startTime);
            if (duration >= 5 * 60 * 1000) {
              selectionRange = { startTime, endTime: finalEndTime };
              isSelectingActive = false; // Selection is now finalized
              updateCardVisibility(); // Now hide the cards
              vibeChart.update("none");

              // Copy URL to clipboard and update browser URL
              const url = generateShareURL(startTime, finalEndTime);

              // Update browser URL without page refresh
              const urlObj = new URL(url);
              history.pushState({}, "", urlObj.pathname + urlObj.search);

              (async () => {
                const success = await copyToClipboard(url);
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
              })();

              // Generate weather summary
              updateWeatherSummary();
            } else {
              // Selection too short, clear it
              clearHighlight();
            }
          }
          isSelecting = false;
          isSelectingActive = false; // Selection is complete (either finalized or cancelled)
          selectionStartX = null;
          selectionStartTime = null;
          hasMoved = false;
          touchStartTime = null;
          try {
            els.chartCanvas.releasePointerCapture(e.pointerId);
          } catch {}
        } else {
          isPointerDown = false;
          try {
            els.chartCanvas.releasePointerCapture(e.pointerId);
          } catch {}
        }
      }

      els.chartCanvas.addEventListener("pointerup", endPointer);
      els.chartCanvas.addEventListener("pointercancel", endPointer);
      els.chartCanvas.addEventListener("pointerleave", (e) => {
        if (isSelecting) {
          endPointer(e);
        } else {
          if (simActive) paintRealtimeCards();
          simActive = false;
        }
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
      if (els.sunCard) {
        // Hide sun card if selection is active, otherwise show based on daylight
        if (selectionRange) {
          els.sunCard.style.display = "none";
        } else {
          els.sunCard.style.display = isDaylightNow() ? "" : "none";
        }
        // Update cards container class based on sun card visibility
        if (cardsContainer) {
          cardsContainer.classList.toggle(
            "sun-card-hidden",
            els.sunCard.style.display === "none"
          );
        }
      }
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

      els.shade &&
        (els.shade.innerHTML = `${shadeDisp.toFixed(1)}${unitSuffix()}`);

      // Update sun card content during hover (make it visible even at night to show sunrise time)
      // But don't show it if a highlight is active
      if (els.sun && els.sunCard && !selectionRange) {
        // Make card visible during hover if it's night (to show sunrise time)
        if (!isDay && els.sunCard.style.display === "none") {
          els.sunCard.style.display = "";
          if (cardsContainer) {
            cardsContainer.classList.remove("sun-card-hidden");
          }
        }

        if (!isDay) {
          // At night: show next sunrise time
          const hoverTimeMs = dt.getTime();
          const nextSunrise = (sunTimes.sunrises || [])
            .map((t) => new Date(t).getTime())
            .find((sunriseMs) => sunriseMs > hoverTimeMs);

          if (nextSunrise) {
            els.sun.innerHTML = `\u{1F31E} at ${fmtHMWithSmallAMPM(
              new Date(nextSunrise)
            )}`;
            // Hide description section when showing sunrise time
            if (els.sunLabel) els.sunLabel.style.display = "none";
          } else {
            // No sunrise found, fallback to temp
            els.sun.innerHTML = `${sunDisp.toFixed(1)}${unitSuffix()}`;
            // Show description section when showing temperature
            if (els.sunLabel) els.sunLabel.style.display = "";
          }
        } else {
          // During day: show temperature
          els.sun.innerHTML = `${sunDisp.toFixed(1)}${unitSuffix()}`;
        }
      }

      const simSolar = solarByHour[i];
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
    function scheduleNextTick(minutes) {
      const ms = Math.max(0.5, parseFloat(minutes) || 1) * 60 * 1000;
      nextUpdateAt = new Date(Date.now() + ms);
      els.nextUpdated && (els.nextUpdated.textContent = fmtHMS(nextUpdateAt));
      updateAdvStats();
      pollTimer = setTimeout(runUpdateCycle, ms);
    }
    async function runUpdateCycle() {
      if (!lastCoords) {
        scheduleNextTick(els.updateInterval?.value || 1);
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
        const [cur, hourlyMaybe] = await Promise.all([
          getCurrentWeather(latitude, longitude),
          wantHourly
            ? getHourlyWeather(latitude, longitude)
            : Promise.resolve(null),
        ]);

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
          const solar = solarFromUVandCloud({
            uv_index: cur.uv_index,
            uv_index_clear_sky: cur.uv_index_clear_sky,
            cloud_cover: cur.cloud_cover ?? 0,
            is_day: cur.is_day,
          });
          els.solar.value = solar.toFixed(1);
          els.solarVal.textContent = solar.toFixed(1);
        } else if (typeof cur.cloud_cover === "number") {
          autoSolarFromCloudCover(cur.cloud_cover);
        }

        compute();
        updateChartTitle();

        if (hourlyMaybe) {
          // Refetch sunrise/sunset data if needed (in case days ahead changed)
          try {
            const dailySun = await getDailySun(latitude, longitude, daysAhead);
            sunTimes = dailySun;
          } catch (e) {
            // If fetch fails, continue with existing sunTimes
          }
          // Only show loading if chart doesn't exist yet
          if (!vibeChart) showChartLoading();
          const ds = buildTimelineDataset(hourlyMaybe);
          timelineState = ds;
          window.timelineState = timelineState; // expose for tooltip descriptors
          await renderChart(
            ds.labels,
            ds.shadeVals,
            ds.sunVals,
            ds.now,
            ds.isDayByHour
          );
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
        scheduleNextTick(els.updateInterval?.value || 1);
      }
    }
    function restartScheduler() {
      clearPollTimer();
      scheduleNextTick(els.updateInterval?.value || 1);
    }

    // Prime weather
    async function primeWeatherForCoords(
      latitude,
      longitude,
      sourceLabel = ""
    ) {
      statusEl &&
        (statusEl.textContent = sourceLabel
          ? `Getting weather for ${sourceLabel}…`
          : "Getting weather…");
      // Only show loading if chart doesn't exist yet
      if (!vibeChart) showChartLoading();
      try {
        const [cur, hourly, dailySun] = await Promise.all([
          getCurrentWeather(latitude, longitude),
          getHourlyWeather(latitude, longitude),
          getDailySun(latitude, longitude, daysAhead),
        ]);
        sunTimes = dailySun;
        lastCoords = { latitude, longitude };

        currentPlaceName = await getPlaceName(latitude, longitude);
        updateChartTitle();
        updateAdvStats();

        const tempF = cur.temperature_2m ?? cur.apparent_temperature ?? null;
        if (tempF != null)
          els.temp.value = (unit === "F" ? tempF : fToC(tempF)).toFixed(1);
        els.humidity.value = (cur.relative_humidity_2m ?? "").toFixed(0);
        els.wind.value = (cur.wind_speed_10m ?? "").toFixed(1);
        if (typeof cur.is_day === "number") currentIsDay = cur.is_day;

        if (
          typeof cur.uv_index === "number" &&
          (typeof cur.is_day === "number" || typeof cur.is_day === "boolean")
        ) {
          const solar = solarFromUVandCloud({
            uv_index: cur.uv_index,
            uv_index_clear_sky: cur.uv_index_clear_sky,
            cloud_cover: cur.cloud_cover ?? 0,
            is_day: cur.is_day,
          });
          els.solar.value = solar.toFixed(1);
          els.solarVal.textContent = solar.toFixed(1);
        } else if (typeof cur.cloud_cover === "number") {
          autoSolarFromCloudCover(cur.cloud_cover);
        }

        compute();
        updateChartTitle();

        // Only show loading if chart doesn't exist yet
        if (!vibeChart) showChartLoading();
        const ds = buildTimelineDataset(hourly);
        timelineState = ds;
        window.timelineState = timelineState; // expose for tooltip descriptors
        await renderChart(
          ds.labels,
          ds.shadeVals,
          ds.sunVals,
          ds.now,
          ds.isDayByHour
        );
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

        // Check for notification conditions
        checkNotificationConditions();
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
        const item = document.createElement("div");
        item.className = "favorite-item";
        item.innerHTML = `
            <button class="favorite-name" data-lat="${fav.lat}" data-lon="${fav.lon}">${fav.name}</button>
            <button class="favorite-delete" data-id="${fav.id}" title="Delete">×</button>
          `;
        favoritesList.appendChild(item);
      });

      // Add event listeners
      favoritesList.querySelectorAll(".favorite-name").forEach((btn) => {
        btn.addEventListener("click", () => {
          const lat = parseFloat(btn.dataset.lat);
          const lon = parseFloat(btn.dataset.lon);
          primeWeatherForCoords(lat, lon, btn.textContent);
          if (favoritesToggle) favoritesToggle.textContent = "⭐ Favorites";
        });
      });

      favoritesList.querySelectorAll(".favorite-delete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Delete this favorite?")) {
            deleteFavorite(parseInt(btn.dataset.id));
          }
        });
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
      const notification = document.createElement("div");
      notification.className = "notification success";
      notification.style.position = "relative";
      notification.style.marginTop = "8px";
      notification.innerHTML = `
          <span>Save "${currentPlaceName}" to favorites?</span>
          <button style="margin-left: 8px; padding: 4px 8px; background: var(--good); border: none; border-radius: 4px; cursor: pointer;" onclick="this.parentElement.remove(); window.saveCurrentFavorite('${currentPlaceName}', ${lastCoords.latitude}, ${lastCoords.longitude})">Save</button>
        `;
      if (statusEl && statusEl.parentElement) {
        statusEl.parentElement.appendChild(notification);
        setTimeout(() => notification.remove(), 10000);
      }
    }

    // Expose save function globally for inline onclick
    window.saveCurrentFavorite = (name, lat, lon) => {
      saveFavorite(name, lat, lon);
      document.querySelectorAll(".notification").forEach((n) => {
        if (n.textContent.includes("Save")) n.remove();
      });
    };

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
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      ); // maximumAge: 0 forces fresh location
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
                getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
                  .then(async (hourly) => {
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

      // Time preset functions
      function setTimePreset(preset) {
        // Clear active state from all presets
        const allPresetBtns = [
          presetTodayBtn,
          presetTomorrowBtn,
          presetDefaultBtn,
          preset3DaysBtn,
          presetWeekBtn,
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
          case "3days":
            newDaysAhead = 3;
            startFromTomorrow = false;
            clickedBtn = preset3DaysBtn;
            break;
          case "week":
            newDaysAhead = 7;
            startFromTomorrow = false;
            clickedBtn = presetWeekBtn;
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
          getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
            .then(async (hourly) => {
              try {
                // For "tomorrow" preset, we need at least 2 days of data to show all of tomorrow
                const sunDaysAhead = preset === "tomorrow" ? 2 : daysAhead;
                const dailySun = await getDailySun(
                  lastCoords.latitude,
                  lastCoords.longitude,
                  sunDaysAhead
                );
                sunTimes = dailySun;
              } catch (e) {
                console.warn("Failed to fetch sun times:", e);
              }
              // For "tomorrow" preset, build dataset with 2 days to ensure we have all of tomorrow's data
              const datasetDaysAhead = preset === "tomorrow" ? 2 : daysAhead;
              let ds = buildTimelineDataset(hourly, datasetDaysAhead);

              // Filter data based on preset
              if (ds.labels.length > 0) {
                const now = new Date();
                let filterStart, filterEnd;

                if (preset === "today") {
                  // Filter to only today (from start of today to end of today)
                  filterStart = new Date(now);
                  filterStart.setHours(0, 0, 0, 0);
                  filterEnd = new Date(filterStart);
                  filterEnd.setDate(filterEnd.getDate() + 1);
                } else if (preset === "tomorrow") {
                  // Filter to only tomorrow (from start of tomorrow to end of tomorrow)
                  filterStart = new Date(now);
                  filterStart.setDate(filterStart.getDate() + 1);
                  filterStart.setHours(0, 0, 0, 0);
                  filterEnd = new Date(filterStart);
                  filterEnd.setDate(filterEnd.getDate() + 1);
                }

                if (filterStart && filterEnd) {
                  const filteredIndices = [];
                  for (let i = 0; i < ds.labels.length; i++) {
                    const labelTime = new Date(ds.labels[i]);
                    if (labelTime >= filterStart && labelTime < filterEnd) {
                      filteredIndices.push(i);
                    }
                  }

                  if (filteredIndices.length > 0) {
                    ds = {
                      labels: filteredIndices.map((i) => ds.labels[i]),
                      shadeVals: filteredIndices.map((i) => ds.shadeVals[i]),
                      sunVals: filteredIndices.map((i) => ds.sunVals[i]),
                      solarByHour: filteredIndices.map(
                        (i) => ds.solarByHour[i]
                      ),
                      isDayByHour: filteredIndices.map(
                        (i) => ds.isDayByHour[i]
                      ),
                      windByHour: filteredIndices.map(
                        (i) => ds.windByHour?.[i] ?? 0
                      ),
                      humidityByHour: filteredIndices.map(
                        (i) => ds.humidityByHour?.[i] ?? 0
                      ),
                      now: ds.now,
                    };
                  }
                }
              }

              timelineState = ds;
              window.timelineState = timelineState;
              await renderChart(
                ds.labels,
                ds.shadeVals,
                ds.sunVals,
                ds.now,
                ds.isDayByHour
              );
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
      presetTodayBtn &&
        presetTodayBtn.addEventListener("click", () => setTimePreset("today"));
      presetTomorrowBtn &&
        presetTomorrowBtn.addEventListener("click", () =>
          setTimePreset("tomorrow")
        );
      presetDefaultBtn &&
        presetDefaultBtn.addEventListener("click", () =>
          setTimePreset("default")
        );
      preset3DaysBtn &&
        preset3DaysBtn.addEventListener("click", () => setTimePreset("3days"));
      presetWeekBtn &&
        presetWeekBtn.addEventListener("click", () => setTimePreset("week"));
      els.solar &&
        els.solar.addEventListener("input", () => {
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
            getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
              .then(async (hourly) => {
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
          if (zipVal) {
            getCoordsForZip(zipVal)
              .then(({ latitude, longitude, place }) =>
                primeWeatherForCoords(
                  latitude,
                  longitude,
                  `ZIP ${zipVal} (${place})`
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
          scheduleNextTick(els.updateInterval?.value || 1);
        });
      els.updateHourlyToggle &&
        els.updateHourlyToggle.addEventListener("change", () => {
          clearPollTimer();
          scheduleNextTick(els.updateInterval?.value || 1);
        });
      els.updateNow &&
        els.updateNow.addEventListener("click", () => {
          clearPollTimer();
          runUpdateCycle();
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
              Promise.all([
                getHourlyWeather(lastCoords.latitude, lastCoords.longitude),
                getDailySun(
                  lastCoords.latitude,
                  lastCoords.longitude,
                  daysAhead
                ),
              ])
                .then(async ([hourly, dailySun]) => {
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

      // Night line darkening toggle (default to false)
      els.nightLineDarkeningToggle &&
        (els.nightLineDarkeningToggle.checked = nightLineDarkeningEnabled);
      els.nightLineDarkeningToggle &&
        els.nightLineDarkeningToggle.addEventListener("change", () => {
          nightLineDarkeningEnabled = els.nightLineDarkeningToggle.checked;
          storageCacheSet(NIGHT_LINE_DARKENING_KEY, String(nightLineDarkeningEnabled));
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
            getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
              .then(async (hourly) => {
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
          chartColors = {
            sun: { start: "#ffb86b", end: "#ff9500" },
            shade: { start: "#6ea8fe", end: "#4a90e2" },
          };
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
      function updateCalibration() {
        if (calibHumidityCoeff)
          calibration.humidityCoeff = parseFloat(calibHumidityCoeff.value);
        if (calibHumidityBaseline)
          calibration.humidityBaseline = parseFloat(
            calibHumidityBaseline.value
          );
        if (calibWindCoeff)
          calibration.windCoeff = parseFloat(calibWindCoeff.value);
        if (calibSolarCoeff)
          calibration.solarCoeff = parseFloat(calibSolarCoeff.value);
        if (calibReflectCoeff)
          calibration.reflectCoeff = parseFloat(calibReflectCoeff.value);
        if (calibCloudExp)
          calibration.cloudExp = parseFloat(calibCloudExp.value);

        storageCacheSet(CALIBRATION_KEY, JSON.stringify(calibration));

        // Debounce recalculation
        if (calibrationUpdateTimeout) clearTimeout(calibrationUpdateTimeout);
        calibrationUpdateTimeout = setTimeout(() => {
          // Recalculate and update chart if data exists
          if (lastCoords) {
            getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
              .then(async (hourly) => {
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
          updateCalibration();
        });
      calibHumidityBaseline &&
        calibHumidityBaseline.addEventListener("input", () => {
          if (calibHumidityBaselineVal)
            calibHumidityBaselineVal.textContent = parseFloat(
              calibHumidityBaseline.value
            );
          updateCalibration();
        });
      calibWindCoeff &&
        calibWindCoeff.addEventListener("input", () => {
          if (calibWindCoeffVal)
            calibWindCoeffVal.textContent = parseFloat(
              calibWindCoeff.value
            ).toFixed(1);
          updateCalibration();
        });
      calibSolarCoeff &&
        calibSolarCoeff.addEventListener("input", () => {
          if (calibSolarCoeffVal)
            calibSolarCoeffVal.textContent = parseFloat(calibSolarCoeff.value);
          updateCalibration();
        });
      calibReflectCoeff &&
        calibReflectCoeff.addEventListener("input", () => {
          if (calibReflectCoeffVal)
            calibReflectCoeffVal.textContent = parseFloat(
              calibReflectCoeff.value
            );
          updateCalibration();
        });
      calibCloudExp &&
        calibCloudExp.addEventListener("input", () => {
          if (calibCloudExpVal)
            calibCloudExpVal.textContent = parseFloat(
              calibCloudExp.value
            ).toFixed(1);
          updateCalibration();
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
          updateCalibration();
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
        const zipLoadingSpinner = $("#zipLoadingSpinner");
        if (zipLoadingSpinner) zipLoadingSpinner.style.display = "block";
        if (zipEls.input) {
          zipEls.input.disabled = true;
        }
        if (!vibeChart) showChartLoading();

        try {
          hideError();
          const { latitude, longitude, place } = await getCoordsForZip(zip5);
          storageCacheSet(ZIP_KEY, zip5);
          await primeWeatherForCoords(
            latitude,
            longitude,
            `ZIP ${zip5} (${place})`
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
          if (zipLoadingSpinner) zipLoadingSpinner.style.display = "none";
          if (zipEls.input) {
            zipEls.input.disabled = false;
          }
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
            // Submit after user stops typing (500ms debounce)
            zipSubmitTimeout = setTimeout(() => {
              handleZipSubmit();
            }, 500);
          } else {
            // Clear timeout if not 5 digits
            if (zipSubmitTimeout) clearTimeout(zipSubmitTimeout);
          }
        });

        zipEls.input.addEventListener("blur", () => {
          const currentValue = zipEls.input.value.trim();

          // If ZIP code is deleted (empty), strip zip from URL and get user's current location
          if (currentValue === "") {
            // Clear saved ZIP from storage
            storageCacheRemove(ZIP_KEY);
            currentPlaceName = null;

            // Clear API cache to force fresh data fetch for new location
            apiRequestCache.clear();
            pendingRequests.clear();

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

      // Buttons
      els.useLocationBtn &&
        els.useLocationBtn.addEventListener("click", () => {
          useLocation();
          // Stats will be updated when location is set via primeWeatherForCoords
        });

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
                    `ZIP ${savedZip} (${place})`
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
        }
      }

      function hideShortcutsModal() {
        if (shortcutsModalEl) {
          shortcutsModalEl.style.display = "none";
        }
      }

      // Keyboard shortcuts
      document.addEventListener("keydown", (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (
          e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable
        ) {
          return;
        }

        if (e.key === "c" || e.key === "C") {
          // Clear highlight
          if (selectionRange) {
            clearHighlightBtn?.click();
          }
        } else if (e.key === "s" || e.key === "S") {
          // Share (copy URL)
          if (selectionRange) {
            const url = generateShareURL(
              selectionRange.startTime,
              selectionRange.endTime
            );
            copyToClipboard(url);
            showNotification("Link copied to clipboard!", "success");
          }
        } else if (e.key === "f" || e.key === "F") {
          // Toggle unit
          toggleUnit();
        } else if (e.key === "?" || e.key === "h" || e.key === "H") {
          // Show shortcuts
          showShortcutsModal();
        } else if (e.key === "Escape") {
          // Close modals or clear selection
          if (shortcutsModalEl && shortcutsModalEl.style.display !== "none") {
            hideShortcutsModal();
          } else if (selectionRange) {
            clearHighlightBtn?.click();
          }
        }
      });

      closeShortcutsBtn &&
        closeShortcutsBtn.addEventListener("click", hideShortcutsModal);

      // Time presets
      presetTodayBtn &&
        presetTodayBtn.addEventListener("click", () => setTimePreset("today"));
      presetTomorrowBtn &&
        presetTomorrowBtn.addEventListener("click", () =>
          setTimePreset("tomorrow")
        );
      presetDefaultBtn &&
        presetDefaultBtn.addEventListener("click", () =>
          setTimePreset("default")
        );
      preset3DaysBtn &&
        preset3DaysBtn.addEventListener("click", () => setTimePreset("3days"));
      presetWeekBtn &&
        presetWeekBtn.addEventListener("click", () => setTimePreset("week"));

      // Set initial active preset button based on daysAhead
      if (daysAhead === 1) {
        if (presetTodayBtn) presetTodayBtn.classList.add("active");
      } else if (daysAhead === 2) {
        if (presetDefaultBtn) presetDefaultBtn.classList.add("active");
      } else if (daysAhead === 3) {
        if (preset3DaysBtn) preset3DaysBtn.classList.add("active");
      } else if (daysAhead === 7) {
        if (presetWeekBtn) presetWeekBtn.classList.add("active");
      }

      // Dismiss error button
      errorDismissBtn &&
        errorDismissBtn.addEventListener("click", () => {
          hideError();
        });

      // ZIP input handlers are set up earlier (around line 4125)

      // Buttons
      els.useLocationBtn &&
        els.useLocationBtn.addEventListener("click", () => {
          useLocation();
          // Stats will be updated when location is set via primeWeatherForCoords
        });

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
                    `ZIP ${savedZip} (${place})`
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

        // Escape - Close modals
        if (e.key === "Escape") {
          if (shortcutsModalEl && shortcutsModalEl.style.display !== "none") {
            hideShortcutsModal();
          } else if (
            expiredModalEl &&
            expiredModalEl.style.display !== "none"
          ) {
            hideExpiredSelectionModal();
          }
        }
      });

      // Parse URL parameters and apply settings
      function applyURLParameters() {
        const params = new URLSearchParams(location.search);

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
          }
        } else if (urlZip) {
          const zip5 = normalizeZip(urlZip);
          if (zip5) {
            // Populate ZIP in input field
            if (zipEls.input) zipEls.input.value = zip5;
            // Save ZIP to localStorage
            storageCacheSet(ZIP_KEY, zip5);

            // Only fetch weather if there's no highlight (highlight will wait for location)
            if (!hasHighlight) {
              getCoordsForZip(zip5)
                .then(({ latitude, longitude, place }) =>
                  primeWeatherForCoords(
                    latitude,
                    longitude,
                    `ZIP ${zip5} (${place})`
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
              return; // Don't set selectionRange if expired
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
                      `ZIP ${zip5} (${place})`
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
      }

      // Boot
      setTimeout(() => {
        statusEl &&
          (statusEl.textContent = "Trying to get your local weather…");

        // Apply URL parameters first
        const params = new URLSearchParams(location.search);
        const urlZip = params.get("zip");
        const urlStart = params.get("start");
        const urlEnd = params.get("end");
        const hasUrlHighlight = urlStart && urlEnd;

        applyURLParameters();

        // If there's a ZIP in URL with a highlight, skip location request
        // Location will be requested when highlight is cleared
        if (hasUrlHighlight && urlZip) {
          // Don't request location yet - wait for highlight to be cleared
          if (lastCoords) {
            updateChartTitle();
          }
        } else if (!lastCoords) {
          // If no location was set from URL, use saved ZIP or prompt for browser location
          const savedZip = storageCacheGet(ZIP_KEY);
          if (savedZip && zipEls.input) {
            zipEls.input.value = savedZip;
            getCoordsForZip(savedZip)
              .then(({ latitude, longitude, place }) =>
                primeWeatherForCoords(
                  latitude,
                  longitude,
                  `ZIP ${savedZip} (${place})`
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
      }, 300);
    });

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

      // Clear API cache (optional - could keep for faster reload)
      apiRequestCache.clear();
      pendingRequests.clear();
    });
  });
})();
