/* reader.js - Complete HD Reading Engine with Ambient Audio, TTS, Focus Modes, and Accessibility */

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
const pageJumpInput = document.getElementById("pageJumpInput");
const pageTotalText = document.getElementById("pageTotalText");
const timeEst = document.getElementById("timeEst");

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// State
let book = null;
let user = null;
let pdfDoc = null;
let totalPages = 1;
let currentPage = 1;
let renderToken = 0;
let saveTimer = null;
let resizeTimer = null;
let wheelZoomTimer = null;
let pinchState = null;
let pendingZoom = null;
let theme = localStorage.getItem("ol_reader_theme") || "dark";
let zoom = 100;
const MIN_ZOOM = 50, MAX_ZOOM = 300;
let bookmarksManager = null;

const CACHE_RADIUS = 1;
const pageCache = new Map();
const renderingNow = new Map();

/* ---------- Start ---------- */
async function initReader() {
  if (!bookId) return showFatalError("No book selected.");
  user = await getUser();

  bookmarksManager = new BookmarksManager(bookId);

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
    noticeEl.innerHTML = 'You are reading as a guest. <a href="login.html?next=' +
      encodeURIComponent("reader.html?id=" + book.id) + '"><u>Log in</u></a> to sync progress across all your devices.';
  }

  const opened = await openPdf();
  if (!opened) return;

  currentPage = saved ? Math.min(Math.max(saved.current_page, 1), totalPages) : 1;
  await showPage(currentPage, { instant: true });

  if (!localStorage.getItem("ol_seen_swipe_hint")) {
    swipeHint.hidden = false;
    localStorage.setItem("ol_seen_swipe_hint", "1");
    setTimeout(() => swipeHint.classList.add("fade"), 3200);
    setTimeout(() => { swipeHint.hidden = true; }, 4000);
  }

  initTimerDisplay();
  bindEvents();
  initAmbientUi();
  initTtsUi();
  initBookmarksUi();
  updateBookmarkButton();
}

async function openPdf() {
  hideFatalError();
  try {
    pdfDoc = await pdfjsLib.getDocument({
      url: book.file_url,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked: true
    }).promise;
    totalPages = pdfDoc.numPages;
    return true;
  } catch (err) {
    showFatalError("This book could not be opened. Check your internet connection.", true);
    return false;
  }
}

/* ---------- HD Rendering ---------- */
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;

function computeCssWidth(original) {
  const availW = Math.max(200, stage.clientWidth - 8);
  const chromeH = (readerBar ? readerBar.offsetHeight : 50) + (readerProgress ? readerProgress.offsetHeight : 4) + (readerFoot ? readerFoot.offsetHeight : 50);
  const availH = Math.max(240, window.innerHeight - chromeH - 28);
  const fitWidth = Math.min(availW, availH * (original.width / original.height));
  return fitWidth * (zoom / 100);
}

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
  job.catch(() => {}).finally(() => renderingNow.delete(key));
  return job;
}

function trimCache() {
  for (const key of [...pageCache.keys()]) {
    const [pageStr, zoomStr] = key.split(":");
    if (Number(zoomStr) !== zoom || Math.abs(Number(pageStr) - currentPage) > CACHE_RADIUS) pageCache.delete(key);
  }
}

function prefetchNeighbors() {
  for (const n of [currentPage - 1, currentPage + 1]) {
    if (n >= 1 && n <= totalPages && !pageCache.has(cacheKey(n))) renderPage(n).catch(() => {});
  }
}

/* ---------- Showing a page ---------- */
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
    if (myToken !== renderToken) return;
    spinner.hidden = true;
    showPageError("This page could not be loaded.", target);
    return;
  }
  if (myToken !== renderToken) return;
  spinner.hidden = true;

  [...frame.children].forEach(old => {
    old.classList.remove("in");
    setTimeout(() => { if (old.parentNode === frame) frame.removeChild(old); }, 220);
  });
  canvas.classList.remove("in");
  frame.appendChild(canvas);

  if (opts.instant) {
    canvas.classList.add("in");
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add("in")));
  }

  window.scrollTo(0, 0);
  queueSave();
  prefetchNeighbors();
  updateBookmarkButton();
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
  document.querySelectorAll(".theme-chip").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.theme === name);
  });
}

function applyZoom() {
  document.getElementById("zoomDown").disabled = zoom <= MIN_ZOOM;
  document.getElementById("zoomUp").disabled = zoom >= MAX_ZOOM;
  stage.classList.toggle("zoomed", zoom > 100);
}

function changeZoom(step) {
  commitZoom(zoom + step);
}

function commitZoom(newZoom) {
  zoom = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)));
  frame.style.transform = "";
  applyZoom();
  pageCache.clear();
  showPage(currentPage, { instant: true });
}

function toggleFocus() {
  readerBody.classList.toggle("focus");
  if (typeof showToast === 'function') {
    if (readerBody.classList.contains("focus")) {
      showToast("🧘 Focus Mode Active. Tap center or press Esc/F to exit.");
    }
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

/* ---------- Progress & Navigation UI ---------- */
function updateUi() {
  pageInfoEl.textContent = `Page ${currentPage} of ${totalPages}`;
  if (pageJumpInput) pageJumpInput.value = currentPage;
  if (pageTotalText) pageTotalText.textContent = `of ${totalPages}`;
  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  const pct = Math.round((currentPage / totalPages) * 100);
  fillEl.style.width = pct + "%";
  readerProgress.setAttribute("aria-valuenow", pct);

  if (timeEst) {
    const pagesLeft = totalPages - currentPage;
    const estMinutes = Math.max(1, Math.ceil(pagesLeft * 1.5));
    timeEst.textContent = pagesLeft <= 0 ? "Book finished! 🎓" : `~${estMinutes}m left`;
  }
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
  saveStateEl.textContent = error ? "Not saved" : "Saved ✓";
}

/* ---------- Reading Session Timer Display ---------- */
function initTimerDisplay() {
  const badge = document.getElementById("timerBadge");
  const text = document.getElementById("timerText");
  if (window.readingTimer) {
    window.readingTimer.displayEl = text;
  }
}

/* ---------- Ambient Audio UI ---------- */
function initAmbientUi() {
  const menuBtn = document.getElementById("ambientMenuBtn");
  const menu = document.getElementById("ambientMenu");
  const volSlider = document.getElementById("ambientVol");

  if (!menuBtn || !menu) return;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllDropdowns(menu);
    menu.hidden = !menu.hidden;
  });

  document.querySelectorAll(".ambient-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ambient-opt").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const sound = btn.dataset.sound;
      if (sound === "off") {
        window.ambientSound.stop();
        menuBtn.classList.remove("active-glow");
      } else {
        window.ambientSound.play(sound);
        menuBtn.classList.add("active-glow");
      }
    });
  });

  volSlider.value = window.ambientSound.volume;
  volSlider.addEventListener("input", (e) => {
    window.ambientSound.setVolume(parseFloat(e.target.value));
  });
}

/* ---------- Text to Speech (Audiobook) UI ---------- */
function initTtsUi() {
  const ttsBtn = document.getElementById("ttsPlayBtn");
  const ttsMenu = document.getElementById("ttsMenu");
  const startStopBtn = document.getElementById("ttsStartStopBtn");
  const pauseBtn = document.getElementById("ttsPauseBtn");
  const statusText = document.getElementById("ttsStatusText");
  const speedSelect = document.getElementById("ttsSpeedSelect");
  const voiceSelect = document.getElementById("ttsVoiceSelect");
  const autoTurnCheck = document.getElementById("ttsAutoTurnCheck");

  if (!ttsBtn || !ttsMenu) return;

  ttsBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllDropdowns(ttsMenu);
    ttsMenu.hidden = !ttsMenu.hidden;
  });

  // Populate voice selector
  const populateVoices = () => {
    if (!window.ttsManager.voices.length) return;
    voiceSelect.innerHTML = window.ttsManager.voices.map(v =>
      `<option value="${escapeHtml(v.name)}">${escapeHtml(v.name)} (${escapeHtml(v.lang)})</option>`
    ).join("");
    if (window.ttsManager.selectedVoice) {
      voiceSelect.value = window.ttsManager.selectedVoice.name;
    }
  };
  populateVoices();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  voiceSelect.addEventListener("change", (e) => {
    window.ttsManager.setVoice(e.target.value);
  });

  speedSelect.addEventListener("change", (e) => {
    window.ttsManager.setRate(parseFloat(e.target.value));
  });

  autoTurnCheck.addEventListener("change", (e) => {
    window.ttsManager.autoTurn = e.target.checked;
  });

  startStopBtn.addEventListener("click", () => {
    if (window.ttsManager.isSpeaking) {
      window.ttsManager.stop();
    } else {
      window.ttsManager.readCurrentPage(pdfDoc, currentPage, () => {
        if (currentPage < totalPages) {
          showPage(currentPage + 1).then(() => {
            window.ttsManager.readCurrentPage(pdfDoc, currentPage);
          });
        }
      });
    }
  });

  pauseBtn.addEventListener("click", () => {
    if (window.ttsManager.isPaused) {
      window.ttsManager.resume();
    } else {
      window.ttsManager.pause();
    }
  });

  window.ttsManager.onStateChange = ({ status }) => {
    if (status === "speaking") {
      statusText.textContent = `🔊 Reading Page ${currentPage}...`;
      startStopBtn.textContent = "⏹ Stop";
      pauseBtn.disabled = false;
      pauseBtn.textContent = "⏸ Pause";
      ttsBtn.classList.add("active-glow");
    } else if (status === "paused") {
      statusText.textContent = `⏸ Paused on Page ${currentPage}`;
      pauseBtn.textContent = "▶ Resume";
    } else if (status === "loading") {
      statusText.textContent = "Extracting text...";
    } else {
      statusText.textContent = "Ready to read current page";
      startStopBtn.textContent = "▶ Start Reading";
      pauseBtn.disabled = true;
      pauseBtn.textContent = "⏸ Pause";
      ttsBtn.classList.remove("active-glow");
    }
  };
}

/* ---------- Bookmarks UI ---------- */
function initBookmarksUi() {
  const bookmarkBtn = document.getElementById("bookmarkBtn");
  const drawerBtn = document.getElementById("openBookmarksDrawerBtn");
  const backdrop = document.getElementById("bookmarksBackdrop");
  const closeBtn = document.getElementById("closeDrawerBtn");
  const saveCurrentBtn = document.getElementById("bmSaveCurrentBtn");
  const noteInput = document.getElementById("bmNoteInput");

  bookmarkBtn.addEventListener("click", () => {
    if (!bookmarksManager) return;
    if (bookmarksManager.isBookmarked(currentPage)) {
      bookmarksManager.remove(currentPage);
      if (typeof showToast === "function") showToast(`Bookmark removed for Page ${currentPage}`);
    } else {
      bookmarksManager.add(currentPage);
      if (typeof showToast === "function") showToast(`🔖 Page ${currentPage} bookmarked!`);
    }
    updateBookmarkButton();
    renderBookmarksList();
  });

  drawerBtn.addEventListener("click", () => {
    renderBookmarksList();
    backdrop.hidden = false;
  });

  closeBtn.addEventListener("click", () => backdrop.hidden = true);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.hidden = true;
  });

  saveCurrentBtn.addEventListener("click", () => {
    const note = noteInput.value;
    bookmarksManager.add(currentPage, note);
    noteInput.value = "";
    if (typeof showToast === "function") showToast(`Page ${currentPage} bookmark saved!`);
    updateBookmarkButton();
    renderBookmarksList();
  });
}

function updateBookmarkButton() {
  const bookmarkBtn = document.getElementById("bookmarkBtn");
  const label = document.getElementById("bookmarkLabel");
  if (!bookmarkBtn || !bookmarksManager) return;

  const isBm = bookmarksManager.isBookmarked(currentPage);
  bookmarkBtn.classList.toggle("bookmarked", isBm);
  if (label) label.textContent = isBm ? "Saved" : "Bookmark";
}

function renderBookmarksList() {
  const listEl = document.getElementById("bookmarksList");
  if (!listEl || !bookmarksManager) return;

  const list = bookmarksManager.bookmarks;
  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty" style="text-align:center;">No bookmarks saved yet. Click "Save Page" above to add one!</p>';
    return;
  }

  listEl.innerHTML = list.map(bm => `
    <div class="bm-card ${bm.page === currentPage ? 'active' : ''}">
      <div class="bm-info" onclick="showPage(${bm.page});document.getElementById('bookmarksBackdrop').hidden=true;">
        <strong>Page ${bm.page}</strong>
        ${bm.note ? `<p class="bm-note">${escapeHtml(bm.note)}</p>` : ''}
        <span class="bm-time">${escapeHtml(bm.time)}</span>
      </div>
      <button class="bm-del-btn" aria-label="Delete bookmark" onclick="event.stopPropagation();bookmarksManager.remove(${bm.page});renderBookmarksList();updateBookmarkButton();">&times;</button>
    </div>
  `).join("");
}

/* ---------- Dropdown helpers ---------- */
function closeAllDropdowns(except) {
  document.querySelectorAll(".tool-dropdown-menu").forEach(menu => {
    if (menu !== except) menu.hidden = true;
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".tool-dropdown-wrap")) {
    closeAllDropdowns(null);
  }
});

/* ---------- Keyboard & Gesture Events ---------- */
function bindEvents() {
  prevBtn.addEventListener("click", () => showPage(currentPage - 1));
  nextBtn.addEventListener("click", () => showPage(currentPage + 1));
  document.getElementById("tapPrev").addEventListener("click", () => showPage(currentPage - 1));
  document.getElementById("tapNext").addEventListener("click", () => showPage(currentPage + 1));
  document.getElementById("tapFocus").addEventListener("click", toggleFocus);
  document.getElementById("focusBtn").addEventListener("click", toggleFocus);
  document.getElementById("fullscreenBtn").addEventListener("click", toggleFullscreen);
  document.getElementById("zoomDown").addEventListener("click", () => changeZoom(-15));
  document.getElementById("zoomUp").addEventListener("click", () => changeZoom(15));

  // Page Jump Input
  pageJumpInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = parseInt(pageJumpInput.value, 10);
      if (!isNaN(val)) showPage(val);
      pageJumpInput.blur();
    }
  });

  // Reading Ruler button
  document.getElementById("rulerToggleBtn").addEventListener("click", () => {
    window.readingRuler.toggle();
    document.getElementById("rulerToggleBtn").classList.toggle("active-glow", window.readingRuler.active);
  });

  // Speed Reader button
  document.getElementById("speedReaderBtn").addEventListener("click", async () => {
    if (!pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const content = await page.getTextContent();
      const rawText = content.items.map(item => item.str).join(" ");
      window.speedReader.open(rawText, (jump) => showPage(currentPage + jump));
    } catch (e) {
      if (typeof showToast === "function") showToast("Could not extract page text for Speed Reader.");
    }
  });

  // Theme dropdown & dimmer
  const themeMenuBtn = document.getElementById("themeMenuBtn");
  const themeMenu = document.getElementById("themeMenu");
  themeMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllDropdowns(themeMenu);
    themeMenu.hidden = !themeMenu.hidden;
  });

  document.querySelectorAll(".theme-chip").forEach(btn => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
  });

  const dimmer = document.getElementById("pageDimmer");
  dimmer.addEventListener("input", (e) => {
    frame.style.opacity = e.target.value;
  });

  // Keyboard Shortcuts modal
  const shortcutsBtn = document.getElementById("shortcutsBtn");
  const shortcutsModal = document.getElementById("shortcutsModal");
  shortcutsBtn.addEventListener("click", () => shortcutsModal.hidden = false);
  document.getElementById("closeShortcutsBtn").addEventListener("click", () => shortcutsModal.hidden = true);
  document.getElementById("closeShortcutsBtn2").addEventListener("click", () => shortcutsModal.hidden = true);
  shortcutsModal.addEventListener("click", (e) => {
    if (e.target === shortcutsModal) shortcutsModal.hidden = true;
  });

  document.getElementById("retryBtn").addEventListener("click", () => {
    const n = Number(errorBox.dataset.page) || currentPage;
    pageCache.delete(cacheKey(n));
    showPage(n);
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) saveProgress(); });

  document.addEventListener("keydown", event => {
    // If typing in input, don't trigger shortcuts
    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.tagName === "SELECT") return;

    if (event.key === "ArrowRight" || event.key === " ") {
      event.preventDefault();
      showPage(currentPage + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPage(currentPage - 1);
    } else if (event.key === "Home") {
      showPage(1);
    } else if (event.key === "End") {
      showPage(totalPages);
    } else if (event.key === "f" || event.key === "F") {
      toggleFocus();
    } else if (event.key === "z" || event.key === "Z") {
      toggleFullscreen();
    } else if (event.key === "r" || event.key === "R") {
      window.readingRuler.toggle();
      document.getElementById("rulerToggleBtn").classList.toggle("active-glow", window.readingRuler.active);
    } else if (event.key === "b" || event.key === "B") {
      document.getElementById("bookmarkBtn").click();
    } else if (event.key === "s" || event.key === "S") {
      document.getElementById("speedReaderBtn").click();
    } else if (event.key === "a" || event.key === "A") {
      if (window.ambientSound.isPlaying) {
        window.ambientSound.stop();
        document.getElementById("ambientMenuBtn").classList.remove("active-glow");
      } else {
        window.ambientSound.play("rain");
        document.getElementById("ambientMenuBtn").classList.add("active-glow");
      }
    } else if (event.key === "+" || event.key === "=") {
      changeZoom(15);
    } else if (event.key === "-" || event.key === "_") {
      changeZoom(-15);
    } else if (event.key === "?") {
      shortcutsModal.hidden = !shortcutsModal.hidden;
    } else if (event.key === "Escape") {
      closeAllDropdowns(null);
      shortcutsModal.hidden = true;
      document.getElementById("bookmarksBackdrop").hidden = true;
      if (readerBody.classList.contains("focus")) toggleFocus();
    }
  });

  // Touch & Swipe gestures
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
    if (zoom > 100) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) showPage(currentPage + 1); else showPage(currentPage - 1);
    }
  }, { passive: true });

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

  stage.addEventListener("wheel", e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    pendingZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (pendingZoom ?? zoom) - e.deltaY * 0.4));
    frame.style.transform = `scale(${(pendingZoom / zoom).toFixed(3)})`;
    clearTimeout(wheelZoomTimer);
    wheelZoomTimer = setTimeout(() => commitZoom(pendingZoom), 180);
  }, { passive: false });

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      pageCache.clear();
      showPage(currentPage, { instant: true });
    }, 250);
  });
}

initReader();
