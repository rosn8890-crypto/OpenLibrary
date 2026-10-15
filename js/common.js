/* =====================================================
   common.js  -  small helper functions used on every page
   ===================================================== */

// If config.js is not filled yet, show a clear message instead of a broken page.
if (!isConfigured) {
  document.body.innerHTML =
    '<div class="container" style="padding:4rem 0"><h1>Setup needed</h1>' +
    '<p style="margin-top:1rem">Open <b>js/config.js</b> and paste your Supabase URL and anon key. ' +
    'Steps are in README.md.</p></div>';
  throw new Error("Supabase is not configured. Edit js/config.js");
}

// Columns needed to draw a book card. We do NOT load the full book text here (it is heavy).
const CARD_COLUMNS = "id, title, author, cover_url, categories(name, slug)";

// Cover colours: [background, text colour]. A book always gets the same colours (based on its title).
const COVER_COLORS = [
  ["#0e6b57", "#e8f4ef"], ["#1f3a5f", "#e9f0f9"], ["#8a3a30", "#fbece6"], ["#5a3e85", "#f0eaf8"],
  ["#c48a2c", "#20160a"], ["#2b5d6b", "#e6f2f5"], ["#7a2f57", "#f8e9f1"], ["#3f4a2c", "#eef2e2"]
];

// Small icons for the navbar (drawn with SVG, so no image files are needed)
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

/* ---------- 1) Safety helpers ---------- */

// Turns < > & " ' into harmless text. Always use this before putting user data inside innerHTML.
function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// Only allow normal web links (blocks "javascript:" links).
function safeUrl(url) {
  return /^https?:\/\//i.test(url || "") ? url : "#";
}

/* ---------- 2) Small UI helpers ---------- */

function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// type can be "ok", "err" or empty
function showMessage(element, text, type) {
  element.innerHTML = `<div class="msg ${type || ""}">${escapeHtml(text)}</div>`;
}

/* ---------- 3) Book drawing helpers ---------- */

function hashNumber(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function pickColors(title) {
  return COVER_COLORS[hashNumber(title) % COVER_COLORS.length];
}

// Book cover: uses the uploaded image, or draws a typographic cover.
function coverHtml(book) {
  if (book.cover_url) {
    return `<div class="cover"><img src="${escapeHtml(safeUrl(book.cover_url))}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy"></div>`;
  }
  const [bg, fg] = pickColors(book.title);
  return `<div class="cover" style="background:${bg};color:${fg}">
            <span class="c-title">${escapeHtml(book.title)}</span>
            <span class="c-author">${escapeHtml(book.author)}</span>
          </div>`;
}

// One book card. "progress" (0-100) is optional and draws a progress bar.
function bookCard(book, progress) {
  const category = book.categories ? book.categories.name : "General";
  const bar = progress != null
    ? `<div class="bar"><span style="width:${Math.round(Number(progress))}%"></span></div>` : "";
  return `<a class="book-card" href="book.html?id=${book.id}">
            ${coverHtml(book)}
            <div class="book-info">
              <h3>${escapeHtml(book.title)}</h3>
              <p class="author">${escapeHtml(book.author)}</p>
              <p class="meta">${escapeHtml(category)}</p>
              ${bar}
            </div>
          </a>`;
}

// A book "spine" for the shelf on the home page.
function spineHtml(book) {
  const [bg, fg] = pickColors(book.title);
  const h = hashNumber(book.title);
  const height = 150 + (h % 6) * 14;
  const width = 38 + ((h >> 3) % 4) * 6;
  return `<a class="spine" href="book.html?id=${book.id}" title="${escapeHtml(book.title)}"
             style="height:${height}px;width:${width}px;background:${bg};color:${fg}">${escapeHtml(book.title)}</a>`;
}

/* ---------- 4) Login helpers ---------- */

// Returns the logged-in user, or null.
async function getUser() {
  const { data } = await db.auth.getSession();
  return data.session ? data.session.user : null;
}

// Use at the top of pages that need login. Sends the visitor to login.html if not logged in.
async function requireLogin() {
  const user = await getUser();
  if (!user) {
    const back = location.pathname.split("/").pop() + location.search;
    location.href = "login.html?next=" + encodeURIComponent(back);
    return null;
  }
  return user;
}

/* ---------- 5) Navbar and footer (written once, shown on every page) ---------- */

async function renderNavbar() {
  const user = await getUser();
  const current = location.pathname.split("/").pop() || "index.html";

  const pages = [
    ["index.html", "Home"], ["categories.html", "Categories"], ["dashboard.html", "Dashboard"],
    ["favorites.html", "Favorites"], ["upload.html", "Upload"]
  ];

  const links = pages.map(([file, label]) =>
    `<a href="${file}" class="${file === current ? "active" : ""}">${label}</a>`).join("");

  const themeButton = `<button class="icon-btn" id="themeBtn" aria-label="Switch between light and dark theme"></button>`;
  const account = user
    ? `<span class="nav-user">${themeButton}${escapeHtml(user.email)} <button class="btn btn-outline btn-sm" id="logoutBtn">Log out</button></span>`
    : `<span class="nav-user">${themeButton}<a class="btn btn-sm" href="login.html">Log in</a></span>`;

  document.getElementById("navbar").innerHTML =
    `<div class="container nav-inner">
       <a class="brand" href="index.html"><img src="favicon.svg" alt="" width="32" height="32"><span>OpenLibrary</span></a>
       <button class="nav-toggle" id="navToggle" aria-label="Open menu">Menu</button>
       <nav id="navLinks">${links}${account}</nav>
     </div>`;

  document.getElementById("navToggle").addEventListener("click", () =>
    document.getElementById("navLinks").classList.toggle("open"));

  // Theme button: shows a moon in light mode and a sun in dark mode
  const themeBtn = document.getElementById("themeBtn");
  const drawThemeIcon = () => {
    themeBtn.innerHTML = document.documentElement.getAttribute("data-theme") === "dark" ? SUN_SVG : MOON_SVG;
  };
  drawThemeIcon();
  themeBtn.addEventListener("click", () => { toggleTheme(); drawThemeIcon(); });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await db.auth.signOut();
      location.href = "index.html";
    });
  }
}

function renderFooter() {
  document.getElementById("footer").innerHTML =
    `<div class="container foot-inner">
       <span>&copy; ${new Date().getFullYear()} OpenLibrary. Built for learners.</span>
       <span>Free books for every reader.</span>
     </div>`;
}

// Every normal page calls this first.
async function startPage() {
  await renderNavbar();
  renderFooter();
}
