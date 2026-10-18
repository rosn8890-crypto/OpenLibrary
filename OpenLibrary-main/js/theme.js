/* theme.js - light / dark site theme.
   It is loaded inside <head>, so the theme is set BEFORE the page is drawn (no white flash).
   The choice is saved in the browser (localStorage). First visit = the phone/computer setting. */
(function () {
  let saved = null;
  try { saved = localStorage.getItem("ol_theme"); } catch (e) { /* storage blocked: ignore */ }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", saved || (prefersDark ? "dark" : "light"));
})();

// Called by the moon/sun button in the navbar. Returns the new theme name.
function toggleTheme() {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("ol_theme", next); } catch (e) { /* ignore */ }
  return next;
}
