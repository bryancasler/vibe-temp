(() => {
    // Run after DOM is ready, but immediately if it's already parsed
    const onReady = (cb) => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", cb, { once: true });
      } else {
        cb();
      }
    };
  
    onReady(() => {
      // --- Shortcuts & elements ---
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
  
      // Units & ZIP controls
      const unitEls = { F: $("#unitF"), C: $("#unitC") };
      const zipEls = {
        input: $("#zipInput"),
        btn: $("#use-zip"),
        clear: $("#clear-zip"),
        status: $("#zipStatus"),
      };
  
      // --- State ---
      const UNIT_KEY = "vibeUnit";
      const ZIP_KEY  = "vibeZip";
      let unit = (localStorage.getItem(UNIT_KEY) === "C") ? "C" : "F";
      let lastCoords = null;
      let vibeChart = null;
      let pollTimer = null;
      let nextUpdateAt = null;
  
      let sunTimes = { sunriseToday: null, sunsetToday: null, sunriseTomorrow: null, sunsetTomorrow: null };
      let currentIsDay = null; // track from API
      let currentPlaceName = ""; // human-readable place
  
      let timelineState = null; // { labels, shadeVals, sunVals, solarByHour, isDayByHour, now }
      let simActive = false;    // true while hovering the chart
  
      const DEBUG = new URLSearchParams(location.search).get("debug") === "true";
      const log = (...a) => { if (DEBUG) console.log("[Vibe]", ...a); };
  
      // --- Utils ---
      function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
      const fToC = f => (f - 32) * 5/9;
      const cToF = c => (c * 9/5) + 32;
      const toUserTemp = f => unit === "F" ? f : fToC(f);
      const sym = () => unit === "F" ? "°F" : "°C";
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
        if (!els.nowTitle) return;
        const place = currentPlaceName || (zipEls?.input?.value ? `ZIP ${zipEls.input.value}` : "your location");
        els.nowTitle.textContent = `Current Time at ${place}`;
      }
  
      // Daylight inference
      function isDaylightNow() {
        if (currentIsDay === 0 || currentIsDay === 1) return !!currentIsDay;
        const now = new Date();
        if (sunTimes.sunriseToday && sunTimes.sunsetToday) {
          if (now >= sunTimes.sunriseToday && now < sunTimes.sunsetToday) return true;
        }
        const s = parseFloat(els.solar?.value ?? "0") || 0;
        return s > 0.2;
      }
  
      // --- Day/Night aware descriptors ---
      function baseDescriptorDay(tempF, context = "shade") {
        if (tempF < -10) return "Brutally frigid; risk of frostbite";
        if (tempF < 0)   return "Bitter cold; limit time outside";
        if (tempF < 10)  return "Arctic chill; heavy layers";
        if (tempF < 20)  return "Freezing; thick coat + gloves";
        if (tempF < 32)  return "Cold; winter layers";
        if (tempF < 45)  return "Chilly; coat recommended";
        if (tempF < 55)  return "Crisp sweater weather";
        if (tempF < 66)  {
          return context === "sun" ? "Perfect in the sun, cool in shade"
               : context === "shade" ? "Cool in shade, perfect in the sun"
               : "Perfect in the sun, cool in shade";
        }
        if (tempF < 76)  return "Balanced, light layers";
        if (tempF < 86)  return "Warm and glowy";
        if (tempF < 96)  return "Baking in the sun";
        if (tempF < 105) return "Oppressive heat; take it easy";
        return "Extreme heat alert";
      }
      function baseDescriptorNight(tempF) {
        if (tempF < -10) return "Brutally frigid night; frostbite risk";
        if (tempF < 0)   return "Bitter cold night";
        if (tempF < 10)  return "Arctic night air";
        if (tempF < 20)  return "Freezing night; bundle up";
        if (tempF < 32)  return "Cold night; winter layers";
        if (tempF < 45)  return "Chilly night; coat helps";
        if (tempF < 55)  return "Crisp night air";
        if (tempF < 66)  return "Cool evening";
        if (tempF < 76)  return "Mild evening";
        if (tempF < 86)  return "Warm evening";
        if (tempF < 96)  return "Hot evening; lingering heat";
        if (tempF < 105) return "Oppressive heat even at night";
        return "Extreme heat night";
      }
      function vibeDescriptor(
        tempF,
        { solar = parseFloat(els.solar?.value ?? "0") || 0, isDay = isDaylightNow(), context = "shade" } = {}
      ) {
        const base = isDay ? baseDescriptorDay(tempF, context) : baseDescriptorNight(tempF);
        if (!isDay) return base;
        const s = clamp(Number.isFinite(solar) ? solar : 0, 0, 1);
        let suffix = "";
        if (s < 0.20) {
          suffix = context === "sun" ? "clouds mute the sun" : "overcast";
        } else if (s < 0.40) {
          suffix = "mostly cloudy";
        } else if (s < 0.70) {
          suffix = "partly sunny";
        }
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
  
      // Solar exposure calc
      function solarFromUVandCloud({ uv_index, uv_index_clear_sky, cloud_cover, is_day }) {
        const baseUV = (typeof uv_index_clear_sky === "number" && uv_index_clear_sky > 0)
          ? uv_index / uv_index_clear_sky
          : (typeof uv_index === "number" ? uv_index / 10 : 0);
        const cloudAtten = 1 - Math.pow((cloud_cover ?? 0) / 100, 0.7);
        const solar = (is_day ? baseUV * cloudAtten : 0);
        return clamp(solar, 0, 1);
      }
  
      // Compute cards
      function compute() {
        const Traw = parseFloat(els.temp?.value ?? "NaN");
        const RH   = parseFloat(els.humidity?.value ?? "NaN");
        const Wind = parseFloat(els.wind?.value ?? "NaN");
        const Solar= parseFloat(els.solar?.value ?? "NaN");
        const R    = reflectivity();
        if ([Traw, RH, Wind].some(v => Number.isNaN(v))) {
          statusEl && (statusEl.textContent = "Enter temp, humidity, and wind or use your location/ZIP.");
          return;
        }
        // convert user input to Fahrenheit for internal math
        const tempF = unit === "F" ? Traw : cToF(Traw);
        const shadeF = shadeVibeOf(tempF, RH, Wind);
        const sunF   = sunVibeOf(shadeF, Solar, R);
  
        const shadeDisplay = toUserTemp(shadeF);
        const sunDisplay   = toUserTemp(sunF);
  
        els.shade && (els.shade.textContent = `${shadeDisplay.toFixed(1)}${sym()}`);
        els.sun   && (els.sun.textContent   = `${sunDisplay.toFixed(1)}${sym()}`);
  
        els.shadeLabel && (els.shadeLabel.textContent = vibeDescriptor(shadeF, { solar: Solar, isDay: isDaylightNow(), context: "shade" }));
        els.sunLabel   && (els.sunLabel.textContent   = vibeDescriptor(sunF,   { solar: Solar, isDay: isDaylightNow(), context: "sun" }));
  
        // Hide/show Sun card in realtime (not during simulation)
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
  
      // API calls
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
  
      // Timeline prep (returns arrays in °F internally)
      function buildTimelineDataset(hourly, R) {
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
          shadeVals.push(parseFloat(shade.toFixed(1)));
          sunVals.push(parseFloat(sun.toFixed(1)));
          solarByHour.push(solar);
          isDayByHour.push(isDay ? 1 : 0);
        }
        return { labels, shadeVals, sunVals, solarByHour, isDayByHour, now };
      }
      function hourKey(d) { const k = new Date(d); k.setMinutes(0,0,0); return k.getTime(); }
  
      // Sunrise/Sunset markers helpers (☀️ for both)
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
  
      // Chart render (converts to display units)
      function renderChart(labels, shadeValsF, sunValsFF, now) {
        if (!els.chartCanvas) return;
        const ctx = els.chartCanvas.getContext("2d");
        if (window.Chart == null) { console.warn("Chart.js not found."); return; }
        if (vibeChart) { vibeChart.destroy(); vibeChart = null; }
  
        const shadeVals = shadeValsF.map(v => toUserTemp(v));
        const sunVals   = sunValsFF.map(v => toUserTemp(v));
        const displayLabels = labels.map(d => d.toLocaleString([], { weekday: "short", hour: "numeric" }));
        const nowIdx = labels.findIndex(d => hourKey(d) === hourKey(now));
  
        const markers = buildSunMarkers(labels);
  
        // Vertical line for "current time" — same green as the time label's computed color
        const currentLine = {
          id: "currentLine",
          afterDatasetsDraw(chart) {
            if (nowIdx === -1) return;
            const { ctx, chartArea, scales } = chart;
            const x = scales.x.getPixelForValue(nowIdx);
            const timeColor = (els.nowTime && getComputedStyle(els.nowTime).color) || "#22c55e"; // fallback green
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
  
        // Draw ☀️ placed over the Sun Vibe line (no vertical centering)
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
  
              // Nudge up a hair so the emoji isn't obscured by the line stroke
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
              { label: "Shade Vibe", data: shadeVals, borderWidth: 2, borderColor: "#6ea8fe", backgroundColor: "#6ea8fe", pointRadius: 0, tension: 0.3 },
              { label: "Sun Vibe",   data: sunVals,   borderWidth: 2, borderColor: "#ffb86b", backgroundColor: "#ffb86b", pointRadius: 0, tension: 0.3 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              x: { title: { display: true, text: "Time" }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 20 } },
              y: { title: { display: true, text: sym() }, suggestedMin: Math.min(...shadeVals, ...sunVals) - 3, suggestedMax: Math.max(...shadeVals, ...sunVals) + 3 }
            },
            plugins: {
              legend: { display: true, labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 14, boxHeight: 8 } }
            }
          },
          plugins: [currentLine, sunMarkerPlugin]
        });
  
        // Hover simulation: always updates displays while hovering (no key needed)
        els.chartCanvas.addEventListener("mousemove", (evt) => {
          if (!vibeChart || !timelineState) return;
          const points = vibeChart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
          if (!points || !points.length) return;
          const idx = points[0].index;
          simActive = true;
          paintSimulatedIndex(idx);
        });
        els.chartCanvas.addEventListener("mouseleave", () => {
          if (simActive) paintRealtimeCards();
          simActive = false;
        });
      }
  
      // Current time & next sun event
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
        // Capitalized label
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
  
        els.shade && (els.shade.textContent = `${shadeDisp.toFixed(1)}${sym()}`);
        if (isDay && els.sun) els.sun.textContent = `${sunDisp.toFixed(1)}${sym()}`;
  
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
            const ds = buildTimelineDataset(hourlyMaybe, reflectivity());
            timelineState = ds;
            renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
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
  
      // Shared prime (for both geolocation and ZIP)
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
        const ds = buildTimelineDataset(hourly, reflectivity());
        timelineState = ds;
        renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
        chartStatusEl && (chartStatusEl.textContent = "Timeline based on hourly forecast.");
  
        const nowTime = new Date();
        els.lastUpdated && (els.lastUpdated.textContent = fmtHMS(nowTime));
        statusEl && (statusEl.textContent = sourceLabel ? `Using ${sourceLabel}` : "Using chosen coordinates");
        restartScheduler();
      }
  
      // Geolocation bootstrap
      async function useLocation() {
        statusEl && (statusEl.textContent = "Getting location…");
        if (!navigator.geolocation) { statusEl && (statusEl.textContent = "Geolocation unavailable. Enter values manually."); return; }
        navigator.geolocation.getCurrentPosition(async pos => {
          const { latitude, longitude } = pos.coords;
          try {
            await primeWeatherForCoords(latitude, longitude, "device location");
          } catch (e) {
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
  
      // Events: inputs
      ["input","change"].forEach(evt => {
        ["temp","humidity","wind","solar","reflect","reflectCustom"].forEach(id => {
          const el = els[id];
          el && el.addEventListener(evt, () => {
            compute();
            if ((id === "reflect" || id === "reflectCustom") && lastCoords) {
              getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
                .then(hourly => {
                  const ds = buildTimelineDataset(hourly, reflectivity());
                  timelineState = ds;
                  renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
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
              .then(hourly => {
                const ds = buildTimelineDataset(hourly, reflectivity());
                timelineState = ds;
                renderChart(ds.labels, ds.shadeVals, ds.sunVals, ds.now);
              })
              .catch(()=>{});
          }
        }
      }
      unitEls.F?.addEventListener("click", () => setUnit("F"));
      unitEls.C?.addEventListener("click", () => setUnit("C"));
      paintUnitToggle();
      applyUnitLabels();
  
      // Cross-tab sync
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
      els.updateInterval && els.updateInterval.addEventListener("change", () => restartScheduler());
      els.updateHourlyToggle && els.updateHourlyToggle.addEventListener("change", () => restartScheduler());
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
  
      // Boot: prefer saved ZIP, else geolocation
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