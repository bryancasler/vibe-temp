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
  
    // DOM ready helper
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
      let unit = (localStorage.getItem(UNIT_KEY) === "C") ? "C" : "F";
      let lastCoords = null;
      let vibeChart = null;
      let pollTimer = null;
      let nextUpdateAt = null;
  
      let sunTimes = { sunriseToday: null, sunsetToday: null, sunriseTomorrow: null, sunsetTomorrow: null };
      let currentIsDay = null;
      let currentPlaceName = "";
  
      let timelineState = null;  // { labels, shadeVals, sunVals, solarByHour, isDayByHour, now } all in °F
      window.timelineState = null; // expose for tooltip use
      let simActive = false;
  
      const DEBUG = new URLSearchParams(location.search).get("debug") === "true";
      const log = (...a) => { if (DEBUG) console.log("[Vibe]", ...a); };
  
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
        const airTempLabel = document.querySelector('label:has(#temp)');
        if (airTempLabel) {
          const nodes = Array.from(airTempLabel.childNodes);
          const textNode = nodes.find(n => n.nodeType === Node.TEXT_NODE);
          if (textNode) textNode.textContent = unit === "F" ? "Air Temp (°F)\n" : "Air Temp (°C)\n";
        }
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
        const r = await fetch(`https://api.zippopotam.us/us/${zip5}`);
        if (!r.ok) throw new Error("ZIP lookup failed");
        const data = await r.json();
        const p = data.places?.[0];
        if (!p) throw new Error("ZIP not found");
        return {
          latitude: parseFloat(p.latitude),
          longitude: parseFloat(p.longitude),
          place: `${p["place name"]}, ${p["state abbreviation"]}`
        };
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
        const baseUV = (typeof uv_index_clear_sky === "number" && uv_index_clear_sky > 0)
          ? uv_index / uv_index_clear_sky
          : (typeof uv_index === "number" ? uv_index / 10 : 0);
        const cloudAtten = 1 - Math.pow((cloud_cover ?? 0) / 100, 0.7);
        const solar = (is_day ? baseUV * cloudAtten : 0);
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
        const sunF   = sunVibeOf(shadeF, Solar, reflectivity());
  
        const shadeDisplay = toUserTemp(shadeF);
        const sunDisplay   = toUserTemp(sunF);
  
        els.shade && (els.shade.textContent = `${shadeDisplay.toFixed(1)}${unitSuffix()}`);
        els.sun   && (els.sun.textContent   = `${sunDisplay.toFixed(1)}${unitSuffix()}`);
  
        els.shadeLabel && (els.shadeLabel.textContent = vibeDescriptor(shadeF, { solar: Solar, isDay: isDaylightNow(), context: "shade" }));
        els.sunLabel   && (els.sunLabel.textContent   = vibeDescriptor(sunF,   { solar: Solar, isDay: isDaylightNow(), context: "sun" }));
  
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
  
      // API
      async function getCurrentWeather(lat, lon) {
        const params = new URLSearchParams({
          latitude: lat, longitude: lon,
          current: "temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,is_day",
          temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "auto"
        });
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!r.ok) throw new Error("Weather fetch failed");
        const data = await r.json();
        return data.current;
      }
      async function getHourlyWeather(lat, lon) {
        const params = new URLSearchParams({
          latitude: lat, longitude: lon,
          hourly: "temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,uv_index,uv_index_clear_sky,is_day",
          temperature_unit: "fahrenheit", wind_speed_unit: "mph", timezone: "auto"
        });
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!r.ok) throw new Error("Hourly fetch failed");
        const data = await r.json();
        return data.hourly;
      }
      async function getDailySun(lat, lon) {
        const params = new URLSearchParams({
          latitude: lat, longitude: lon, daily: "sunrise,sunset", timezone: "auto"
        });
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        if (!r.ok) throw new Error("Daily fetch failed");
        const data = await r.json();
        const rises = data?.daily?.sunrise?.map(t => new Date(t)) ?? [];
        const sets  = data?.daily?.sunset?.map(t => new Date(t)) ?? [];
        return {
          sunriseToday:    rises[0] ?? null,
          sunsetToday:     sets[0]  ?? null,
          sunriseTomorrow: rises[1] ?? null,
          sunsetTomorrow:  sets[1]  ?? null
        };
      }
  
      // Timeline
      function buildTimelineDataset(hourly) {
        const now = new Date();
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now);   end.setDate(end.getDate()+2); end.setHours(0,0,0,0);
  
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
        const evts = [
          { t: sunTimes.sunriseToday,    emoji: "☀️", label: "Sunrise" },
          { t: sunTimes.sunsetToday,     emoji: "☀️", label: "Sunset"  },
          { t: sunTimes.sunriseTomorrow, emoji: "☀️", label: "Sunrise" },
          { t: sunTimes.sunsetTomorrow,  emoji: "☀️", label: "Sunset"  },
        ].filter(e => e.t);
        return evts.map(e => {
          const idx = nearestLabelIndex(labelDates, e.t);
          return { idx, emoji: e.emoji, label: e.label, when: e.t };
        }).filter(e => e.idx >= 0);
      }
  
      async function renderChart(labels, shadeValsF, sunValsFF, now) {
        if (!els.chartCanvas) return;
        await ensureChartJs();
        const ctx = els.chartCanvas.getContext("2d");
        if (!window.Chart) { console.warn("Chart.js failed to load."); return; }
        if (vibeChart) { vibeChart.destroy(); vibeChart = null; }
  
        const shadeVals = shadeValsF.map(v => toUserTemp(v));
        const sunVals   = sunValsFF.map(v => toUserTemp(v));
        const displayLabels = labels.map(d => d.toLocaleString([], { weekday: "short", hour: "numeric" }));
        const nowIdx = labels.findIndex(d => hourKey(d) === hourKey(now));
        const markers = buildSunMarkers(labels);
  
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
            const { ctx, scales } = chart;
            const sunDsIndex   = chart.data.datasets.findIndex(d => d.label === "Sun Vibe");
            if (sunDsIndex === -1) return;
            const sunData = chart.data.datasets[sunDsIndex].data; // display units
  
            ctx.save();
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.font = "16px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  
            markers.forEach(m => {
              if (m.idx < 0 || m.idx >= sunData.length) return;
              const x = scales.x.getPixelForValue(m.idx);
              const ySun = scales.y.getPixelForValue(sunData[m.idx]);
              ctx.fillText(m.emoji, x, ySun - 8);
            });
  
            ctx.restore();
          }
        };
  
        vibeChart = new Chart(ctx, {
          type: "line",
          data: {
            labels: displayLabels,
            datasets: [
              { label: "Sun Vibe",   data: sunVals,   borderWidth: 2, borderColor: "#ffb86b", backgroundColor: "#ffb86b", pointRadius: 0, tension: 0.3 },
              { label: "Shade Vibe", data: shadeVals, borderWidth: 2, borderColor: "#6ea8fe", backgroundColor: "#6ea8fe", pointRadius: 0, tension: 0.3 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 20 } },
              y: {
                ticks: { callback: (val) => `${typeof val === "number" ? val : Number(val)}°` },
                suggestedMin: Math.min(...shadeVals, ...sunVals) - 3,
                suggestedMax: Math.max(...shadeVals, ...sunVals) + 3
              }
            },
            plugins: {
              legend: { display: true, labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 14, boxHeight: 8 } },
              tooltip: {
                itemSort: (a, b) => ["Sun Vibe","Shade Vibe"].indexOf(a.dataset.label) - ["Sun Vibe","Shade Vibe"].indexOf(b.dataset.label),
                callbacks: {
                  // Keep the time label as title
                  title: (items) => items?.[0]?.label ?? "",
                  // Custom label: "Sun: 84.9° Balanced, light layers"
                  label: (ctx) => {
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
          plugins: [currentLine, sunMarkerPlugin]
        });
  
        // Pointer interactions: hover + tap/drag simulation
        els.chartCanvas.style.touchAction = "none";
        let isPointerDown = false;
  
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
  
        els.chartCanvas.addEventListener("pointerdown", (e) => {
          isPointerDown = true;
          try { els.chartCanvas.setPointerCapture(e.pointerId); } catch {}
          updateFromClientX(e.clientX);
        });
        els.chartCanvas.addEventListener("pointermove", (e) => {
          const isMouse = e.pointerType === "mouse";
          if (isMouse || isPointerDown) updateFromClientX(e.clientX);
        });
        function endPointer(e){
          isPointerDown = false;
          try { els.chartCanvas.releasePointerCapture(e.pointerId); } catch {}
        }
        els.chartCanvas.addEventListener("pointerup", endPointer);
        els.chartCanvas.addEventListener("pointercancel", endPointer);
        els.chartCanvas.addEventListener("pointerleave", () => {
          if (simActive) paintRealtimeCards();
          simActive = false;
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
  
        els.shade && (els.shade.textContent = `${shadeDisp.toFixed(1)}${unitSuffix()}`);
        if (isDay && els.sun) els.sun.textContent = `${sunDisp.toFixed(1)}${unitSuffix()}`;
  
        const simSolar = solarByHour[i];
        els.shadeLabel && (els.shadeLabel.textContent = vibeDescriptor(shadeVals[i], { solar: simSolar, isDay, context: "shade" }));
        if (isDay && els.sunLabel) els.sunLabel.textContent = vibeDescriptor(sunVals[i], { solar: simSolar, isDay, context: "sun" });
        if (!isDay && els.sunLabel) els.sunLabel.textContent = "";
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
  
          if (typeof cur.uv_index === "number" && typeof cur.is_day === "number") {
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
            const ds = buildTimelineDataset(hourlyMaybe);
            timelineState = ds;
            window.timelineState = timelineState; // expose for tooltip descriptors
            await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
            chartStatusEl && (chartStatusEl.textContent = "Timeline based on hourly forecast.");
          }
  
          const nowTime = new Date();
          els.lastUpdated && (els.lastUpdated.textContent = fmtHMS(nowTime));
        } catch (e) {
          console.warn("Update cycle failed", e);
        } finally {
          scheduleNextTick(els.updateInterval?.value || 1);
        }
      }
      function restartScheduler() { clearPollTimer(); scheduleNextTick(els.updateInterval?.value || 1); }
  
      // Prime weather
      async function primeWeatherForCoords(latitude, longitude, sourceLabel = "") {
        statusEl && (statusEl.textContent = sourceLabel ? `Getting weather for ${sourceLabel}…` : "Getting weather…");
        const [cur, hourly, dailySun] = await Promise.all([
          getCurrentWeather(latitude, longitude),
          getHourlyWeather(latitude, longitude),
          getDailySun(latitude, longitude)
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
  
        if (typeof cur.uv_index === "number" && typeof cur.is_day === "number") {
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
        const ds = buildTimelineDataset(hourly);
        timelineState = ds;
        window.timelineState = timelineState; // expose for tooltip descriptors
        await renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
        chartStatusEl && (chartStatusEl.textContent = "Timeline based on hourly forecast.");
  
        const nowTime = new Date();
        els.lastUpdated && (els.lastUpdated.textContent = fmtHMS(nowTime));
        statusEl && (statusEl.textContent = sourceLabel ? `Using ${sourceLabel}` : "Using chosen coordinates");
        restartScheduler();
      }
  
      // Geolocation
      function useLocation() {
        statusEl && (statusEl.textContent = "Getting location…");
        if (!navigator.geolocation) { statusEl && (statusEl.textContent = "Geolocation unavailable. Enter values manually."); return; }
        navigator.geolocation.getCurrentPosition(async pos => {
          const { latitude, longitude } = pos.coords;
          try { await primeWeatherForCoords(latitude, longitude, "device location"); }
          catch (e) {
            log(e);
            statusEl && (statusEl.textContent = "Could not fetch weather. Enter values manually.");
            chartStatusEl && (chartStatusEl.textContent = "Timeline unavailable without weather.");
          }
        }, err => {
          log(err);
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
      });
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
              })
              .catch(()=>{});
          }
        }
      }
      unitEls.F?.addEventListener("click", () => setUnit("F"));
      unitEls.C?.addEventListener("click", () => setUnit("C"));
      paintUnitToggle();
      applyUnitLabels();
  
      // Storage sync
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
  
      // ZIP actions
      zipEls.btn && zipEls.btn.addEventListener("click", async () => {
        const raw = zipEls.input?.value;
        const zip5 = normalizeZip(raw);
        if (!zip5) { zipEls.status && (zipEls.status.textContent = "Enter a valid US ZIP (e.g., 20001 or 20001-1234)"); return; }
        try {
          zipEls.status && (zipEls.status.textContent = "Looking up ZIP…");
          const { latitude, longitude, place } = await getCoordsForZip(zip5);
          localStorage.setItem(ZIP_KEY, zip5);
          zipEls.status && (zipEls.status.textContent = `Using ZIP ${zip5} (${place})`);
          await primeWeatherForCoords(latitude, longitude, `ZIP ${zip5} (${place})`);
        } catch (e) {
          console.warn(e);
          zipEls.status && (zipEls.status.textContent = "Couldn’t find that ZIP.");
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
  
      // Clock tick
      setInterval(updateClockCard, 60 * 1000);
  
      // Boot
      setTimeout(() => {
        statusEl && (statusEl.textContent = "Trying to get your local weather…");
        updateClockCard();
  
        const savedZip = localStorage.getItem(ZIP_KEY);
        if (savedZip && zipEls.input) {
          zipEls.input.value = savedZip;
          getCoordsForZip(savedZip)
            .then(({ latitude, longitude, place }) => primeWeatherForCoords(latitude, longitude, `ZIP ${savedZip} (${place})`))
            .catch(() => useLocation());
        } else {
          useLocation();
        }
      }, 300);
    });
  })();
  