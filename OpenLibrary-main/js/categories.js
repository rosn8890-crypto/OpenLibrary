/* categories.js - browse by category and search by title or author */

const params = new URLSearchParams(location.search);
let currentSlug = params.get("slug") || "All";
let currentQuery = params.get("q") || "";
let currentSort = params.get("sort") || "new";

// Each sort choice = which column to sort by, and which direction
const SORTS = {
  new:    { column: "created_at", ascending: false },
  old:    { column: "created_at", ascending: true },
  title:  { column: "title",      ascending: true },
  author: { column: "author",     ascending: true }
};
let allCategories = [];

async function initCategories() {
  await startPage();

  // 1) Load categories and draw the filter buttons
  const { data, error } = await db.from("categories").select("id, name, slug").order("name");
  if (error) {
    showMessage(document.getElementById("bookGrid"), "Could not load categories: " + error.message, "err");
    return;
  }
  allCategories = data;
  drawChips();

  // 2) Search form
  const input = document.getElementById("searchInput");
  input.value = currentQuery;
  document.getElementById("searchForm").addEventListener("submit", event => {
    event.preventDefault();
    currentQuery = input.value.trim();
    updateUrl();
    loadBooks();
  });

  const sortSelect = document.getElementById("sortSelect");
  if (!SORTS[currentSort]) currentSort = "new";
  sortSelect.value = currentSort;
  sortSelect.addEventListener("change", () => {
    currentSort = sortSelect.value;
    updateUrl();
    loadBooks();
  });

  loadBooks();
}

function drawChips() {
  const all = [{ name: "All", slug: "All" }, ...allCategories];
  const box = document.getElementById("chips");
  box.innerHTML = all.map(c =>
    `<button class="chip ${c.slug === currentSlug ? "active" : ""}" data-slug="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`
  ).join("");

  box.querySelectorAll(".chip").forEach(button => {
    button.addEventListener("click", () => {
      currentSlug = button.dataset.slug;
      drawChips();
      updateUrl();
      loadBooks();
    });
  });
}

// Keep the address bar in sync, so the page can be shared or refreshed
function updateUrl() {
  const p = new URLSearchParams();
  if (currentSlug !== "All") p.set("slug", currentSlug);
  if (currentQuery) p.set("q", currentQuery);
  if (currentSort !== "new") p.set("sort", currentSort);
  history.replaceState(null, "", "categories.html" + (p.toString() ? "?" + p : ""));
}

async function loadBooks() {
  const grid = document.getElementById("bookGrid");
  const count = document.getElementById("resultCount");
  grid.innerHTML = '<p class="empty">Loading books...</p>';

  let query = db.from("books").select(CARD_COLUMNS).order(SORTS[currentSort].column, { ascending: SORTS[currentSort].ascending });

  // Filter by category
  if (currentSlug !== "All") {
    const category = allCategories.find(c => c.slug === currentSlug);
    if (category) query = query.eq("category_id", category.id);
  }
  // Filter by search word (title OR author). We remove characters that would break the filter.
  const clean = currentQuery.replace(/[,()%*]/g, " ").trim();
  if (clean) query = query.or(`title.ilike.%${clean}%,author.ilike.%${clean}%`);

  const { data, error } = await query;
  if (error) {
    showMessage(grid, "Could not load books: " + error.message, "err");
    return;
  }
  count.textContent = data.length + (data.length === 1 ? " book found" : " books found");
  grid.innerHTML = data.length
    ? data.map(book => bookCard(book)).join("")
    : '<p class="empty">No books match. Try another word or category.</p>';
}

initCategories();
