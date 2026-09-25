// Sets the page's theme before it paints: the one saved in Vibe Temp
// ("vibe.v1.theme", "light" or "dark"), else the device's preference,
// else dark. Loaded in <head> by pages without the app's scripts.
(function () {
  var theme = "dark";
  try {
    var saved = localStorage.getItem("vibe.v1.theme");
    if (saved === "light" || saved === "dark") {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      theme = "light";
    }
  } catch (e) {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) theme = "light";
    } catch (e2) {}
  }
  try {
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
