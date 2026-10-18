/* reader.js - Complete Mobile-First HD Reading Engine with Smart Zoom, Ambient Audio, TTS, and Focus Modes */

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
const pageJumpInput = document.getElementById("pageJumpInput");
const pageTotalText = document.getElementById("pageTotalText");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const fillEl = document.getElementById("progressFill");
const saveStateEl = document.getElementById("saveState");
const noticeEl = document.getElementById("notice");
const swipeHint = document.getElementById("swipeHint");
const timeEst = document.getElementById("timeEst");
const fitModeBtn = document.getElementById("fitModeBtn");
const fitModeText = document.getElementById("fitModeText");
const fitModeIcon = document.getElementById("fitModeIcon");
const zoomValText = document.getElementById("zoomValText");
const zoomResetBtn = document.getElementById("zoomResetBtn");

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// Device detection & initial state
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;

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

// Fit modes: "width" (optimal for mobile reading) or "page" (fits entire page on screen)
let fitMode = localStorage.getItem("ol_fit_mode") || (isMobileDevice ? "width" : "page");
let zoom = parseInt(localStorage.getItem("ol_zoom") || (isMobileDevice ? "120" : "100"), 10);
const MIN_ZOOM = 50, MAX_ZOOM = 350;

let theme = localStorage.getItem("ol_reader_theme") || "dark";
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
  titleEl.title = book.title;
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
  initMobileToolsUi();
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

/* ---------- HD & Mobile-Responsive Rendering ---------- */
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;

function computeCssWidth(original) {
  const isMobile = window.innerWidth <= 768;
  const padding = isMobile ? 8 : 32;
  const availW = Math.max(240, stage.clientWidth - padding);

  if (fitMode === "width") {
    // Fill screen width so text is comfortably readable like a mobile eBook!
    return Math.round(availW * (zoom / 100));
  } else {
    // Fit entire page inside the screen without requiring vertical scroll
    const chromeH = (readerBar ? readerBar.offsetHeight : 50) +
                   (readerProgress ? readerProgress.offsetHeight : 4) +
                   (readerFoot ? readerFoot.offsetHeight : 50);
    const availH = Math.max(240, window.innerHeight - chromeH - (isMobile ? 12 : 28));
    const fitWidth = Math.min(availW, availH * (original.width / original.height));
    return Math.round(fitWidth * (zoom / 100));
  }
}

function cacheKey(number) { return number + ":" + zoom + ":" + fitMode; }

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
    const [pageStr, zoomStr, modeStr] = key.split(":");
    if (Number(zoomStr) !== zoom || modeStr !== fitMode || Math.abs(Number(pageStr) - currentPage) > CACHE_RADIUS) {
      pageCache.delete(key);
    }
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
  if (zoomValText) zoomValText.textContent = zoom + "%";

  if (fitModeText && fitModeIcon) {
    fitModeText.textContent = fitMode === "width" ? "Width" : "Page";
    fitModeIcon.textContent = fitMode === "width" ? "↔" : "↕";
  }

  if (fitModeBtn) {
    fitModeBtn.classList.toggle("mode-active", fitMode === "width");
  }

  // Highlight matching zoom preset in mobile sheet
  document.querySelectorAll(".zoom-preset-btn").forEach(btn => {
    btn.classList.toggle("btn-primary", Number(btn.dataset.zoom) === zoom);
  });

  stage.classList.toggle("zoomed", zoom > 100 || fitMode === "width");
}

function changeZoom(step) {
  commitZoom(zoom + step);
}

function commitZoom(newZoom) {
  zoom = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom)));
  localStorage.setItem("ol_zoom", String(zoom));
  frame.style.transform = "";
  applyZoom();
  pageCache.clear();
  showPage(currentPage, { instant: true });
}

function toggleFitMode() {
  fitMode = fitMode === "width" ? "page" : "width";
  localStorage.setItem("ol_fit_mode", fitMode);

  if (fitMode === "width" && zoom < 100) {
    zoom = 120;
    localStorage.setItem("ol_zoom", "120");
  } else if (fitMode === "page" && zoom > 150) {
    zoom = 100;
    localStorage.setItem("ol_zoom", "100");
  }

  applyZoom();
  pageCache.clear();
  showPage(currentPage, { instant: true });

  if (typeof showToast === "function") {
    showToast(fitMode === "width" ? "↔ Fit to Screen Width (Easy Reading)" : "↕ Fit Entire Page");
  }
}

function toggleFocus() {
  readerBody.classList.toggle("focus");
  if (typeof showToast === 'function') {
    if (readerBody.classList.contains("focus")) {
      showToast("🧘 Zen Focus Mode: Tap 'Focus' or press Esc/F to exit.");
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
    timeEst.textContent = pagesLeft <= 0 ? "Finished! 🎓" : `~${estMinutes}m left`;
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
  if (saveStateEl) saveStateEl.textContent = error ? "Not saved" : "Saved ✓";
}

/* ---------- Reading Session Timer Display ---------- */
function initTimerDisplay() {
  const text = document.getElementById("timerText");
  if (window.readingTimer && text) {
    window.readingTimer.displayEl = text;
  }
}

/* ---------- Ambient Audio UI ---------- */
function initAmbientUi() {
  const menuBtn = document.getElementById("ambientMenuBtn");
  const menu = document.getElementById("ambientMenu");
  const volSlider = document.getElementById("ambientVol");

  if (menuBtn && menu) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns(menu);
      menu.hidden = !menu.hidden;
    });
  }

  document.querySelectorAll(".ambient-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ambient-opt").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const sound = btn.dataset.sound;
      if (sound === "off") {
        window.ambientSound.stop();
        if (menuBtn) menuBtn.classList.remove("active-glow");
      } else {
        window.ambientSound.play(sound);
        if (menuBtn) menuBtn.classList.add("active-glow");
      }
    });
  });

  if (volSlider) {
    volSlider.value = window.ambientSound.volume;
    volSlider.addEventListener("input", (e) => {
      window.ambientSound.setVolume(parseFloat(e.target.value));
    });
  }
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

  if (ttsBtn && ttsMenu) {
    ttsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns(ttsMenu);
      ttsMenu.hidden = !ttsMenu.hidden;
    });
  }

  const populateVoices = () => {
    if (!voiceSelect || !window.ttsManager.voices.length) return;
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

  if (voiceSelect) {
    voiceSelect.addEventListener("change", (e) => window.ttsManager.setVoice(e.target.value));
  }
  if (speedSelect) {
    speedSelect.addEventListener("change", (e) => window.ttsManager.setRate(parseFloat(e.target.value)));
  }
  if (autoTurnCheck) {
    autoTurnCheck.addEventListener("change", (e) => window.ttsManager.autoTurn = e.target.checked);
  }

  const handleStartStop = () => {
    if (window.ttsManager.isSpeaking) {
      window.ttsManager.stop();
    } else {
      window.ttsManager.readCurrentPage(pdfDoc, currentPage, () => {
        if (currentPage < totalPages) {
          showPage(currentPage + 1).then(() => window.ttsManager.readCurrentPage(pdfDoc, currentPage));
        }
      });
    }
  };

  if (startStopBtn) startStopBtn.addEventListener("click", handleStartStop);
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (window.ttsManager.isPaused) window.ttsManager.resume();
      else window.ttsManager.pause();
    });
  }

  window.ttsManager.onStateChange = ({ status }) => {
    const isSpeaking = status === "speaking";
    if (statusText) {
      statusText.textContent = isSpeaking ? `🔊 Reading Page ${currentPage}...` :
                               status === "paused" ? `⏸ Paused on Page ${currentPage}` :
                               status === "loading" ? "Extracting text..." : "Ready to read current page";
    }
    if (startStopBtn) startStopBtn.textContent = isSpeaking ? "⏹ Stop" : "▶ Start Reading";
    if (pauseBtn) {
      pauseBtn.disabled = !isSpeaking && status !== "paused";
      pauseBtn.textContent = status === "paused" ? "▶ Resume" : "⏸ Pause";
    }
    if (ttsBtn) ttsBtn.classList.toggle("active-glow", isSpeaking);
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

  const toggleBookmark = () => {
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
  };

  if (bookmarkBtn) bookmarkBtn.addEventListener("click", toggleBookmark);
  if (drawerBtn) {
    drawerBtn.addEventListener("click", () => {
      renderBookmarksList();
      if (backdrop) backdrop.hidden = false;
    });
  }

  if (closeBtn && backdrop) closeBtn.addEventListener("click", () => backdrop.hidden = true);
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.hidden = true;
    });
  }

  if (saveCurrentBtn && noteInput) {
    saveCurrentBtn.addEventListener("click", () => {
      const note = noteInput.value;
      bookmarksManager.add(currentPage, note);
      noteInput.value = "";
      if (typeof showToast === "function") showToast(`Page ${currentPage} bookmark saved!`);
      updateBookmarkButton();
      renderBookmarksList();
    });
  }
}

function updateBookmarkButton() {
  const bookmarkBtn = document.getElementById("bookmarkBtn");
  const label = document.getElementById("bookmarkLabel");
  if (!bookmarksManager) return;

  const isBm = bookmarksManager.isBookmarked(currentPage);
  if (bookmarkBtn) bookmarkBtn.classList.toggle("bookmarked", isBm);
  if (label) label.textContent = isBm ? "Saved" : "Bookmark";
}

function renderBookmarksList() {
  const listEl = document.getElementById("bookmarksList");
  if (!listEl || !bookmarksManager) return;

  const list = bookmarksManager.bookmarks;
  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty" style="text-align:center;">No bookmarks saved yet. Click "Save" above to bookmark this page!</p>';
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

/* ---------- Mobile Tools Bottom Sheet ---------- */
function initMobileToolsUi() {
  const mobileToolsBtn = document.getElementById("mobileToolsBtn");
  const mobileModal = document.getElementById("mobileToolsModal");
  const closeBtn = document.getElementById("closeMobileToolsBtn");

  if (!mobileToolsBtn || !mobileModal) return;

  mobileToolsBtn.addEventListener("click", () => {
    mobileModal.hidden = false;
  });

  if (closeBtn) closeBtn.addEventListener("click", () => mobileModal.hidden = true);
  mobileModal.addEventListener("click", (e) => {
    if (e.target === mobileModal) mobileModal.hidden = true;
  });

  // Fit Width & Fit Page buttons in mobile sheet
  const mFitWidthBtn = document.getElementById("mFitWidthBtn");
  const mFitPageBtn = document.getElementById("mFitPageBtn");
  if (mFitWidthBtn) {
    mFitWidthBtn.addEventListener("click", () => {
      fitMode = "width";
      localStorage.setItem("ol_fit_mode", fitMode);
      commitZoom(Math.max(110, zoom));
      mobileModal.hidden = true;
    });
  }
  if (mFitPageBtn) {
    mFitPageBtn.addEventListener("click", () => {
      fitMode = "page";
      localStorage.setItem("ol_fit_mode", fitMode);
      commitZoom(100);
      mobileModal.hidden = true;
    });
  }

  // Zoom preset buttons
  document.querySelectorAll(".zoom-preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const z = Number(btn.dataset.zoom);
      commitZoom(z);
      mobileModal.hidden = true;
    });
  });

  // Mobile tools action buttons
  const mAudio = document.getElementById("mAudiobookBtn");
  if (mAudio) {
    mAudio.addEventListener("click", () => {
      mobileModal.hidden = true;
      if (window.ttsManager.isSpeaking) {
        window.ttsManager.stop();
      } else {
        window.ttsManager.readCurrentPage(pdfDoc, currentPage, () => {
          if (currentPage < totalPages) showPage(currentPage + 1);
        });
      }
    });
  }

  const mRuler = document.getElementById("mRulerBtn");
  if (mRuler) {
    mRuler.addEventListener("click", () => {
      mobileModal.hidden = true;
      window.readingRuler.toggle();
    });
  }

  const mSpeed = document.getElementById("mSpeedBtn");
  if (mSpeed) {
    mSpeed.addEventListener("click", async () => {
      mobileModal.hidden = true;
      try {
        const page = await pdfDoc.getPage(currentPage);
        const content = await page.getTextContent();
        const rawText = content.items.map(item => item.str).join(" ");
        window.speedReader.open(rawText, (jump) => showPage(currentPage + jump));
      } catch (e) {}
    });
  }

  const mBm = document.getElementById("mBookmarkBtn");
  if (mBm) {
    mBm.addEventListener("click", () => {
      mobileModal.hidden = true;
      document.getElementById("bookmarkBtn")?.click();
    });
  }

  const mBmList = document.getElementById("mBookmarksListBtn");
  if (mBmList) {
    mBmList.addEventListener("click", () => {
      mobileModal.hidden = true;
      renderBookmarksList();
      document.getElementById("bookmarksBackdrop").hidden = false;
    });
  }

  const mFs = document.getElementById("mFullscreenBtn");
  if (mFs) {
    mFs.addEventListener("click", () => {
      mobileModal.hidden = true;
      toggleFullscreen();
    });
  }
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

/* ---------- Event Bindings & Gestures ---------- */
function bindEvents() {
  prevBtn.addEventListener("click", () => showPage(currentPage - 1));
  nextBtn.addEventListener("click", () => showPage(currentPage + 1));
  if (focusBtn) focusBtn.addEventListener("click", toggleFocus);
  if (fitModeBtn) fitModeBtn.addEventListener("click", toggleFitMode);

  // Zoom Stepper
  document.getElementById("zoomDown").addEventListener("click", () => changeZoom(-15));
  document.getElementById("zoomUp").addEventListener("click", () => changeZoom(15));
  if (zoomResetBtn) {
    zoomResetBtn.addEventListener("click", () => {
      const presets = [100, 120, 140, 160, 200];
      const nextPreset = presets.find(p => p > zoom) || 100;
      commitZoom(nextPreset);
    });
  }

  // Page Jump Input
  if (pageJumpInput) {
    pageJumpInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = parseInt(pageJumpInput.value, 10);
        if (!isNaN(val)) showPage(val);
        pageJumpInput.blur();
      }
    });
  }

  // Stationary Tap Zones (Prev / Next only on deliberate tap, never on vertical scroll!)
  const tapPrev = document.getElementById("tapPrev");
  const tapNext = document.getElementById("tapNext");

  function attachTapHandler(el, action) {
    if (!el) return;
    let tStart = 0, xStart = 0, yStart = 0;
    el.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length === 1) {
        tStart = Date.now();
        xStart = e.touches[0].clientX;
        yStart = e.touches[0].clientY;
      }
    }, { passive: true });

    el.addEventListener("touchend", (e) => {
      if (e.changedTouches && e.changedTouches.length === 1) {
        const dt = Date.now() - tStart;
        const dx = Math.abs(e.changedTouches[0].clientX - xStart);
        const dy = Math.abs(e.changedTouches[0].clientY - yStart);
        // Only trigger if stationary tap (<300ms and <12px movement)
        if (dt < 300 && dx < 12 && dy < 12) {
          action();
        }
      }
    }, { passive: true });

    el.addEventListener("click", (e) => {
      if (Date.now() - tStart > 500) action();
    });
  }

  attachTapHandler(tapPrev, () => showPage(currentPage - 1));
  attachTapHandler(tapNext, () => showPage(currentPage + 1));

  // Reading Ruler button
  const rulerToggleBtn = document.getElementById("rulerToggleBtn");
  if (rulerToggleBtn) {
    rulerToggleBtn.addEventListener("click", () => {
      window.readingRuler.toggle();
      rulerToggleBtn.classList.toggle("active-glow", window.readingRuler.active);
    });
  }

  // Speed Reader button
  const speedReaderBtn = document.getElementById("speedReaderBtn");
  if (speedReaderBtn) {
    speedReaderBtn.addEventListener("click", async () => {
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
  }

  // Theme dropdown & dimmer
  const themeMenuBtn = document.getElementById("themeMenuBtn");
  const themeMenu = document.getElementById("themeMenu");
  if (themeMenuBtn && themeMenu) {
    themeMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllDropdowns(themeMenu);
      themeMenu.hidden = !themeMenu.hidden;
    });
  }

  document.querySelectorAll(".theme-chip").forEach(btn => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.theme));
  });

  const dimmer = document.getElementById("pageDimmer");
  if (dimmer) {
    dimmer.addEventListener("input", (e) => {
      frame.style.opacity = e.target.value;
    });
  }

  // Fullscreen button
  const fsBtn = document.getElementById("fullscreenBtn");
  if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);

  // Keyboard Shortcuts modal
  const shortcutsBtn = document.getElementById("shortcutsBtn");
  const shortcutsModal = document.getElementById("shortcutsModal");
  if (shortcutsBtn && shortcutsModal) {
    shortcutsBtn.addEventListener("click", () => shortcutsModal.hidden = false);
    document.getElementById("closeShortcutsBtn")?.addEventListener("click", () => shortcutsModal.hidden = true);
    document.getElementById("closeShortcutsBtn2")?.addEventListener("click", () => shortcutsModal.hidden = true);
    shortcutsModal.addEventListener("click", (e) => {
      if (e.target === shortcutsModal) shortcutsModal.hidden = true;
    });
  }

  document.getElementById("retryBtn")?.addEventListener("click", () => {
    const n = Number(errorBox.dataset.page) || currentPage;
    pageCache.delete(cacheKey(n));
    showPage(n);
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) saveProgress(); });

  document.addEventListener("keydown", event => {
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
    } else if (event.key === "w" || event.key === "W") {
      toggleFitMode();
    } else if (event.key === "f" || event.key === "F") {
      toggleFocus();
    } else if (event.key === "z" || event.key === "Z") {
      toggleFullscreen();
    } else if (event.key === "r" || event.key === "R") {
      window.readingRuler.toggle();
      document.getElementById("rulerToggleBtn")?.classList.toggle("active-glow", window.readingRuler.active);
    } else if (event.key === "b" || event.key === "B") {
      document.getElementById("bookmarkBtn")?.click();
    } else if (event.key === "s" || event.key === "S") {
      document.getElementById("speedReaderBtn")?.click();
    } else if (event.key === "a" || event.key === "A") {
      if (window.ambientSound.isPlaying) {
        window.ambientSound.stop();
        document.getElementById("ambientMenuBtn")?.classList.remove("active-glow");
      } else {
        window.ambientSound.play("rain");
        document.getElementById("ambientMenuBtn")?.classList.add("active-glow");
      }
    } else if (event.key === "+" || event.key === "=") {
      changeZoom(15);
    } else if (event.key === "-" || event.key === "_") {
      changeZoom(-15);
    } else if (event.key === "?") {
      if (shortcutsModal) shortcutsModal.hidden = !shortcutsModal.hidden;
    } else if (event.key === "Escape") {
      closeAllDropdowns(null);
      if (shortcutsModal) shortcutsModal.hidden = true;
      const bModal = document.getElementById("bookmarksBackdrop");
      if (bModal) bModal.hidden = true;
      const mModal = document.getElementById("mobileToolsModal");
      if (mModal) mModal.hidden = true;
      if (readerBody.classList.contains("focus")) toggleFocus();
    }
  });

  // Smooth Touch Gestures & Two-finger Pinch Zoom
  let touchStartX = 0, touchStartY = 0;
  stage.addEventListener("touchstart", e => {
    if (e.touches && e.touches.length === 2) { startPinch(e); return; }
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });

  stage.addEventListener("touchmove", e => {
    if (pinchState || (e.touches && e.touches.length === 2)) movePinch(e);
  }, { passive: false });

  stage.addEventListener("touchend", e => {
    if (pinchState) { endPinch(); return; }
    // Horizontal swipe for page turn (only if swipe is predominantly horizontal)
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.8) {
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
    pendingZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(pinchState.startZoom * ratio)));
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
