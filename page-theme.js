// Runs in <head> before the page paints (Bryan, 2026-10-01: the app's own
// scripts are deferred, so anything that changes the layout is decided here
// first, or the page would jump when they run).
// - The theme: the one saved in Vibe Temp ("vibe.v1.theme", "light" or
//   "dark"), else the device's preference, else dark.
// - On the app page, two guesses the app confirms once its scripts run:
//   boot-default when no place is set (no ZIP or coordinates in the address,
//   no saved ZIP), so the "Showing Washington, DC" note is drawn at once;
//   boot-legend and boot-dogs when Dogs mode is on, so the chart's legend
//   and the dog panel have their room; boot-summary always, for the day's
//   summary. The space held puts the cards below the fold from the first
//   paint, where the forecast filling in above them doesn't move them on
//   screen.
(function () {
  var root = document.documentElement;
  var get = function (k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  var theme = "dark";
  var saved = get("vibe.v1.theme");
  if (saved === "light" || saved === "dark") {
    theme = saved;
  } else {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) theme = "light";
    } catch (e) {}
  }
  try {
    root.setAttribute("data-theme", theme);
  } catch (e) {}
  if (!/(^|\/)(index\.html)?$/.test(location.pathname)) return;
  var q;
  try {
    q = new URLSearchParams(location.search);
  } catch (e) {
    return;
  }
  var store = q.has("demo") ? "vibe.demo." : "vibe.v1.";
  var placed = q.get("zip") || (q.get("lat") && q.get("lon")) || get(store + "zip") || (store === "vibe.v1." && get("vibeZip"));
  if (!placed) root.classList.add("boot-default");
  root.classList.add("boot-summary");
  if (get(store + "dogs") !== "false") root.classList.add("boot-legend", "boot-dogs");
})();
