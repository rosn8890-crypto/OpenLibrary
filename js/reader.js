/* reader.js - the reading page. Every book is a PDF, rendered in HD with PDF.js.

   Built to avoid the two most common reading annoyances:
   1) Blank / laggy page turns  -> the next page is rendered in the background
      before you tap "Next", and up to 3 pages are kept ready in memory.
   2) A single broken page ruining the book -> only that page shows an error
      with a Retry button; the rest of the book still works.

   And to make reading pleasant:
   - a soft crossfade between pages instead of a hard jump
   - swipe / tap-the-edges navigation, like a phone reading app
   - a "Focus" mode that hides every toolbar so only the page is left
   - the page always redraws sharp after a resize or a zoom change
*/

const bookId = new URLSearchParams(location.search).get("id");

// Elements
const readerBody = document.getElementById("readerBody");
const readerBar = document.getElementById("readerBar");
const readerFoot = document.getElementById("readerFoot");
const readerProgress = document.getElementById("readerProgress");
const stage = document.getElementById("readerStage");
const frame = document.getElementById("pageFrame");
const spinner = document.getElementById("stageSpinner");
const errorBox = document.getElementById("stageError");
const errorText = document.getElementById("stageErrorText");
const titleEl = document.getElementById("readerTitle");
const pageInfoEl = document.getElementById("pageInfo");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const fillEl = document.getElementById("progressFill");
const saveStateEl = document.getElementById("saveState");
const noticeEl = document.getElementById("notice");
const swipeHint = document.getElementById("swipeHint");

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// State
let book = null;
let user = null;
let pdfDoc = null;
let totalPages = 1;
let currentPage = 1;
let renderToken = 0;      // bumped on every navigation so a slow old render cannot overwrite a newer one
let saveTimer = null;
let resizeTimer = null;
let wheelZoomTimer = null;
let pinchState = null;     // { startDist, startZoom } while two fingers are down, else null
let pendingZoom = null;    // live preview value during a pinch / Ctrl-wheel zoom gesture
let theme = localStorage.getItem("ol_reader_theme") || document.documentElement.getAttribute("data-theme") || "dark";
let zoom = 100;   // percent; 100 = "fit to screen" (the whole page visible, no scrolling needed)
const MIN_ZOOM = 50, MAX_ZOOM = 300;

// Small cache of already-rendered pages, so flipping to a nearby page is instant.
// Key = page number, value = a ready <canvas>. Kept small on purpose (phones have limited memory).
const CACHE_RADIUS = 1;          // keep current page ± 1 rendered
const pageCache = new Map();     // pageNumber -> canvas
const renderingNow = new Map();  // pageNumber -> in-flight promise, so we never render the same page twice at once

/* ---------- Start ---------- */
async function initReader() {
  if (!bookId) return showFatalError("No book selected.");
  user = await getUser();

  const { data, error } = await db.from("books").select("id, title, file_url").eq("id", bookId).maybeSingle();
  if (error || !data) return showFatalError("This book was not found or has been removed.");
  book = data;

  titleEl.textContent = book.title;
  document.title = book.title + " - OpenLibrary";
  document.getElementById("backLink").href = "book.html?id=" + book.id;
  applyTheme(theme);
  applyZoom();

  let saved = null;
  if (user) {
    const result = await db.from("reading_progress").select("current_page, scroll_percent")
      .eq("user_id", user.id).eq("book_id", book.id).maybeSingle();
    saved = result.data;
  } else {
    noticeEl.hidden = false;
    noticeEl.innerHTML = 'You are not logged in, so your place will not be saved. <a href="login.html?next=' +
      encodeURIComponent("reader.html?id=" + book.id) + '"><u>Log in</u></a>';
  }

  const opened = await openPdf();
  if (!opened) return;

  currentPage = saved ? Math.min(Math.max(saved.current_page, 1), totalPages) : 1;
  await showPage(currentPage, { instant: true });

  if (!localStorage.getItem("ol_seen_swipe_hint")) {
    swipeHint.hidden = false;
    localStorage.setItem("ol_seen_swipe_hint", "1");
    setTimeout(() => swipeHint.classList.add("fade"), 2600);
    setTimeout(() => { swipeHint.hidden = true; }, 3200);
  }

  bindEvents();
}

// Opens the PDF document. Used at start-up and again if the person presses Retry.
async function openPdf() {
  hideFatalError();
  try {
    pdfDoc = await pdfjsLib.getDocument({
      url: book.file_url,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",   // font maps for non-English PDFs
      cMapPacked: true
    }).promise;
    totalPages = pdfDoc.numPages;
    return true;
  } catch (err) {
    showFatalError("This book could not be opened. It may be a network problem.", true);
    return false;
  }
}

/* ---------- HD rendering ----------
   A screen has "pixel density" (phones and laptops often have 2x or 3x). Drawing at only 1 canvas
   pixel per screen pixel looks soft. So every page is drawn with MORE pixels than the screen needs,
   then shown smaller with CSS: sharp text and images, and the PDF file itself is never touched. */
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;   // safety limit so phones do not run out of memory

// The "fit to screen" width for a page of size `original` (from page.getViewport({scale:1})).
// zoom=100 means the WHOLE page fits inside the visible reading area, both its width and its
// height, so nothing is cut off and no scrolling is needed. zoom above/below 100 scales from there.
function computeCssWidth(original) {
  const availW = Math.max(200, stage.clientWidth - 8);
  const chromeH = readerBar.offsetHeight + readerProgress.offsetHeight + readerFoot.offsetHeight;
  const availH = Math.max(240, window.innerHeight - chromeH - 28);
  const fitWidth = Math.min(availW, availH * (original.width / original.height));
  return fitWidth * (zoom / 100);
}

// Renders one page into a brand new (not-yet-shown) canvas and returns it. Reuses an in-flight
// render if one is already happening for this exact page.
// The size a page is drawn at depends on the CURRENT zoom, so a page must be cached and
// deduplicated per (page number, zoom) pair — not by page number alone. Otherwise a fast
// zoom change (rapid clicks, or a quick pinch) could reuse a render that was already in
// flight for the OLD zoom, silently ignoring the newer zoom level.
function cacheKey(number) { return number + ":" + zoom; }

function renderPage(number) {
  const key = cacheKey(number);
  if (pageCache.has(key)) return Promise.resolve(pageCache.get(key));
  if (renderingNow.has(key)) return renderingNow.get(key);

  const job = (async () => {
    const page = await pdfDoc.getPage(number);
    const original = page.getViewport({ scale: 1 });
    const cssWidth = computeCssWidth(original);
    const cssScale = cssWidth / original.width;
    const density = Math.max(window.devicePixelRatio || 1, 2);
    let drawScale = cssScale * density;
    const pixels = original.width * drawScale * original.height * drawScale;
    if (pixels > MAX_CANVAS_PIXELS) drawScale *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);

    const viewport = page.getViewport({ scale: drawScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = cssWidth + "px";
    canvas.className = "pdf-page";
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

    pageCache.set(key, canvas);
    trimCache();
    return canvas;
  })();

  renderingNow.set(key, job);
  // A background prefetch job can reject (a broken page) with nobody "around" to see it yet.
  // job itself is still returned below so the real caller can catch it; this branch only
  // makes sure the bookkeeping cleanup never produces a console "unhandled rejection" warning.
  job.catch(() => {}).finally(() => renderingNow.delete(key));
  return job;
}

// Keeps only pages close to the one being read, so memory does not grow as someone reads a long book.
function trimCache() {
  for (const key of [...pageCache.keys()]) {
    const [pageStr, zoomStr] = key.split(":");
    // Drop anything for a page too far from where we are now, and anything left over from a
    // zoom level we've since moved away from.
    if (Number(zoomStr) !== zoom || Math.abs(Number(pageStr) - currentPage) > CACHE_RADIUS) pageCache.delete(key);
  }
}

// Renders the pages next to the current one in the background, so tapping Next/Prev feels instant.
function prefetchNeighbors() {
  for (const n of [currentPage - 1, currentPage + 1]) {
    if (n >= 1 && n <= totalPages && !pageCache.has(cacheKey(n))) renderPage(n).catch(() => {});
  }
}

/* ---------- Showing a page, with a soft crossfade ---------- */
async function showPage(number, opts = {}) {
  const target = Math.max(1, Math.min(number, totalPages));
  const myToken = ++renderToken;
  currentPage = target;
  updateUi();
  hidePageError();

  const cached = pageCache.get(cacheKey(target));
  if (!cached) spinner.hidden = false;

  let canvas;
  try {
    canvas = await renderPage(target);
  } catch (err) {
    if (myToken !== renderToken) return;   // a newer navigation already happened; drop this result
    spinner.hidden = true;
    showPageError("This page could not be loaded.", target);
    return;
  }
  if (myToken !== renderToken) return;      // person kept flipping before this render finished
  spinner.hidden = true;

  // Every canvas already in the frame is now "old" — normally just one, but rapid navigation
  // (fast clicks, or a quick pinch) can leave more than one still mid-fade-out at once. Clear
  // ALL of them, or a stale page could stay visible underneath the new one.
  [...frame.children].forEach(old => {
    old.classList.remove("in");
    setTimeout(() => { if (old.parentNode === frame) frame.removeChild(old); }, 220);
  });
  canvas.classList.remove("in");
  frame.appendChild(canvas);
  // Force the browser to register the starting state before animating in (no fade on first page).
  if (opts.instant) {
    canvas.classList.add("in");
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add("in")));
  }

  window.scrollTo(0, 0);   // start at the top of the page (matters most when zoomed in taller than the screen)
  queueSave();
  prefetchNeighbors();
}

function showPageError(message, pageNumber) {
  errorText.textContent = message;
  errorBox.hidden = false;
  errorBox.dataset.page = pageNumber;
}
function hidePageError() { errorBox.hidden = true; }

function showFatalError(message, offerRetry) {
  spinner.hidden = true;
  noticeEl.hidden = false;
  noticeEl.innerHTML = escapeHtml(message) + (offerRetry ? ' <button class="btn btn-sm" id="fatalRetryBtn">Retry</button>' : "");
  if (offerRetry) {
    document.getElementById("fatalRetryBtn").addEventListener("click", async () => {
      noticeEl.hidden = true;
      const ok = await openPdf();
      if (ok) showPage(currentPage, { instant: true });
    });
  }
}
function hideFatalError() { noticeEl.hidden = true; noticeEl.innerHTML = ""; }

/* ---------- Reading settings ---------- */

function applyTheme(name) {
  theme = name;
  readerBody.className = "reader-body theme-" + name;
  localStorage.setItem("ol_reader_theme", name);
  document.querySelectorAll(".reader-tools [data-theme]").forEach(btn => btn.classList.toggle("on", btn.dataset.theme === name));
}

function applyZoom() {
  document.getElementById("zoomDown").disabled = zoom <= MIN_ZOOM;
  document.getElementById("zoomUp").disabled = zoom >= MAX_ZOOM;
  stage.classList.toggle("zoomed", zoom > 100);   // when zoomed in, hand horizontal drag/swipe over to panning
}

function changeZoom(step) {
  commitZoom(zoom + step);
}

// Finalizes a zoom level: clears any preview transform, re-renders every page at full HD for the
// new size (old cached sizes no longer match), and jumps back to the top so the new size is visible.
function commitZoom(newZoom) {
  zoom = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)));
  frame.style.transform = "";
  applyZoom();
  pageCache.clear();
  showPage(currentPage, { instant: true });
}

function toggleFocus() {
  readerBody.classList.toggle("focus");
}

/* ---------- Progress ---------- */

function updateUi() {
  pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;
  fillEl.style.width = Math.round((currentPage / totalPages) * 100) + "%";
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProgress, 800);
}

async function saveProgress() {
  if (!user || !book) return;
  const row = {
    user_id: user.id,
    book_id: book.id,
    current_page: currentPage,
    scroll_percent: 0,
    progress_percent: Math.round((currentPage / totalPages) * 100),
    last_read_at: new Date().toISOString()
  };
  const { error } = await db.from("reading_progress").upsert(row, { onConflict: "user_id,book_id" });
  saveStateEl.textContent = error ? "Not saved" : "Progress saved";
}

/* ---------- Buttons, taps, swipes and keyboard ---------- */

function bindEvents() {
  prevBtn.addEventListener("click", () => showPage(currentPage - 1));
  nextBtn.addEventListener("click", () => showPage(currentPage + 1));
  document.getElementById("tapPrev").addEventListener("click", () => showPage(currentPage - 1));
  document.getElementById("tapNext").addEventListener("click", () => showPage(currentPage + 1));
  document.getElementById("tapFocus").addEventListener("click", toggleFocus);
  document.getElementById("focusBtn").addEventListener("click", toggleFocus);
  document.getElementById("zoomDown").addEventListener("click", () => changeZoom(-15));
  document.getElementById("zoomUp").addEventListener("click", () => changeZoom(15));
  document.querySelectorAll(".reader-tools [data-theme]").forEach(btn => btn.addEventListener("click", () => applyTheme(btn.dataset.theme)));
  document.getElementById("retryBtn").addEventListener("click", () => {
    const n = Number(errorBox.dataset.page) || currentPage;
    pageCache.delete(cacheKey(n));
    showPage(n);
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) saveProgress(); });

  document.addEventListener("keydown", event => {
    if (event.key === "ArrowRight" || event.key === " ") { event.preventDefault(); showPage(currentPage + 1); }
    else if (event.key === "ArrowLeft") showPage(currentPage - 1);
    else if (event.key === "Home") showPage(1);
    else if (event.key === "End") showPage(totalPages);
    else if (event.key === "f" || event.key === "F") toggleFocus();
    else if (event.key === "Escape" && readerBody.classList.contains("focus")) toggleFocus();
  });

  // Swipe left/right on touch screens turns the page — but only at "fit" zoom. Once zoomed in,
  // a one-finger drag pans around the enlarged page instead (the browser handles that natively).
  let touchStartX = 0, touchStartY = 0;
  stage.addEventListener("touchstart", e => {
    if (e.touches && e.touches.length === 2) { startPinch(e); return; }
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: false });
  stage.addEventListener("touchmove", e => {
    if (pinchState || (e.touches && e.touches.length === 2)) movePinch(e);
  }, { passive: false });
  stage.addEventListener("touchend", e => {
    if (pinchState) { endPinch(); return; }
    if (zoom > 100) return;   // zoomed in: let the browser's own panning handle this drag
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) showPage(currentPage + 1); else showPage(currentPage - 1);
    }
  }, { passive: true });

  // Pinch-to-zoom (touchscreen): two fingers. Scales the visible page live for instant feedback,
  // then does one sharp HD re-render once the fingers lift.
  function pinchDistance(e) {
    const [a, b] = e.touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function startPinch(e) {
    pinchState = { startDist: pinchDistance(e), startZoom: zoom };
    pendingZoom = zoom;
  }
  function movePinch(e) {
    if (!pinchState || e.touches.length !== 2) return;
    e.preventDefault();
    const ratio = pinchDistance(e) / pinchState.startDist;
    pendingZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchState.startZoom * ratio));
    frame.style.transform = `scale(${(pendingZoom / zoom).toFixed(3)})`;
  }
  function endPinch() {
    pinchState = null;
    commitZoom(pendingZoom);
  }

  // Zoom with a touchpad pinch or Ctrl/Cmd + mouse wheel (browsers report a trackpad pinch as a
  // wheel event with ctrlKey set, so one handler covers both "touchpad" and "mouse" zooming).
  stage.addEventListener("wheel", e => {
    if (!e.ctrlKey) return;   // a plain scroll should just scroll the page normally
    e.preventDefault();
    pendingZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (pendingZoom ?? zoom) - e.deltaY * 0.4));
    frame.style.transform = `scale(${(pendingZoom / zoom).toFixed(3)})`;
    clearTimeout(wheelZoomTimer);
    wheelZoomTimer = setTimeout(() => commitZoom(pendingZoom), 180);
  }, { passive: false });

  // Redraw sharp (and correctly sized) after the window is resized or rotated
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      pageCache.clear();
      showPage(currentPage, { instant: true });
    }, 250);
  });
}

initReader();
