(() => {
    // Load Chart.js dynamically
    const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js";
    let CHART_READY = null;
  
    function loadScriptOnce(src) {
      return new Promise((resolve, reject) => {
        const existing = Array.from(document.scripts).find(s => s.src === src);
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
      const copySummaryBtn = $("#copySummaryBtn");
      const shortcutsModalEl = $("#shortcutsModal");
      const closeShortcutsBtn = $("#closeShortcutsBtn");
      const presetTodayBtn = $("#presetToday");
      const presetTomorrowBtn = $("#presetTomorrow");
      const preset3DaysBtn = $("#preset3Days");
      const presetWeekBtn = $("#presetWeek");
      
      function updateChartTitle() {
        if (chartTitleEl) {
          if (daysAhead === 1) {
            chartTitleEl.textContent = "Today";
          } else if (daysAhead === 2) {
            chartTitleEl.textContent = "Today and Tomorrow";
          } else {
            chartTitleEl.textContent = `Next ${daysAhead} Days`;
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
        nowTime: $("#nowTime"),
        nowSubLabel: $("#nowSubLabel"),
        nowTitle: $("#currentTimeTitle"),
        lastUpdated: $("#lastUpdated"),
        nextUpdated: $("#nextUpdated"),
        updateInterval: $("#updateInterval"),
        updateHourlyToggle: $("#updateHourlyToggle"),
        updateNow: $("#updateNow"),
        daysAhead: $("#daysAhead"),
        nightShadingToggle: $("#nightShadingToggle"),
        useLocationBtn: $("#use-location"),
        sunCard: $("#sunCard"),
      };
  
      // Advanced toggle
      const advToggle = document.querySelector(".adv-toggle");
      const advPanel  = document.getElementById("advPanel");
      if (advToggle && advPanel) {
        advToggle.addEventListener("click", () => {
          const expanded = advToggle.getAttribute("aria-expanded") === "true";
          advToggle.setAttribute("aria-expanded", String(!expanded));
          advPanel.hidden = expanded;
        });
        advToggle.setAttribute("aria-expanded", "false");
        advPanel.hidden = true;
      }
  
      // Units & ZIP
      const unitEls = { F: $("#unitF"), C: $("#unitC") };
      const zipEls = { input: $("#zipInput"), btn: $("#use-zip"), clear: $("#clear-zip"), status: $("#zipStatus") };
  
      // State
      const UNIT_KEY = "vibeUnit";
      const ZIP_KEY  = "vibeZip";
      const DAYS_AHEAD_KEY = "vibeDaysAhead";
      const NIGHT_SHADING_KEY = "vibeNightShading";
      let unit = (localStorage.getItem(UNIT_KEY) === "C") ? "C" : "F";
      let daysAhead = parseInt(localStorage.getItem(DAYS_AHEAD_KEY) || "2", 10);
      let nightShadingEnabled = localStorage.getItem(NIGHT_SHADING_KEY) === "true";
      let lastCoords = null;
      let vibeChart = null;
      let pollTimer = null;
      let nextUpdateAt = null;
  
      let sunTimes = { sunrises: [], sunsets: [] }; // Arrays of all sunrise/sunset times for visible range
      let currentIsDay = null;
      let currentPlaceName = "";
  
      let timelineState = null;  // { labels, shadeVals, sunVals, solarByHour, isDayByHour, now } all in °F
      window.timelineState = null; // expose for tooltip use
      let simActive = false;
      let selectionRange = null; // { startTime: Date, endTime: Date } for URL sharing
      let summaryGenerationInProgress = false;
  
      const DEBUG = new URLSearchParams(location.search).get("debug") === "true";
      const log = (...a) => { if (DEBUG) console.log("[Vibe]", ...a); };

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

      function handleKeepCustomSettings() {
        // Clear the selection but keep other URL params
        selectionRange = null;
        if (clearHighlightBtn) clearHighlightBtn.style.display = "none";
        if (weatherSummaryEl) weatherSummaryEl.style.display = "none";
        
        // Remove start and end from URL but keep other params
        const params = new URLSearchParams(location.search);
        params.delete("start");
        params.delete("end");
        const newUrl = params.toString() 
          ? `${location.pathname}?${params.toString()}`
          : location.pathname;
        history.pushState({}, "", newUrl);
        
        // Update chart
        if (vibeChart) {
          vibeChart.update('none');
        }
        
        hideExpiredSelectionModal();
      }

      function handleUseDefaults() {
        // Reset everything to app defaults
        // Clear selection
        selectionRange = null;
        if (clearHighlightBtn) clearHighlightBtn.style.display = "none";
        if (weatherSummaryEl) weatherSummaryEl.style.display = "none";
        
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
        if (zipEls.status) zipEls.status.textContent = "Cleared. Using device location when available.";
        
        // Remove all URL params
        history.replaceState({}, "", location.pathname);
        
        // Trigger device location if available
        useLocation();
        
        // Update chart
        if (vibeChart) {
          vibeChart.update('none');
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
        const savedZip = localStorage.getItem(ZIP_KEY);
        if (savedZip) params.set("zip", savedZip);
        
        // Add time range (ISO strings)
        params.set("start", startTime.toISOString());
        params.set("end", endTime.toISOString());
        
        return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
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
        
        const { labels, shadeVals, sunVals, solarByHour, isDayByHour } = timelineState;
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
              description: vibeDescriptor(shadeF, { solar, isDay, context: "shade" })
            });
          }
        }
        
        if (dataPoints.length === 0) return null;
        
        // Calculate statistics
        const shadeTemps = dataPoints.map(d => d.shadeVibe);
        const sunTemps = dataPoints.map(d => d.sunVibe);
        const minShade = Math.min(...shadeTemps);
        const maxShade = Math.max(...shadeTemps);
        const minSun = Math.min(...sunTemps);
        const maxSun = Math.max(...sunTemps);
        const avgShade = shadeTemps.reduce((a, b) => a + b, 0) / shadeTemps.length;
        const avgSun = sunTemps.reduce((a, b) => a + b, 0) / sunTemps.length;
        const dayHours = dataPoints.filter(d => d.isDay).length;
        const nightHours = dataPoints.length - dayHours;
        
        // Calculate weighted average vibe based on day/night hours
        // During day, people are more likely in sun, so weight sun vibe more
        // During night, use shade vibe (sun doesn't matter)
        const totalHours = dataPoints.length;
        const dayWeight = dayHours / totalHours;
        const nightWeight = nightHours / totalHours;
        // For daytime, assume 70% sun vibe, 30% shade vibe (people move between sun/shade)
        // For nighttime, use 100% shade vibe
        const avgRepresentative = (dayWeight * (avgSun * 0.7 + avgShade * 0.3)) + (nightWeight * avgShade);
        
        return {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          duration: Math.round((endTime - startTime) / (1000 * 60 * 60) * 10) / 10, // hours
          dataPoints,
          stats: {
            minShade, maxShade, avgShade,
            minSun, maxSun, avgSun,
            dayHours, nightHours,
            avgRepresentative // More representative average for the period
          }
        };
      }

      // Generate AI summary using free public API
      async function generateWeatherSummary(weatherData) {
        if (!weatherData || !weatherData.dataPoints || weatherData.dataPoints.length === 0) {
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
          dataPoints[dataPoints.length - 1] // Last point
        ].filter(Boolean);
        
        samplePoints.forEach(point => {
          if (point.description) {
            vibeDescriptions.push(point.description);
          }
        });
        
        // Calculate representative temperature for the prompt
        const repTemp = stats.avgRepresentative || stats.avgShade;
        const maxRep = Math.max(stats.maxSun, stats.maxShade);
        const minRep = stats.minShade;
        
        // Format the prompt focusing on vibe temperatures
        const prompt = `Summarize how the weather will feel for a ${duration.toFixed(1)}-hour period from ${start.toLocaleString()} to ${end.toLocaleString()}.

Vibe temperature data (how it actually feels):
- Representative vibe: ${repTemp.toFixed(1)}${unitSuffix()} (typical feel during this period)
- Shade vibe: ${stats.avgShade.toFixed(1)}${unitSuffix()} (range: ${stats.minShade.toFixed(1)}-${stats.maxShade.toFixed(1)}${unitSuffix()})
- Sun vibe: ${stats.avgSun.toFixed(1)}${unitSuffix()} (range: ${stats.minSun.toFixed(1)}-${stats.maxSun.toFixed(1)}${unitSuffix()})
- Overall range: ${minRep.toFixed(1)}${unitSuffix()} to ${maxRep.toFixed(1)}${unitSuffix()}
- Daytime hours: ${stats.dayHours}, Nighttime hours: ${stats.nightHours}
${vibeDescriptions.length > 0 ? `- Sample descriptions: ${vibeDescriptions.slice(0, 3).join(", ")}` : ""}

Provide a brief, conversational summary (2-3 sentences) describing how it will FEEL during this time period based on the vibe temperatures. Use the representative vibe as the primary temperature reference. Focus on comfort, what to wear, and how the conditions will change. Ignore actual air temperature - only use the vibe temperatures which represent how it actually feels.`;

        try {
          // Use Hugging Face Inference API with a free model
          // Try using a smaller, faster model that's more likely to be available
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch("https://api-inference.huggingface.co/models/google/flan-t5-base", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                max_length: 200,
                temperature: 0.7
              }
            }),
            signal: controller.signal
          });
          
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
          sentences.push(`The vibe will vary significantly, from ${minRep.toFixed(1)}${unitSuffix()} to ${maxRep.toFixed(1)}${unitSuffix()}`);
        } else {
          sentences.push(`The vibe will be relatively steady around ${repTemp.toFixed(1)}${unitSuffix()}`);
        }
        
        // Sun vs shade vibe difference
        // Convert thresholds based on unit (15°F = 8.3°C, 8°F = 4.4°C)
        const muchWarmerThreshold = unit === "F" ? 15 : 8.3;
        const noticeablyWarmerThreshold = unit === "F" ? 8 : 4.4;
        const sunShadeDiff = stats.avgSun - stats.avgShade;
        
        if (sunShadeDiff > muchWarmerThreshold) {
          sentences.push(`In the sun, it will feel much warmer (around ${stats.avgSun.toFixed(1)}${unitSuffix()} vibe), so seek shade if it gets too hot`);
        } else if (sunShadeDiff > noticeablyWarmerThreshold) {
          sentences.push(`In the sun, it will feel noticeably warmer (around ${stats.avgSun.toFixed(1)}${unitSuffix()} vibe)`);
        }
        
        return sentences.join(". ") + ".";
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
          const daysDiff = Math.round((endDayOnly - startDayOnly) / (1000 * 60 * 60 * 24));
          
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

      // Update weather summary
      async function updateWeatherSummary() {
        if (!selectionRange || !timelineState || summaryGenerationInProgress) return;
        
        summaryGenerationInProgress = true;
        
        if (weatherSummaryEl) weatherSummaryEl.style.display = "block";
        showSummaryLoading();
        
        // Show copy button and clear button
        if (copySummaryBtn) copySummaryBtn.style.display = "none";
        if (clearHighlightBtn) clearHighlightBtn.style.display = "block";
        
        // Update title with smart description
        if (summaryTitleEl && selectionRange) {
          const smartTitle = generateHighlightTitle(selectionRange.startTime, selectionRange.endTime);
          summaryTitleEl.textContent = smartTitle;
        }
        
        // Update time range display
        if (summaryTimeRangeEl && selectionRange) {
          const start = new Date(selectionRange.startTime);
          const end = new Date(selectionRange.endTime);
          const startStr = start.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          const endStr = end.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          summaryTimeRangeEl.textContent = `${startStr} → ${endStr}`;
        }
        
        if (summaryTextEl) {
          summaryTextEl.textContent = "Generating summary...";
          summaryTextEl.className = "summary-text loading";
        }
        
        try {
          const weatherData = extractWeatherDataForRange(selectionRange.startTime, selectionRange.endTime);
          if (!weatherData) {
            if (summaryTextEl) {
              summaryTextEl.textContent = "No weather data available for this time range.";
              summaryTextEl.className = "summary-text";
            }
            return;
          }
          
          const summary = await generateWeatherSummary(weatherData);
          
          if (summaryTextEl) {
            summaryTextEl.textContent = summary;
            summaryTextEl.className = "summary-text";
          }
          
          // Show copy button when summary is ready
          if (copySummaryBtn) copySummaryBtn.style.display = "block";
          } catch (error) {
            console.warn("Failed to generate summary:", error);
            if (summaryTextEl) {
              summaryTextEl.textContent = "Unable to generate summary at this time.";
              summaryTextEl.className = "summary-text";
            }
            // Hide copy button on error
            if (copySummaryBtn) copySummaryBtn.style.display = "none";
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
        
        if (beforeIdx === afterIdx || beforeIdx < 0 || afterIdx >= labels.length) {
          return new Date(labels[idx]);
        }
        
        const beforeTime = new Date(labels[beforeIdx]);
        const afterTime = new Date(labels[afterIdx]);
        const fraction = value - beforeIdx;
        
        return new Date(beforeTime.getTime() + (afterTime.getTime() - beforeTime.getTime()) * fraction);
      }
  
      // Utils
      function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
      const fToC = f => (f - 32) * 5/9;
      const cToF = c => (c * 9/5) + 32;
      const toUserTemp = f => unit === "F" ? f : fToC(f);
      const unitSuffix = () => unit === "F" ? "°F" : "°C";
  
      function fmtHM(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
      function fmtHMS(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }); }
  
      function paintUnitToggle() {
        unitEls.F?.classList.toggle("active", unit === "F");
        unitEls.C?.classList.toggle("active", unit === "C");
      }
      function applyUnitLabels() {
        // Update inline Air Temp unit tag in Advanced
        const airUnit = document.getElementById("airUnitLabel");
        if (airUnit) airUnit.textContent = unit === "F" ? "°F" : "°C";
      }
      function convertTempInputIfPresent(toUnit) {
        const t = els.temp;
        if (!t || t.value === "") return;
        const val = parseFloat(t.value); if (Number.isNaN(val)) return;
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
            place: `${p["place name"]}, ${p["state abbreviation"]}`
          };
        } catch (e) {
          if (e.message === "ZIP_NOT_FOUND") throw new Error("ZIP_NOT_FOUND");
          throw new Error("ZIP_LOOKUP_FAILED");
        }
      }
      async function getPlaceName(lat, lon) {
        try {
          const url = new URL("https://geocoding-api.open-meteo.com/v1/reverse");
          url.search = new URLSearchParams({ latitude: lat, longitude: lon, language: "en", format: "json" });
          const r = await fetch(url);
          if (!r.ok) throw new Error("reverse geocode failed");
          const j = await r.json();
          const p = j?.results?.[0];
          if (!p) return "";
          const city = p.name || "";
          const admin = p.admin1 || p.admin2 || p.country || "";
          return admin && admin !== city ? `${city}, ${admin}` : city;
        } catch { return ""; }
      }
      function paintCurrentTimeTitle() {
        const place = currentPlaceName || (zipEls?.input?.value ? `ZIP ${zipEls.input.value}` : "your location");
        els.nowTitle && (els.nowTitle.textContent = `Current Time at ${place}`);
      }
  
      function isDaylightNow() {
        if (currentIsDay === 0 || currentIsDay === 1) return !!currentIsDay;
        const now = new Date();
        if (sunTimes.sunriseToday && sunTimes.sunsetToday) {
          if (now >= sunTimes.sunriseToday && now < sunTimes.sunsetToday) return true;
        }
        const s = parseFloat(els.solar?.value ?? "0") || 0;
        return s > 0.2;
      }
  
      // Descriptors
      function describeDay(tempF, context = "shade") {
        if (tempF < -10) return "Brutally frigid; frostbite risk";
        if (tempF < -5)  return "Bitter, painfully cold";
        if (tempF < 0)   return "Bitter cold";
        if (tempF < 5)   return "Arctic chill";
        if (tempF < 10)  return "Frigid; heavy layers";
        if (tempF < 15)  return "Freezing; very cold";
        if (tempF < 20)  return "Freezing; thick coat";
        if (tempF < 25)  return "Very cold; winter layers";
        if (tempF < 30)  return "Cold; winter layers";
        if (tempF < 35)  return "Cold; coat + hat";
        if (tempF < 40)  return "Chilly; warm layers";
        if (tempF < 45)  return "Chilly; light coat";
        if (tempF < 50)  return "Cool; jacket";
        if (tempF < 55)  return "Crisp sweater weather";
        if (tempF < 60)  return context === "sun" ? "Great in sun, cool in shade" : "Cool in shade, warm in sun";
        if (tempF < 65)  return context === "sun" ? "Perfect in sun, cool otherwise" : "Cool; find sun";
        if (tempF < 70)  return "Balanced, light layers";
        if (tempF < 75)  return "Mild and comfy";
        if (tempF < 80)  return "Warm and glowy";
        if (tempF < 85)  return "Quite warm; shade helps";
        if (tempF < 90)  return "Hot; hydrate";
        if (tempF < 95)  return "Baking in the sun";
        if (tempF < 100) return "Very hot; limit exertion";
        if (tempF < 105) return "Oppressive heat; take it easy";
        return "Extreme heat alert";
      }
      function describeNight(tempF) {
        if (tempF < -10) return "Brutally frigid night";
        if (tempF < -5)  return "Bitter, painfully cold night";
        if (tempF < 0)   return "Bitter cold night";
        if (tempF < 5)   return "Arctic night air";
        if (tempF < 10)  return "Frigid night; heavy layers";
        if (tempF < 15)  return "Freezing night; very cold";
        if (tempF < 20)  return "Freezing night; thick coat";
        if (tempF < 25)  return "Very cold night";
        if (tempF < 30)  return "Cold night; winter layers";
        if (tempF < 35)  return "Cold night; coat + hat";
        if (tempF < 40)  return "Chilly night; warm layers";
        if (tempF < 45)  return "Chilly night; light coat";
        if (tempF < 50)  return "Cool evening; jacket";
        if (tempF < 55)  return "Crisp night air";
        if (tempF < 60)  return "Cool evening";
        if (tempF < 65)  return "Mild evening, light layer";
        if (tempF < 70)  return "Mild evening";
        if (tempF < 75)  return "Warm evening";
        if (tempF < 80)  return "Very warm evening";
        if (tempF < 85)  return "Hot evening";
        if (tempF < 90)  return "Hot evening; hydrate";
        if (tempF < 95)  return "Stifling night heat";
        if (tempF < 100) return "Oppressive night heat";
        if (tempF < 105) return "Dangerously hot night";
        return "Extreme heat night";
      }
      function vibeDescriptor(tempF, { solar = parseFloat(els.solar?.value ?? "0") || 0, isDay = isDaylightNow(), context = "shade" } = {}) {
        const base = isDay ? describeDay(tempF, context) : describeNight(tempF);
        if (!isDay) return base;
        const s = clamp(Number.isFinite(solar) ? solar : 0, 0, 1);
        let suffix = "";
        if (s < 0.20) suffix = context === "sun" ? "clouds mute the sun" : "overcast";
        else if (s < 0.40) suffix = "mostly cloudy";
        else if (s < 0.70) suffix = "partly sunny";
        return suffix ? `${base} (${suffix})` : base;
      }
  
      // Formulas
      function shadeVibeOf(T, RH, Wind) { return T + (RH - 40) / 15 - 0.7 * Wind; }
      function sunVibeOf(shadeV, solarExposure, R) { return shadeV + 8 * solarExposure + 4 * R; }
      function reflectivity() {
        const sel = parseFloat(els.reflect?.value ?? "0");
        if (sel === 0) return clamp(parseFloat(els.reflectCustom?.value ?? "0") || 0, 0, 1);
        return clamp(sel, 0, 1);
      }
  
      // Solar exposure
      function solarFromUVandCloud({ uv_index, uv_index_clear_sky, cloud_cover, is_day }) {
        const isDaylight = is_day === 1 || is_day === true;
        const baseUV = (typeof uv_index_clear_sky === "number" && uv_index_clear_sky > 0)
          ? uv_index / uv_index_clear_sky
          : (typeof uv_index === "number" ? uv_index / 10 : 0);
        const cloudAtten = 1 - Math.pow((cloud_cover ?? 0) / 100, 0.7);
        const solar = (isDaylight ? baseUV * cloudAtten : 0);
        return clamp(solar, 0, 1);
      }
  
      // Compute card values (cards show °F/°C)
      function compute() {
        const Traw = parseFloat(els.temp?.value ?? "NaN");
        const RH   = parseFloat(els.humidity?.value ?? "NaN");
        const Wind = parseFloat(els.wind?.value ?? "NaN");
        const Solar= parseFloat(els.solar?.value ?? "NaN");
        if ([Traw, RH, Wind].some(v => Number.isNaN(v))) {
          statusEl && (statusEl.textContent = "Enter temp, humidity, and wind or use your location/ZIP.");
          return;
        }
        const tempF = unit === "F" ? Traw : cToF(Traw);
        const shadeF = shadeVibeOf(tempF, RH, Wind);
        const solarValue = Number.isNaN(Solar) ? 0 : clamp(Solar, 0, 1);
        const sunF   = sunVibeOf(shadeF, solarValue, reflectivity());
  
        const shadeDisplay = toUserTemp(shadeF);
        const sunDisplay   = toUserTemp(sunF);
  
        els.shade && (els.shade.innerHTML = `${shadeDisplay.toFixed(1)}${unitSuffix()}`);
        els.sun   && (els.sun.innerHTML   = `${sunDisplay.toFixed(1)}${unitSuffix()}`);
  
        els.shadeLabel && (els.shadeLabel.innerHTML = vibeDescriptor(shadeF, { solar: solarValue, isDay: isDaylightNow(), context: "shade" }));
        els.sunLabel   && (els.sunLabel.innerHTML   = vibeDescriptor(sunF,   { solar: solarValue, isDay: isDaylightNow(), context: "sun" }));
        
        // Remove skeleton loading state
        hideCardLoading();
  
        if (!simActive && els.sunCard) {
          els.sunCard.style.display = isDaylightNow() ? "" : "none";
        }
        statusEl && (statusEl.textContent = "Computed from current inputs.");
      }
  
      function autoSolarFromCloudCover(cloudCoverPct) {
        const solar = clamp(1 - cloudCoverPct / 100, 0.2, 1);
        els.solar && (els.solar.value = solar.toFixed(1));
        els.solarVal && (els.solarVal.textContent = solar.toFixed(1));
        return solar;
      }
  
      // API with error handling
      async function getCurrentWeather(lat, lon) {
        try {
          const params = new URLSearchParams({
            latitude: lat, longitude: lon,
            current: "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,is_day",
            temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "auto"
          });
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
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
          return data.current;
        } catch (e) {
          if (e.message === "RATE_LIMIT") throw new Error("RATE_LIMIT");
          if (e.message === "SERVER_ERROR") throw new Error("SERVER_ERROR");
          if (e.message.startsWith("API_ERROR_")) throw e;
          if (e.message === "INVALID_RESPONSE") throw new Error("INVALID_RESPONSE");
          throw new Error("NETWORK_ERROR");
        }
      }
      async function getHourlyWeather(lat, lon) {
        try {
          const params = new URLSearchParams({
            latitude: lat, longitude: lon,
            hourly: "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,is_day",
            temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "auto"
          });
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
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
          return data.hourly;
        } catch (e) {
          if (e.message === "RATE_LIMIT") throw new Error("RATE_LIMIT");
          if (e.message === "SERVER_ERROR") throw new Error("SERVER_ERROR");
          if (e.message.startsWith("API_ERROR_")) throw e;
          if (e.message === "INVALID_RESPONSE") throw new Error("INVALID_RESPONSE");
          throw new Error("NETWORK_ERROR");
        }
      }
      async function getDailySun(lat, lon, daysAheadParam = daysAhead) {
        try {
          const params = new URLSearchParams({
            latitude: lat, longitude: lon, daily: "sunrise,sunset", timezone: "auto",
          forecast_days: Math.max(daysAheadParam, 7) // Request at least 7 days to ensure we have enough
        });
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
          if (!r.ok) {
            if (r.status === 429) throw new Error("RATE_LIMIT");
            if (r.status >= 500) throw new Error("SERVER_ERROR");
            throw new Error(`API_ERROR_${r.status}`);
          }
          const data = await r.json();
          if (!data.daily) throw new Error("INVALID_RESPONSE");
          const rises = data?.daily?.sunrise?.map(t => new Date(t)) ?? [];
          const sets  = data?.daily?.sunset?.map(t => new Date(t)) ?? [];
          // Return arrays of all sunrise/sunset times for the visible range
          return {
            sunrises: rises.slice(0, daysAheadParam + 1), // +1 to include today
            sunsets: sets.slice(0, daysAheadParam + 1),
            // Keep legacy properties for backward compatibility
            sunriseToday: rises[0] ?? null,
            sunsetToday: sets[0] ?? null,
            sunriseTomorrow: rises[1] ?? null,
            sunsetTomorrow: sets[1] ?? null
          };
        } catch (e) {
          if (e.message === "RATE_LIMIT") throw new Error("RATE_LIMIT");
          if (e.message === "SERVER_ERROR") throw new Error("SERVER_ERROR");
          if (e.message.startsWith("API_ERROR_")) throw e;
          if (e.message === "INVALID_RESPONSE") throw new Error("INVALID_RESPONSE");
          throw new Error("NETWORK_ERROR");
        }
      }
  
      // Timeline
      function buildTimelineDataset(hourly, daysAheadParam = daysAhead) {
        const now = new Date();
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now);   end.setDate(end.getDate() + daysAheadParam); end.setHours(0,0,0,0);
  
        const times = hourly.time.map(t => new Date(t));
        const startIdx = times.findIndex(d => d >= start);
        const endIdx   = times.findIndex(d => d >= end);
        const s = startIdx === -1 ? 0 : startIdx;
        const e = endIdx === -1 ? times.length : endIdx;
  
        const labels = [], shadeVals = [], sunVals = [], solarByHour = [], isDayByHour = [];
  
        for (let i = s; i < e; i++) {
          const T = hourly.temperature_2m[i];
          const RH = hourly.relative_humidity_2m[i];
          const Wind = hourly.wind_speed_10m[i];
          const CC = hourly.cloud_cover[i];
          const uv  = hourly.uv_index[i] ?? 0;
          const uvc = hourly.uv_index_clear_sky[i] ?? 0;
          const isDay = hourly.is_day[i] === 1;
  
          const shade = shadeVibeOf(T, RH, Wind);
          const solar = solarFromUVandCloud({ uv_index: uv, uv_index_clear_sky: uvc, cloud_cover: CC, is_day: isDay ? 1 : 0 });
          const sun = sunVibeOf(shade, solar, reflectivity());
  
          labels.push(times[i]);
          shadeVals.push(parseFloat(shade.toFixed(1))); // °F
          sunVals.push(parseFloat(sun.toFixed(1)));     // °F
          solarByHour.push(solar);
          isDayByHour.push(isDay ? 1 : 0);
        }
        return { labels, shadeVals, sunVals, solarByHour, isDayByHour, now };
      }
      function hourKey(d) { const k = new Date(d); k.setMinutes(0,0,0); return k.getTime(); }
  
      function nearestLabelIndex(labelDates, target) {
        if (!target) return -1;
        const tg = new Date(target); tg.setMinutes(0,0,0);
        let bestIdx = -1, bestDiff = Infinity;
        for (let i = 0; i < labelDates.length; i++) {
          const d = new Date(labelDates[i]); d.setMinutes(0,0,0);
          const diff = Math.abs(d - tg);
          if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        }
        return bestIdx;
      }
      function buildSunMarkers(labelDates) {
        const evts = [];
        // Add all sunrise/sunset events from the arrays
        if (sunTimes.sunrises && sunTimes.sunrises.length > 0) {
          sunTimes.sunrises.forEach(t => {
            if (t) evts.push({ t, emoji: "☀️", label: "Sunrise" });
          });
        }
        if (sunTimes.sunsets && sunTimes.sunsets.length > 0) {
          sunTimes.sunsets.forEach(t => {
            if (t) evts.push({ t, emoji: "☀️", label: "Sunset" });
          });
        }
        // Fallback to legacy properties if arrays are empty
        if (evts.length === 0) {
          const legacy = [
            { t: sunTimes.sunriseToday,    emoji: "☀️", label: "Sunrise" },
            { t: sunTimes.sunsetToday,     emoji: "☀️", label: "Sunset"  },
            { t: sunTimes.sunriseTomorrow, emoji: "☀️", label: "Sunrise" },
            { t: sunTimes.sunsetTomorrow,  emoji: "☀️", label: "Sunset"  },
          ].filter(e => e.t);
          evts.push(...legacy);
        }
        // Return markers with actual time, filter to only those in visible range
        const firstLabel = new Date(labelDates[0]);
        const lastLabel = new Date(labelDates[labelDates.length - 1]);
        return evts
          .map(e => {
            const timeDate = new Date(e.t);
            // Only include if within visible range
            if (timeDate >= firstLabel && timeDate <= lastLabel) {
              return { time: timeDate, emoji: e.emoji, label: e.label, when: e.t };
            }
            return null;
          })
          .filter(e => e !== null);
      }
  
      // Loading state helpers
      function showCardLoading() {
        // Cards start with skeleton class, will be removed when data loads
      }
      
      function hideCardLoading() {
        document.querySelectorAll('.skeleton-text').forEach(el => {
          el.classList.remove('skeleton-text');
        });
      }
      
      function showChartLoading() {
        if (chartSkeletonEl) chartSkeletonEl.style.display = 'flex';
        if (els.chartCanvas) els.chartCanvas.style.display = 'none';
      }
      
      function hideChartLoading() {
        if (chartSkeletonEl) chartSkeletonEl.style.display = 'none';
        if (els.chartCanvas) els.chartCanvas.style.display = 'block';
      }
      
      function showSummaryLoading() {
        if (summaryTextEl) {
          summaryTextEl.textContent = "Generating summary...";
          summaryTextEl.className = "summary-text loading";
        }
      }

      // Error handling with retry
      function showError(title, details, suggestion, retryCallback = null) {
        if (!errorMessageEl) return;
        if (errorTitleEl) errorTitleEl.textContent = title;
        if (errorDetailsEl) errorDetailsEl.textContent = details;
        if (errorSuggestionEl) errorSuggestionEl.textContent = suggestion || "";
        if (errorRetryBtn) {
          if (retryCallback) {
            errorRetryBtn.style.display = "block";
            errorRetryBtn.onclick = () => {
              hideError();
              retryCallback();
            };
          } else {
            errorRetryBtn.style.display = "none";
          }
        }
        errorMessageEl.classList.add("show");
        errorMessageEl.style.display = "block";
      }

      function hideError() {
        if (errorMessageEl) {
          errorMessageEl.classList.remove("show");
          errorMessageEl.style.display = "none";
        }
      }

      async function renderChart(labels, shadeValsF, sunValsFF, now) {
        if (!els.chartCanvas) return;
        updateChartTitle();
        await ensureChartJs();
        const ctx = els.chartCanvas.getContext("2d");
        if (!window.Chart) { console.warn("Chart.js failed to load."); return; }
        if (vibeChart) { vibeChart.destroy(); vibeChart = null; }
  
        const shadeVals = shadeValsF.map(v => toUserTemp(v));
        const sunVals   = sunValsFF.map(v => toUserTemp(v));
        const displayLabels = labels.map(d => d.toLocaleString([], { weekday: "short", hour: "numeric" }));
        const nowIdx = labels.findIndex(d => hourKey(d) === hourKey(now));
        const markers = buildSunMarkers(labels);

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
            
            midnightIndices.forEach(idx => {
              const x = scales.x.getPixelForValue(idx);
              if (x >= chartArea.left && x <= chartArea.right) {
                ctx.beginPath();
                ctx.moveTo(x, chartArea.top);
                ctx.lineTo(x, chartArea.bottom);
                ctx.stroke();
              }
            });
            
            ctx.restore();
          }
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
                return scales.x.getPixelForValue(beforeIdx >= 0 ? beforeIdx : afterIdx);
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
            const sunrises = sunTimes.sunrises && sunTimes.sunrises.length > 0 
              ? sunTimes.sunrises 
              : (sunTimes.sunriseToday ? [sunTimes.sunriseToday] : []).concat(sunTimes.sunriseTomorrow ? [sunTimes.sunriseTomorrow] : []);
            const sunsets = sunTimes.sunsets && sunTimes.sunsets.length > 0
              ? sunTimes.sunsets
              : (sunTimes.sunsetToday ? [sunTimes.sunsetToday] : []).concat(sunTimes.sunsetTomorrow ? [sunTimes.sunsetTomorrow] : []);
            
            // Add all sunrise/sunset events with their actual times
            sunrises.forEach(time => {
              if (time) {
                const timeDate = new Date(time);
                // Only include if within the visible range
                const firstLabel = new Date(labels[0]);
                const lastLabel = new Date(labels[labels.length - 1]);
                if (timeDate >= firstLabel && timeDate <= lastLabel) {
                  events.push({ time: timeDate, type: 'sunrise' });
                }
              }
            });
            sunsets.forEach(time => {
              if (time) {
                const timeDate = new Date(time);
                // Only include if within the visible range
                const firstLabel = new Date(labels[0]);
                const lastLabel = new Date(labels[labels.length - 1]);
                if (timeDate >= firstLabel && timeDate <= lastLabel) {
                  events.push({ time: timeDate, type: 'sunset' });
                }
              }
            });
            
            // Sort events by time
            events.sort((a, b) => a.time - b.time);
            
            if (events.length === 0) {
              ctx.restore();
              return;
            }
            
            // Draw night shading rectangles
            // Night is from sunset to sunrise
            ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; // Darker background for night
            
            // Get the start and end times of the visible range
            const chartStartTime = new Date(labels[0]);
            const chartEndTime = new Date(labels[labels.length - 1]);
            
            // Determine if we start in night (before first sunrise)
            const firstEvent = events[0];
            if (firstEvent && firstEvent.type === 'sunrise' && firstEvent.time > chartStartTime) {
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
            
            // Process all sunset->sunrise pairs
            for (let i = 0; i < events.length; i++) {
              const event = events[i];
              if (event.type === 'sunset') {
                // Start of night period - use exact sunset time
                let xStart = getPixelForExactTime(event.time);
                // Find next sunrise
                let xEnd = getPixelForExactTime(chartEndTime);
                for (let j = i + 1; j < events.length; j++) {
                  if (events[j].type === 'sunrise') {
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
            
            ctx.restore();
          }
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
                return scales.x.getPixelForValue(beforeIdx >= 0 ? beforeIdx : afterIdx);
              }
              if (beforeIdx === -1) return scales.x.getPixelForValue(0);
              if (afterIdx === -1) return scales.x.getPixelForValue(labels.length - 1);
              
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
          }
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
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted") || "#8aa0b6";
            
            ticks.forEach((tick) => {
              const tickValue = tick.value;
              if (typeof tickValue !== "number" || tickValue < 0 || tickValue >= labels.length) return;
              
              const date = new Date(labels[tickValue]);
              const x = xScale.getPixelForValue(tickValue);
              
              // Only draw if within chart area
              if (x < chartArea.left || x > chartArea.right) return;
              
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
          }
        };

        // Vertical line for current time in same green as the clock
        const currentLine = {
          id: "currentLine",
          afterDatasetsDraw(chart) {
            if (nowIdx === -1) return;
            const { ctx, chartArea, scales } = chart;
            const x = scales.x.getPixelForValue(nowIdx);
            const timeColor = (els.nowTime && getComputedStyle(els.nowTime).color) || "#22c55e";
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.lineWidth = 2;
            ctx.strokeStyle = timeColor;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.restore();
          }
        };
  
        // ☀️ markers over the Sun Vibe line
        const sunMarkerPlugin = {
          id: "sunMarkers",
          afterDatasetsDraw(chart) {
            const { ctx, scales, chartArea } = chart;
            const sunDsIndex   = chart.data.datasets.findIndex(d => d.label === "Sun Vibe");
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
                return scales.x.getPixelForValue(beforeIdx >= 0 ? beforeIdx : afterIdx);
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

            markers.forEach(m => {
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
              if (beforeIdx === afterIdx && beforeIdx >= 0 && beforeIdx < sunData.length) {
                // Exact match
                ySun = scales.y.getPixelForValue(sunData[beforeIdx]);
              } else if (beforeIdx >= 0 && afterIdx >= 0 && beforeIdx < sunData.length && afterIdx < sunData.length) {
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
          }
        };
  
        // Create highlight dataset if selection exists (for legend only)
        const highlightDataset = selectionRange ? (() => {
          // Create a dataset for the legend only (plugin handles actual drawing on chart)
          // Use a minimal visible area so it shows in legend but doesn't interfere
          const minVal = Math.min(...shadeVals, ...sunVals);
          const highlightData = labels.map((labelTime) => {
            const time = new Date(labelTime);
            // Show data in the highlighted range at the bottom of the chart
            if (time >= selectionRange.startTime && time <= selectionRange.endTime) {
              return minVal - 2; // Just below the minimum, still visible
            }
            return null;
          });
          
          return {
            label: "Highlighted Vibes",
            data: highlightData,
            type: "line",
            borderWidth: 0,
            borderColor: "rgba(34, 197, 94, 0.3)",
            backgroundColor: "rgba(34, 197, 94, 0.15)",
            pointRadius: 0,
            fill: false, // Don't fill - plugin handles the visual highlight
            showLine: false, // Don't draw line - plugin handles the visual highlight
            tension: 0,
            order: -1, // Draw behind other datasets
            hidden: false // Visible in legend but won't draw on chart
          };
        })() : null;

        const datasets = [
          { label: "Sun Vibe",   data: sunVals,   borderWidth: 2, borderColor: "#ffb86b", backgroundColor: "#ffb86b", pointRadius: 0, tension: 0.3 },
          { label: "Shade Vibe", data: shadeVals, borderWidth: 2, borderColor: "#6ea8fe", backgroundColor: "#6ea8fe", pointRadius: 0, tension: 0.3 }
        ];
        
        // Add highlight dataset if it exists (at the end for legend order)
        if (highlightDataset) {
          datasets.push(highlightDataset); // Add at end so it appears last in legend
        }

        // Hide skeleton, show chart
        hideChartLoading();
        
        vibeChart = new Chart(ctx, {
          type: "line",
          data: {
            labels: displayLabels,
            datasets: datasets
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            layout: {
              padding: {
                bottom: 40 // Extra space for two-line labels
              }
            },
            scales: {
              x: { 
                ticks: { 
                  maxRotation: 0, 
                  autoSkip: true, 
                  maxTicksLimit: 20,
                  callback: function(value, index) {
                    // Return empty string to hide default labels (we'll draw custom ones)
                    return "";
                  }
                },
                grid: {
                  drawOnChartArea: true
                }
              },
              y: {
                ticks: { callback: (val) => `${typeof val === "number" ? val : Number(val)}°` },
                suggestedMin: Math.min(...shadeVals, ...sunVals) - 3,
                suggestedMax: Math.max(...shadeVals, ...sunVals) + 3
              }
            },
            plugins: {
              legend: { display: true, labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 14, boxHeight: 8 } },
              tooltip: {
                itemSort: (a, b) => {
                  const order = ["Sun Vibe", "Shade Vibe", "Highlighted Vibes"];
                  return order.indexOf(a.dataset.label) - order.indexOf(b.dataset.label);
                },
                filter: (item) => item.dataset.label !== "Highlighted Vibes", // Hide highlight from tooltip
                callbacks: {
                  // Keep the time label as title
                  title: (items) => items?.[0]?.label ?? "",
                  // Custom label: "Sun: 84.9° Balanced, light layers"
                  label: (ctx) => {
                    if (ctx.dataset.label === "Highlighted Vibes") return null; // Don't show in tooltip
                    const short = ctx.dataset.label === "Sun Vibe" ? "Sun" : "Shade";
                    const tempDisplay = Number(ctx.parsed.y).toFixed(1); // already in current unit
                    let desc = "";
                    try {
                      const i = ctx.dataIndex;
                      const ts = window.timelineState;
                      if (ts && Number.isFinite(i)) {
                        const isDay  = !!ts.isDayByHour?.[i];
                        const solar  = ts.solarByHour?.[i] ?? 0;
                        const tempF  = ctx.dataset.label === "Sun Vibe" ? ts.sunVals?.[i] : ts.shadeVals?.[i]; // °F
                        const context = ctx.dataset.label === "Sun Vibe" ? "sun" : "shade";
                        if (typeof tempF === "number") {
                          desc = vibeDescriptor(tempF, { solar, isDay, context }) || "";
                        }
                      }
                    } catch {}
                    return desc ? `${short}: ${tempDisplay}° ${desc}` : `${short}: ${tempDisplay}°`;
                  }
                }
              }
            }
          },
          plugins: [dayNightShadingPlugin, selectionHighlightPlugin, currentLine, sunMarkerPlugin, timelineLabelsPlugin]
        });
  
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
          if (Number.isFinite(idx) && idx >= 0 && idx < timelineState.labels.length) {
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
            selectionStartX = e.clientX;
            selectionStartTime = getTimeFromClientX(e.clientX);
            try { els.chartCanvas.setPointerCapture(e.pointerId); } catch {}
            e.preventDefault();
          } else {
            isPointerDown = true;
            try { els.chartCanvas.setPointerCapture(e.pointerId); } catch {}
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
              const startTime = currentTime < selectionStartTime ? currentTime : selectionStartTime;
              const endTime = currentTime > selectionStartTime ? currentTime : selectionStartTime;
              selectionRange = { startTime, endTime };
              vibeChart.update('none');
            }
          } else {
            const isMouse = e.pointerType === "mouse";
            if (isMouse || isPointerDown) updateFromClientX(e.clientX);
          }
        });
        
        function endPointer(e){
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
              try { els.chartCanvas.releasePointerCapture(e.pointerId); } catch {}
              return;
            }
            
            if (endTime && selectionStartTime) {
              const startTime = endTime < selectionStartTime ? endTime : selectionStartTime;
              const finalEndTime = endTime > selectionStartTime ? endTime : selectionStartTime;
              
              // Only create selection if it's meaningful (at least 5 minutes)
              const duration = Math.abs(finalEndTime - startTime);
              if (duration >= 5 * 60 * 1000) {
                selectionRange = { startTime, endTime: finalEndTime };
                vibeChart.update('none');
                
                // Copy URL to clipboard and update browser URL
                const url = generateShareURL(startTime, finalEndTime);
                
                // Update browser URL without page refresh
                const urlObj = new URL(url);
                history.pushState({}, "", urlObj.pathname + urlObj.search);
                
                (async () => {
                  const success = await copyToClipboard(url);
                  if (success) {
                    showNotification("Link copied to clipboard! Share this URL to show this time range.", "success");
                  } else {
                    showNotification("Failed to copy to clipboard. URL: " + url, "error", 5000);
                  }
                })();
                
                // Generate weather summary
                updateWeatherSummary();
              } else {
                selectionRange = null;
                vibeChart.update('none');
              }
            }
            isSelecting = false;
            selectionStartX = null;
            selectionStartTime = null;
            hasMoved = false;
            touchStartTime = null;
            try { els.chartCanvas.releasePointerCapture(e.pointerId); } catch {}
          } else {
            isPointerDown = false;
            try { els.chartCanvas.releasePointerCapture(e.pointerId); } catch {}
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
        const { sunriseToday, sunsetToday, sunriseTomorrow, sunsetTomorrow } = sunTimes;
        const candidates = [sunriseToday, sunsetToday, sunriseTomorrow, sunsetTomorrow]
          .filter(Boolean).filter(t => t > now).sort((a,b) => a - b);
        if (!candidates.length) return null;
        const next = candidates[0];
        const isSunrise = next === sunTimes.sunriseToday || next === sunTimes.sunriseTomorrow;
        return { next, kind: isSunrise ? "Sunrise" : "Sunset" };
      }
      function updateClockCard() {
        // Remove skeleton from clock card
        const nowTimeEl = els.nowTime;
        const nowSubLabelEl = els.nowSubLabel;
        if (nowTimeEl && nowTimeEl.classList.contains('skeleton-text')) {
          nowTimeEl.classList.remove('skeleton-text');
        }
        if (nowSubLabelEl && nowSubLabelEl.classList.contains('skeleton-text')) {
          nowSubLabelEl.classList.remove('skeleton-text');
        }
        const now = new Date();
        els.nowTime && (els.nowTime.textContent = fmtHM(now));
        const nxt = chooseNextSunEvent();
        els.nowSubLabel && (els.nowSubLabel.textContent = nxt ? `${nxt.kind} at ${fmtHM(nxt.next)}` : "—");
      }
  
      function paintRealtimeCards() {
        compute();
        if (els.sunCard) els.sunCard.style.display = isDaylightNow() ? "" : "none";
        els.nowTime && (els.nowTime.textContent = fmtHM(new Date()));
        paintCurrentTimeTitle();
      }
  
      function paintSimulatedIndex(i) {
        if (!timelineState) return;
        const { labels, shadeVals, sunVals, solarByHour, isDayByHour } = timelineState;
        if (i < 0 || i >= labels.length) return;
  
        const dt = labels[i];
        els.nowTime && (els.nowTime.textContent = fmtHM(dt));
        paintCurrentTimeTitle();
  
        const isDay = !!isDayByHour[i];
        if (els.sunCard) els.sunCard.style.display = isDay ? "" : "none";
  
        const shadeDisp = toUserTemp(shadeVals[i]);
        const sunDisp   = toUserTemp(sunVals[i]);
  
        els.shade && (els.shade.innerHTML = `${shadeDisp.toFixed(1)}${unitSuffix()}`);
        if (isDay && els.sun) els.sun.innerHTML = `${sunDisp.toFixed(1)}${unitSuffix()}`;

        const simSolar = solarByHour[i];
        els.shadeLabel && (els.shadeLabel.innerHTML = vibeDescriptor(shadeVals[i], { solar: simSolar, isDay, context: "shade" }));
        if (isDay && els.sunLabel) els.sunLabel.innerHTML = vibeDescriptor(sunVals[i], { solar: simSolar, isDay, context: "sun" });
        if (!isDay && els.sunLabel) els.sunLabel.innerHTML = "";
        
        // Remove skeleton loading state
        hideCardLoading();
      }
  
      // Scheduler
      function clearPollTimer() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }
      function scheduleNextTick(minutes) {
        const ms = Math.max(0.5, parseFloat(minutes) || 1) * 60 * 1000;
        nextUpdateAt = new Date(Date.now() + ms);
        els.nextUpdated && (els.nextUpdated.textContent = fmtHMS(nextUpdateAt));
        pollTimer = setTimeout(runUpdateCycle, ms);
      }
      async function runUpdateCycle() {
        if (!lastCoords) { scheduleNextTick(els.updateInterval?.value || 1); return; }
        
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
            wantHourly ? getHourlyWeather(latitude, longitude) : Promise.resolve(null)
          ]);
  
          if (typeof cur.is_day === "number") currentIsDay = cur.is_day;
  
          const tempF = (cur.temperature_2m ?? cur.apparent_temperature ?? null);
          if (tempF != null) els.temp.value = (unit === "F" ? tempF : fToC(tempF)).toFixed(1);
          els.humidity.value = (cur.relative_humidity_2m ?? "").toFixed(0);
          els.wind.value = (cur.wind_speed_10m ?? "").toFixed(1);
  
          if (typeof cur.uv_index === "number" && (typeof cur.is_day === "number" || typeof cur.is_day === "boolean")) {
            const solar = solarFromUVandCloud({
              uv_index: cur.uv_index, uv_index_clear_sky: cur.uv_index_clear_sky,
              cloud_cover: cur.cloud_cover ?? 0, is_day: cur.is_day
            });
            els.solar.value = solar.toFixed(1);
            els.solarVal.textContent = solar.toFixed(1);
          } else if (typeof cur.cloud_cover === "number") {
            autoSolarFromCloudCover(cur.cloud_cover);
          }
  
          compute();
          updateClockCard();
          paintCurrentTimeTitle();
  
          if (hourlyMaybe) {
            // Refetch sunrise/sunset data if needed (in case days ahead changed)
            try {
              const dailySun = await getDailySun(latitude, longitude, daysAhead);
              sunTimes = dailySun;
            } catch (e) {
              // If fetch fails, continue with existing sunTimes
            }
            showChartLoading();
            const ds = buildTimelineDataset(hourlyMaybe);
            timelineState = ds;
            window.timelineState = timelineState; // expose for tooltip descriptors
            await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
            chartStatusEl && (chartStatusEl.textContent = "Timeline based on hourly forecast.");
            // Update summary if selection exists (weather data may have changed)
            if (selectionRange) {
              updateWeatherSummary();
            }
          }
  
          const nowTime = new Date();
          els.lastUpdated && (els.lastUpdated.textContent = fmtHMS(nowTime));
        } catch (e) {
          console.warn("Update cycle failed", e);
          // Don't show error for update cycle failures, just log them
          // User can manually retry with "Update Now" button
        } finally {
          scheduleNextTick(els.updateInterval?.value || 1);
        }
      }
      function restartScheduler() { clearPollTimer(); scheduleNextTick(els.updateInterval?.value || 1); }
  
      // Prime weather
      async function primeWeatherForCoords(latitude, longitude, sourceLabel = "") {
        statusEl && (statusEl.textContent = sourceLabel ? `Getting weather for ${sourceLabel}…` : "Getting weather…");
        showChartLoading();
        try {
          const [cur, hourly, dailySun] = await Promise.all([
            getCurrentWeather(latitude, longitude),
            getHourlyWeather(latitude, longitude),
            getDailySun(latitude, longitude, daysAhead)
          ]);
          sunTimes = dailySun;
          lastCoords = { latitude, longitude };
  
          currentPlaceName = await getPlaceName(latitude, longitude);
          paintCurrentTimeTitle();
  
          const tempF = (cur.temperature_2m ?? cur.apparent_temperature ?? null);
          if (tempF != null) els.temp.value = (unit === "F" ? tempF : fToC(tempF)).toFixed(1);
          els.humidity.value = (cur.relative_humidity_2m ?? "").toFixed(0);
          els.wind.value = (cur.wind_speed_10m ?? "").toFixed(1);
          if (typeof cur.is_day === "number") currentIsDay = cur.is_day;
  
          if (typeof cur.uv_index === "number" && (typeof cur.is_day === "number" || typeof cur.is_day === "boolean")) {
            const solar = solarFromUVandCloud({
              uv_index: cur.uv_index, uv_index_clear_sky: cur.uv_index_clear_sky,
              cloud_cover: cur.cloud_cover ?? 0, is_day: cur.is_day
            });
            els.solar.value = solar.toFixed(1);
            els.solarVal.textContent = solar.toFixed(1);
          } else if (typeof cur.cloud_cover === "number") {
            autoSolarFromCloudCover(cur.cloud_cover);
          }
  
          compute();
          updateClockCard();
          paintCurrentTimeTitle();
  
          chartStatusEl && (chartStatusEl.textContent = "Loading timeline…");
          showChartLoading();
          const ds = buildTimelineDataset(hourly);
          timelineState = ds;
          window.timelineState = timelineState; // expose for tooltip descriptors
          await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
          chartStatusEl && (chartStatusEl.textContent = "Timeline based on hourly forecast.");
          // Update summary if selection exists (weather data may have changed)
          if (selectionRange) {
            updateWeatherSummary();
          }
  
          const nowTime = new Date();
          els.lastUpdated && (els.lastUpdated.textContent = fmtHMS(nowTime));
          statusEl && (statusEl.textContent = sourceLabel ? `Using ${sourceLabel}` : "Using chosen coordinates");
          restartScheduler();
          hideError();
        } catch (e) {
          log(e);
          let errorTitle = "Weather Fetch Failed";
          let errorDetails = "Could not retrieve weather data.";
          let errorSuggestion = "Please try again or check your connection.";
          let retryCallback = () => primeWeatherForCoords(latitude, longitude, sourceLabel);
          
          if (e.message === "RATE_LIMIT") {
            errorTitle = "Rate Limit Exceeded";
            errorDetails = "Too many requests to the weather service. Please wait a moment.";
            errorSuggestion = "Wait a few seconds and try again.";
          } else if (e.message === "SERVER_ERROR") {
            errorTitle = "Weather Service Error";
            errorDetails = "The weather service is temporarily unavailable.";
            errorSuggestion = "Please try again in a moment.";
          } else if (e.message === "NETWORK_ERROR") {
            errorTitle = "Network Error";
            errorDetails = "Could not connect to the weather service. Check your internet connection.";
            errorSuggestion = "Check your connection and try again.";
          } else if (e.message === "INVALID_RESPONSE") {
            errorTitle = "Invalid Response";
            errorDetails = "Received unexpected data from the weather service.";
            errorSuggestion = "Please try again.";
          }
          
          showError(errorTitle, errorDetails, errorSuggestion, retryCallback);
          statusEl && (statusEl.textContent = "Failed to fetch weather data.");
          chartStatusEl && (chartStatusEl.textContent = "Timeline unavailable without weather.");
        }
      }
  
      // Geolocation
      function useLocation() {
        statusEl && (statusEl.textContent = "Getting location…");
        hideError();
        if (!navigator.geolocation) {
          showError(
            "Geolocation Unavailable",
            "Your browser doesn't support location services.",
            "Please enter a ZIP code or coordinates manually in Advanced Configuration."
          );
          statusEl && (statusEl.textContent = "Geolocation unavailable. Enter values manually.");
          return;
        }
        navigator.geolocation.getCurrentPosition(async pos => {
          const { latitude, longitude } = pos.coords;
          try { 
            await primeWeatherForCoords(latitude, longitude, "device location");
            hideError();
          }
          catch (e) {
            log(e);
            let errorTitle = "Weather Fetch Failed";
            let errorDetails = "Could not retrieve weather data.";
            let errorSuggestion = "Please try again or enter a ZIP code manually.";
            let retryCallback = () => useLocation();
            
            if (e.message === "RATE_LIMIT") {
              errorTitle = "Rate Limit Exceeded";
              errorDetails = "Too many requests to the weather service. Please wait a moment.";
              errorSuggestion = "Wait a few seconds and try again.";
            } else if (e.message === "SERVER_ERROR") {
              errorTitle = "Weather Service Error";
              errorDetails = "The weather service is temporarily unavailable.";
              errorSuggestion = "Please try again in a moment.";
            } else if (e.message === "NETWORK_ERROR") {
              errorTitle = "Network Error";
              errorDetails = "Could not connect to the weather service. Check your internet connection.";
              errorSuggestion = "Check your connection and try again, or enter a ZIP code manually.";
            } else if (e.message === "INVALID_RESPONSE") {
              errorTitle = "Invalid Response";
              errorDetails = "Received unexpected data from the weather service.";
              errorSuggestion = "Please try again or enter a ZIP code manually.";
            }
            
            showError(errorTitle, errorDetails, errorSuggestion, retryCallback);
            statusEl && (statusEl.textContent = "Could not fetch weather. Enter values manually.");
            chartStatusEl && (chartStatusEl.textContent = "Timeline unavailable without weather.");
          }
        }, err => {
          log(err);
          let errorTitle = "Location Access Denied";
          let errorDetails = "Location permission was denied or unavailable.";
          let errorSuggestion = "Please allow location access or enter a ZIP code manually in Advanced Configuration.";
          
          if (err.code === err.PERMISSION_DENIED) {
            errorTitle = "Location Permission Denied";
            errorDetails = "Location access was denied. Please enable location permissions in your browser settings.";
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorTitle = "Location Unavailable";
            errorDetails = "Could not determine your location.";
          } else if (err.code === err.TIMEOUT) {
            errorTitle = "Location Request Timeout";
            errorDetails = "Location request took too long.";
            errorSuggestion = "Please try again or enter a ZIP code manually.";
          }
          
          showError(errorTitle, errorDetails, errorSuggestion);
          statusEl && (statusEl.textContent = "Location denied. Enter values manually or set a ZIP.");
          chartStatusEl && (chartStatusEl.textContent = "Timeline unavailable without location.");
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
      }
  
      // Inputs auto-update
      ["input","change"].forEach(evt => {
        ["temp","humidity","wind","solar","reflect","reflectCustom"].forEach(id => {
          const el = els[id];
          el && el.addEventListener(evt, () => {
            compute();
            if ((id === "reflect" || id === "reflectCustom") && lastCoords) {
              getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
                .then(async (hourly) => {
                  const ds = buildTimelineDataset(hourly);
                  timelineState = ds;
                  window.timelineState = timelineState;
                  await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
                })
              .catch(()=>{});
          }
        });
      });
      
      // Time preset functions
      function setTimePreset(preset) {
        // Clear active state from all presets
        [presetTodayBtn, presetTomorrowBtn, preset3DaysBtn, presetWeekBtn].forEach(btn => {
          if (btn) btn.classList.remove("active");
        });
        
        let newDaysAhead = daysAhead;
        let startFromTomorrow = false;
        
        switch(preset) {
          case "today":
            newDaysAhead = 1;
            startFromTomorrow = false;
            if (presetTodayBtn) presetTodayBtn.classList.add("active");
            break;
          case "tomorrow":
            newDaysAhead = 1;
            startFromTomorrow = true;
            if (presetTomorrowBtn) presetTomorrowBtn.classList.add("active");
            break;
          case "3days":
            newDaysAhead = 3;
            startFromTomorrow = false;
            if (preset3DaysBtn) preset3DaysBtn.classList.add("active");
            break;
          case "week":
            newDaysAhead = 7;
            startFromTomorrow = false;
            if (presetWeekBtn) presetWeekBtn.classList.add("active");
            break;
        }
        
        daysAhead = newDaysAhead;
        if (els.daysAhead) els.daysAhead.value = daysAhead;
        localStorage.setItem(DAYS_AHEAD_KEY, String(daysAhead));
        
        // Update chart title
        if (preset === "tomorrow") {
          if (chartTitleEl) chartTitleEl.textContent = "Tomorrow";
        } else {
          updateChartTitle();
        }
        
        // Update chart if we have data
        if (lastCoords) {
          getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
            .then(async (hourly) => {
              try {
                const dailySun = await getDailySun(lastCoords.latitude, lastCoords.longitude, daysAhead);
                sunTimes = dailySun;
              } catch (e) {
                console.warn("Failed to fetch sun times:", e);
              }
              let ds = buildTimelineDataset(hourly);
              
              // For "tomorrow" preset, filter to start from tomorrow
              if (startFromTomorrow && ds.labels.length > 0) {
                const now = new Date();
                const tomorrowStart = new Date(now);
                tomorrowStart.setDate(tomorrowStart.getDate() + 1);
                tomorrowStart.setHours(0, 0, 0, 0);
                
                const tomorrowEnd = new Date(tomorrowStart);
                tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
                
                const filteredIndices = [];
                for (let i = 0; i < ds.labels.length; i++) {
                  const labelTime = new Date(ds.labels[i]);
                  if (labelTime >= tomorrowStart && labelTime < tomorrowEnd) {
                    filteredIndices.push(i);
                  }
                }
                
                if (filteredIndices.length > 0) {
                  ds = {
                    labels: filteredIndices.map(i => ds.labels[i]),
                    shadeVals: filteredIndices.map(i => ds.shadeVals[i]),
                    sunVals: filteredIndices.map(i => ds.sunVals[i]),
                    solarByHour: filteredIndices.map(i => ds.solarByHour[i]),
                    isDayByHour: filteredIndices.map(i => ds.isDayByHour[i]),
                    now: ds.now
                  };
                }
              }
              
              timelineState = ds;
              window.timelineState = timelineState;
              await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
              if (selectionRange) {
                updateWeatherSummary();
              }
            })
            .catch(() => {});
        }
      }

      // Time preset buttons
      presetTodayBtn && presetTodayBtn.addEventListener("click", () => setTimePreset("today"));
      presetTomorrowBtn && presetTomorrowBtn.addEventListener("click", () => setTimePreset("tomorrow"));
      preset3DaysBtn && preset3DaysBtn.addEventListener("click", () => setTimePreset("3days"));
      presetWeekBtn && presetWeekBtn.addEventListener("click", () => setTimePreset("week"));
      els.solar && els.solar.addEventListener("input", () => { els.solarVal && (els.solarVal.textContent = parseFloat(els.solar.value).toFixed(1)); });
  
      // Unit toggle
      function setUnit(newUnit, { persist = true, rerender = true } = {}) {
        if (newUnit !== "F" && newUnit !== "C") return;
        if (newUnit === unit) return;
        convertTempInputIfPresent(newUnit);
        unit = newUnit;
        persist && localStorage.setItem(UNIT_KEY, unit);
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
                await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
                // Update weather summary if there's a selection
                if (selectionRange) {
                  updateWeatherSummary();
                }
              })
              .catch(()=>{});
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
              .then(({ latitude, longitude, place }) => primeWeatherForCoords(latitude, longitude, `ZIP ${zipVal} (${place})`))
              .catch(()=>{});
          }
        }
      });
  
      // Scheduler controls
      function clearPollTimer() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }
      els.updateInterval && els.updateInterval.addEventListener("change", () => { clearPollTimer(); scheduleNextTick(els.updateInterval?.value || 1); });
      els.updateHourlyToggle && els.updateHourlyToggle.addEventListener("change", () => { clearPollTimer(); scheduleNextTick(els.updateInterval?.value || 1); });
      els.updateNow && els.updateNow.addEventListener("click", () => { clearPollTimer(); runUpdateCycle(); });
      
      // Days ahead setting
      els.daysAhead && (els.daysAhead.value = daysAhead);
      updateChartTitle(); // Set initial title
      els.daysAhead && els.daysAhead.addEventListener("change", () => {
        const newValue = parseInt(els.daysAhead.value, 10);
        if (newValue >= 1 && newValue <= 7) {
          daysAhead = newValue;
          localStorage.setItem(DAYS_AHEAD_KEY, String(daysAhead));
          updateChartTitle();
          if (lastCoords) {
            Promise.all([
              getHourlyWeather(lastCoords.latitude, lastCoords.longitude),
              getDailySun(lastCoords.latitude, lastCoords.longitude, daysAhead)
            ])
              .then(async ([hourly, dailySun]) => {
                sunTimes = dailySun;
                const ds = buildTimelineDataset(hourly);
                timelineState = ds;
                window.timelineState = timelineState;
                await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
              })
              .catch(() => {});
          }
        }
      });
      
      // Night shading toggle
      els.nightShadingToggle && (els.nightShadingToggle.checked = nightShadingEnabled);
      els.nightShadingToggle && els.nightShadingToggle.addEventListener("change", () => {
        nightShadingEnabled = els.nightShadingToggle.checked;
        localStorage.setItem(NIGHT_SHADING_KEY, String(nightShadingEnabled));
        // Update chart if it exists
        if (vibeChart) {
          vibeChart.update('none');
        }
      });
  
      // ZIP actions
      zipEls.btn && zipEls.btn.addEventListener("click", async () => {
        const raw = zipEls.input?.value;
        const zip5 = normalizeZip(raw);
        if (!zip5) { 
          showError(
            "Invalid ZIP Code",
            "Please enter a valid US ZIP code (e.g., 20001 or 20001-1234).",
            ""
          );
          zipEls.status && (zipEls.status.textContent = "Enter a valid US ZIP (e.g., 20001 or 20001-1234)"); 
          return; 
        }
        try {
          hideError();
          zipEls.status && (zipEls.status.textContent = "Looking up ZIP…");
          const { latitude, longitude, place } = await getCoordsForZip(zip5);
          localStorage.setItem(ZIP_KEY, zip5);
          zipEls.status && (zipEls.status.textContent = `Using ZIP ${zip5} (${place})`);
          await primeWeatherForCoords(latitude, longitude, `ZIP ${zip5} (${place})`);
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
            errorSuggestion = "Please verify the ZIP code and try again, or use your device location.";
          } else if (e.message === "ZIP_LOOKUP_FAILED") {
            errorTitle = "ZIP Lookup Service Error";
            errorDetails = "The ZIP lookup service is temporarily unavailable.";
            errorSuggestion = "Please try again in a moment or use your device location.";
            retryCallback = () => zipEls.btn?.click();
          }
          
          showError(errorTitle, errorDetails, errorSuggestion, retryCallback);
          zipEls.status && (zipEls.status.textContent = "Couldn't find that ZIP.");
        }
      });
      zipEls.clear && zipEls.clear.addEventListener("click", () => {
        localStorage.removeItem(ZIP_KEY);
        zipEls.input && (zipEls.input.value = "");
        zipEls.status && (zipEls.status.textContent = "Cleared ZIP. Using device location when available.");
        useLocation();
      });
  
      // Buttons
      els.useLocationBtn && els.useLocationBtn.addEventListener("click", useLocation);
      
      // Clear highlight button
      clearHighlightBtn && clearHighlightBtn.addEventListener("click", () => {
        selectionRange = null;
        if (vibeChart) vibeChart.update('none');
        clearHighlightBtn.style.display = "none";
        // Hide summary
        if (weatherSummaryEl) weatherSummaryEl.style.display = "none";
        if (copySummaryBtn) copySummaryBtn.style.display = "none";
        
        // Remove start and end from URL but keep other params
        const params = new URLSearchParams(location.search);
        params.delete("start");
        params.delete("end");
        const newUrl = params.toString() 
          ? `${location.pathname}?${params.toString()}`
          : location.pathname;
        history.pushState({}, "", newUrl);
      });

      // Copy summary button
      copySummaryBtn && copySummaryBtn.addEventListener("click", async () => {
        if (!summaryTextEl || !summaryTextEl.textContent) return;
        const summaryText = summaryTextEl.textContent.trim();
        if (!summaryText || summaryText === "Generating summary..." || summaryText === "Unable to generate summary at this time.") return;
        
        const success = await copyToClipboard(summaryText);
        if (success) {
          showNotification("Summary copied to clipboard!", "success");
        } else {
          showNotification("Failed to copy summary. Please select and copy manually.", "error", 5000);
        }
      });

      // Expired selection modal buttons
      keepCustomBtn && keepCustomBtn.addEventListener("click", handleKeepCustomSettings);
      useDefaultsBtn && useDefaultsBtn.addEventListener("click", handleUseDefaults);
      
      // Close modal on ESC key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && expiredModalEl && expiredModalEl.style.display !== "none") {
          hideExpiredSelectionModal();
        }
      });
      
      // Close modal on overlay click
      expiredModalEl && expiredModalEl.addEventListener("click", (e) => {
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

      closeShortcutsBtn && closeShortcutsBtn.addEventListener("click", hideShortcutsModal);
      
      shortcutsModalEl && shortcutsModalEl.addEventListener("click", (e) => {
        if (e.target === shortcutsModalEl) {
          hideShortcutsModal();
        }
      });

      // Global keyboard shortcuts
      document.addEventListener("keydown", (e) => {
        // Don't trigger shortcuts when typing in inputs
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) {
          // Allow Escape to work even in inputs
          if (e.key === "Escape") {
            e.target.blur();
            if (shortcutsModalEl && shortcutsModalEl.style.display !== "none") {
              hideShortcutsModal();
            }
            if (expiredModalEl && expiredModalEl.style.display !== "none") {
              hideExpiredSelectionModal();
            }
            if (selectionRange) {
              selectionRange = null;
              if (clearHighlightBtn) clearHighlightBtn.style.display = "none";
              if (weatherSummaryEl) weatherSummaryEl.style.display = "none";
              if (copySummaryBtn) copySummaryBtn.style.display = "none";
              if (vibeChart) vibeChart.update('none');
            }
          }
          return;
        }

        // C - Clear highlight
        if (e.key === "c" || e.key === "C") {
          if (selectionRange) {
            selectionRange = null;
            if (clearHighlightBtn) clearHighlightBtn.style.display = "none";
            if (weatherSummaryEl) weatherSummaryEl.style.display = "none";
            if (copySummaryBtn) copySummaryBtn.style.display = "none";
            if (vibeChart) vibeChart.update('none');
            
            // Remove start and end from URL
            const params = new URLSearchParams(location.search);
            params.delete("start");
            params.delete("end");
            const newUrl = params.toString() 
              ? `${location.pathname}?${params.toString()}`
              : location.pathname;
            history.pushState({}, "", newUrl);
          }
        }

        // S - Share/copy selection URL
        if (e.key === "s" || e.key === "S") {
          if (selectionRange) {
            const url = generateShareURL(selectionRange.startTime, selectionRange.endTime);
            copyToClipboard(url).then(success => {
              if (success) {
                showNotification("Link copied to clipboard! Share this URL to show this time range.", "success");
              } else {
                showNotification("Failed to copy to clipboard. URL: " + url, "error", 5000);
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
          } else if (expiredModalEl && expiredModalEl.style.display !== "none") {
            hideExpiredSelectionModal();
          }
        }
      });
  
      // Clock tick
      setInterval(updateClockCard, 60 * 1000);
  
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
            localStorage.setItem(DAYS_AHEAD_KEY, String(daysAhead));
            if (els.daysAhead) els.daysAhead.value = daysAhead;
            updateChartTitle();
          }
        }
        
        // Apply location (lat/lon or zip)
        const urlLat = params.get("lat");
        const urlLon = params.get("lon");
        const urlZip = params.get("zip");
        
        if (urlLat && urlLon) {
          const lat = parseFloat(urlLat);
          const lon = parseFloat(urlLon);
          if (!isNaN(lat) && !isNaN(lon)) {
            primeWeatherForCoords(lat, lon, "shared location");
          }
        } else if (urlZip) {
          const zip5 = normalizeZip(urlZip);
          if (zip5) {
            if (zipEls.input) zipEls.input.value = zip5;
            getCoordsForZip(zip5)
              .then(({ latitude, longitude, place }) => primeWeatherForCoords(latitude, longitude, `ZIP ${zip5} (${place})`))
              .catch(() => {});
          }
        }
        
        // Apply time range selection
        const urlStart = params.get("start");
        const urlEnd = params.get("end");
        if (urlStart && urlEnd) {
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
            // Update chart if it already exists
            if (vibeChart) {
              vibeChart.update('none');
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
        statusEl && (statusEl.textContent = "Trying to get your local weather…");
        updateClockCard();

        // Apply URL parameters first
        applyURLParameters();
        
        // If no location was set from URL, use saved ZIP or device location
        if (!lastCoords) {
          const savedZip = localStorage.getItem(ZIP_KEY);
          if (savedZip && zipEls.input) {
            zipEls.input.value = savedZip;
            getCoordsForZip(savedZip)
              .then(({ latitude, longitude, place }) => primeWeatherForCoords(latitude, longitude, `ZIP ${savedZip} (${place})`))
              .catch(() => useLocation());
          } else {
            useLocation();
          }
        }
      }, 300);
    });
  });
})();