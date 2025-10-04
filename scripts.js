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
        lastUpdated: $("#lastUpdated"),
        nextUpdated: $("#nextUpdated"),
        updateInterval: $("#updateInterval"),
        updateHourlyToggle: $("#updateHourlyToggle"),
        updateNow: $("#updateNow"),
        useLocationBtn: $("#use-location"),
      };
  
      const DEBUG = new URLSearchParams(location.search).get("debug") === "true";
      const log = (...a) => { if (DEBUG) console.log("[Vibe]", ...a); };
  
      // --- State ---
      let lastCoords = null;
      let vibeChart = null;
      let pollTimer = null;
      let nextUpdateAt = null;
  
      let sunTimes = {
        sunriseToday: null,
        sunsetToday: null,
        sunriseTomorrow: null,
        sunsetTomorrow: null
      };
  
      // --- Utils ---
      function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
      function labelFor(tempF) {
        if (tempF < 55) return "Crisp sweater weather";
        if (tempF < 66) return "Perfect in the sun, chilly in shade";
        if (tempF < 76) return "Balanced, light layers";
        if (tempF < 86) return "Warm and glowy";
        if (tempF < 96) return "Baking in the sun";
        return "Solar sauna mode";
      }
      function reflectivity() {
        const sel = parseFloat(els.reflect?.value ?? "0");
        if (sel === 0) return clamp(parseFloat(els.reflectCustom?.value ?? "0") || 0, 0, 1);
        return clamp(sel, 0, 1);
      }
      function fmtHM(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
      function fmtHMS(d) { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" }); }
  
      // --- Formulas ---
      function shadeVibeOf(T, RH, Wind) { return T + (RH - 40) / 15 - 0.7 * Wind; }
      function sunVibeOf(shadeV, solarExposure, R) { return shadeV + 8 * solarExposure + 4 * R; }
  
      // --- Solar exposure calc ---
      function solarFromUVandCloud({ uv_index, uv_index_clear_sky, cloud_cover, is_day }) {
        const baseUV = (typeof uv_index_clear_sky === "number" && uv_index_clear_sky > 0)
          ? uv_index / uv_index_clear_sky
          : (typeof uv_index === "number" ? uv_index / 10 : 0);
        const cloudAtten = 1 - Math.pow((cloud_cover ?? 0) / 100, 0.7);
        const solar = (is_day ? baseUV * cloudAtten : 0);
        return clamp(solar, 0, 1);
      }
  
      // --- Compute top cards ---
      function compute() {
        const T = parseFloat(els.temp?.value ?? "NaN");
        const RH = parseFloat(els.humidity?.value ?? "NaN");
        const Wind = parseFloat(els.wind?.value ?? "NaN");
        const Solar = parseFloat(els.solar?.value ?? "NaN");
        const R = reflectivity();
  
        if ([T, RH, Wind].some(v => Number.isNaN(v))) {
          if (statusEl) statusEl.textContent = "Enter temp, humidity, and wind or use your location.";
          return;
        }
  
        const shadeVibe = shadeVibeOf(T, RH, Wind);
        const sunVibe   = sunVibeOf(shadeVibe, Solar, R);
  
        if (els.shade) els.shade.textContent = `${shadeVibe.toFixed(1)}°`;
        if (els.sun)   els.sun.textContent   = `${sunVibe.toFixed(1)}°`;
  
        if (els.shadeLabel) els.shadeLabel.textContent = labelFor(shadeVibe);
        if (els.sunLabel)   els.sunLabel.textContent   = labelFor(sunVibe);
  
        if (statusEl) statusEl.textContent = "Computed from current inputs.";
        log({ T, RH, Wind, Solar, R, shadeVibe, sunVibe });
      }
  
      function autoSolarFromCloudCover(cloudCoverPct) {
        const solar = clamp(1 - cloudCoverPct / 100, 0.2, 1);
        if (els.solar) els.solar.value = solar.toFixed(1);
        if (els.solarVal) els.solarVal.textContent = solar.toFixed(1);
        return solar;
      }
  
      // --- API calls (Open-Meteo) ---
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
  
      // --- Timeline prep ---
      function buildTimelineDataset(hourly, R) {
        const now = new Date();
        const start = new Date(now); start.setHours(0,0,0,0);
        const end = new Date(now);   end.setDate(end.getDate()+2); end.setHours(0,0,0,0);
  
        const times = hourly.time.map(t => new Date(t));
        const startIdx = times.findIndex(d => d >= start);
        const endIdx   = times.findIndex(d => d >= end);
        const s = startIdx === -1 ? 0 : startIdx;
        const e = endIdx === -1 ? times.length : endIdx;
  
        const labels = [];
        const shadeVals = [];
        const sunVals = [];
  
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
          const sun = sunVibeOf(shade, solar, R);
  
          labels.push(times[i]);
          shadeVals.push(parseFloat(shade.toFixed(1)));
          sunVals.push(parseFloat(sun.toFixed(1)));
        }
        return { labels, shadeVals, sunVals, now };
      }
  
      function hourKey(d) { const k = new Date(d); k.setMinutes(0,0,0); return k.getTime(); }
  
      // --- Chart render (Chart.js) ---
      function renderChart(labels, shadeVals, sunVals, now) {
        if (!els.chartCanvas) return;
        const ctx = els.chartCanvas.getContext("2d");
        if (window.Chart == null) {
          console.warn("Chart.js not found. Include it via CDN before this script.");
          return;
        }
        if (vibeChart) { vibeChart.destroy(); vibeChart = null; }
  
        const displayLabels = labels.map(d => d.toLocaleString([], { weekday: "short", hour: "numeric" }));
        const nowIdx = labels.findIndex(d => hourKey(d) === hourKey(now));
  
        const currentLine = {
          id: "currentLine",
          afterDatasetsDraw(chart) {
            if (nowIdx === -1) return;
            const { ctx, chartArea, scales } = chart;
            const x = scales.x.getPixelForValue(nowIdx);
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#6ea8fe";
            ctx.setLineDash([5, 5]);
            ctx.stroke();
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
              y: { title: { display: true, text: "°F" }, suggestedMin: Math.min(...shadeVals, ...sunVals) - 3, suggestedMax: Math.max(...shadeVals, ...sunVals) + 3 }
            },
            plugins: {
              legend: { display: true, labels: { usePointStyle: true, pointStyle: "rectRounded", boxWidth: 14, boxHeight: 8 } }
            }
          },
          plugins: [currentLine]
        });
      }
  
      // --- Sunrise/sunset text ---
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
        if (els.nowTime) els.nowTime.textContent = fmtHM(now);
        const nxt = chooseNextSunEvent();
        if (els.nowSubLabel) els.nowSubLabel.textContent = nxt ? `${nxt.kind.toLowerCase()} at ${fmtHM(nxt.next)}` : "—";
      }
  
      // --- Scheduler ---
      function clearPollTimer() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; }
  
      function scheduleNextTick(minutes) {
        const ms = Math.max(0.5, parseFloat(minutes) || 1) * 60 * 1000;
        nextUpdateAt = new Date(Date.now() + ms);
        if (els.nextUpdated) els.nextUpdated.textContent = fmtHMS(nextUpdateAt);
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
  
          // Update inputs from current
          if (els.temp) els.temp.value = (cur.temperature_2m ?? cur.apparent_temperature ?? "").toFixed(1);
          if (els.humidity) els.humidity.value = (cur.relative_humidity_2m ?? "").toFixed(0);
          if (els.wind) els.wind.value = (cur.wind_speed_10m ?? "").toFixed(1);
  
          // Auto solar
          if (typeof cur.uv_index === "number" && typeof cur.is_day === "number") {
            const solar = solarFromUVandCloud({
              uv_index: cur.uv_index,
              uv_index_clear_sky: cur.uv_index_clear_sky,
              cloud_cover: cur.cloud_cover ?? 0,
              is_day: cur.is_day
            });
            if (els.solar) els.solar.value = solar.toFixed(1);
            if (els.solarVal) els.solarVal.textContent = solar.toFixed(1);
          } else if (typeof cur.cloud_cover === "number") {
            autoSolarFromCloudCover(cur.cloud_cover);
          }
  
          compute();
          updateClockCard();
  
          // Chart
          if (hourlyMaybe) {
            const { labels, shadeVals, sunVals, now } = buildTimelineDataset(hourlyMaybe, reflectivity());
            renderChart(labels, shadeVals, sunVals, now);
            if (chartStatusEl) chartStatusEl.textContent = "Timeline based on hourly forecast.";
          }
  
          const nowTime = new Date();
          if (els.lastUpdated) els.lastUpdated.textContent = fmtHMS(nowTime);
        } catch (e) {
          console.warn("Update cycle failed", e);
        } finally {
          scheduleNextTick(els.updateInterval?.value || 1);
        }
      }
  
      function restartScheduler() {
        clearPollTimer();
        scheduleNextTick(els.updateInterval?.value || 1);
      }
  
      // --- Geolocation bootstrap ---
      async function useLocation() {
        if (statusEl) statusEl.textContent = "Getting location…";
        if (!navigator.geolocation) { if (statusEl) statusEl.textContent = "Geolocation unavailable. Enter values manually."; return; }
  
        navigator.geolocation.getCurrentPosition(async pos => {
          const { latitude, longitude } = pos.coords;
          lastCoords = { latitude, longitude };
          if (statusEl) statusEl.textContent = "Getting weather…";
          try {
            const [cur, hourly, dailySun] = await Promise.all([
              getCurrentWeather(latitude, longitude),
              getHourlyWeather(latitude, longitude),
              getDailySun(latitude, longitude)
            ]);
            sunTimes = dailySun;
  
            // Populate inputs
            if (els.temp) els.temp.value = (cur.temperature_2m ?? cur.apparent_temperature ?? "").toFixed(1);
            if (els.humidity) els.humidity.value = (cur.relative_humidity_2m ?? "").toFixed(0);
            if (els.wind) els.wind.value = (cur.wind_speed_10m ?? "").toFixed(1);
  
            // Auto solar
            if (typeof cur.uv_index === "number" && typeof cur.is_day === "number") {
              const solar = solarFromUVandCloud({
                uv_index: cur.uv_index, uv_index_clear_sky: cur.uv_index_clear_sky,
                cloud_cover: cur.cloud_cover ?? 0, is_day: cur.is_day
              });
              if (els.solar) els.solar.value = solar.toFixed(1);
              if (els.solarVal) els.solarVal.textContent = solar.toFixed(1);
            } else if (typeof cur.cloud_cover === "number") {
              autoSolarFromCloudCover(cur.cloud_cover);
            }
  
            compute();
            updateClockCard();
  
            // Timeline
            if (chartStatusEl) chartStatusEl.textContent = "Loading timeline…";
            const { labels, shadeVals, sunVals, now } = buildTimelineDataset(hourly, reflectivity());
            renderChart(labels, shadeVals, sunVals, now);
            if (chartStatusEl) chartStatusEl.textContent = "Timeline based on hourly forecast.";
  
            // Seed last/next, then start scheduler
            const nowTime = new Date();
            if (els.lastUpdated) els.lastUpdated.textContent = fmtHMS(nowTime);
            restartScheduler();
          } catch (e) {
            log(e);
            if (statusEl) statusEl.textContent = "Could not fetch weather. Enter values manually.";
            if (chartStatusEl) chartStatusEl.textContent = "Timeline unavailable without weather.";
          }
        }, err => {
          log(err);
          if (statusEl) statusEl.textContent = "Location denied. Enter values manually.";
          if (chartStatusEl) chartStatusEl.textContent = "Timeline unavailable without location.";
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 });
      }
  
      // --- Wire up inputs ---
      ["input","change"].forEach(evt => {
        ["temp","humidity","wind","solar","reflect","reflectCustom"].forEach(id => {
          const el = els[id];
          if (el) el.addEventListener(evt, () => {
            compute();
            if ((id === "reflect" || id === "reflectCustom") && lastCoords) {
              // Rebuild chart using latest reflectivity
              getHourlyWeather(lastCoords.latitude, lastCoords.longitude)
                .then(hourly => {
                  const { labels, shadeVals, sunVals, now } = buildTimelineDataset(hourly, reflectivity());
                  renderChart(labels, shadeVals, sunVals, now);
                })
                .catch(()=>{});
            }
          });
        });
      });
      if (els.solar) {
        els.solar.addEventListener("input", () => {
          if (els.solarVal) els.solarVal.textContent = parseFloat(els.solar.value).toFixed(1);
        });
      }
  
      // Scheduler controls
      if (els.updateInterval) els.updateInterval.addEventListener("change", restartScheduler);
      if (els.updateHourlyToggle) els.updateHourlyToggle.addEventListener("change", restartScheduler);
      if (els.updateNow) els.updateNow.addEventListener("click", () => {
        clearPollTimer();
        runUpdateCycle(); // immediate update + reschedule
      });
  
      // Buttons
      if (els.useLocationBtn) els.useLocationBtn.addEventListener("click", useLocation);
  
      // Clock tick (independent of weather fetch)
      setInterval(updateClockCard, 60 * 1000);
  
      // Initial boot (works even if placed in <head> or with defer)
      // Small delay to let layout settle and Chart.js load if placed before it
      setTimeout(() => {
        if (statusEl) statusEl.textContent = "Trying to get your local weather…";
        updateClockCard();
        useLocation();
      }, 300);
    });
  })();
  