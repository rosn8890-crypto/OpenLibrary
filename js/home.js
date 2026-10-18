/* home.js - Home page: search box, book shelf, latest books, "continue reading" */

async function initHome() {
  await startPage();

  // Search: send the visitor to the Categories page with the search word
  document.getElementById("searchForm").addEventListener("submit", event => {
    event.preventDefault();
    const word = document.getElementById("searchInput").value.trim();
    location.href = "categories.html?q=" + encodeURIComponent(word);
  });

  // Get the 12 newest approved books from the database
  const { data: books, error } = await db
    .from("books")
    .select(CARD_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(12);

  const grid = document.getElementById("bookGrid");
  if (error) {
    showMessage(grid, "Could not load books: " + error.message, "err");
    return;
  }
  if (books.length === 0) {
    grid.innerHTML = '<p class="empty">No books yet. Upload the first one from the Upload page.</p>';
  } else {
    document.getElementById("shelf").innerHTML = books.map(spineHtml).join("");
    grid.innerHTML = books.slice(0, 8).map(book => bookCard(book)).join("");
  }

  loadTopics();
  loadContinueReading();
}

// "Browse by topic": one picture tile for every category in the database.
// The picture file is images/topic-<slug>.svg. If a category has no picture yet, topic-default.svg is used.
async function loadTopics() {
  const { data } = await db.from("categories").select("name, slug").order("name");
  const grid = document.getElementById("topicGrid");
  if (!data || data.length === 0) { grid.parentElement.hidden = true; return; }
  grid.innerHTML = data.map(c => `
    <a class="topic" href="categories.html?slug=${encodeURIComponent(c.slug)}">
      <img src="images/topic-${encodeURIComponent(c.slug)}.svg" width="600" height="400" loading="lazy" alt=""
           onerror="this.onerror=null;this.src='images/topic-default.svg'">
      <span>${escapeHtml(c.name)}</span>
    </a>`).join("");
}

// Shows the books this user started but did not finish
async function loadContinueReading() {
  const user = await getUser();
  if (!user) return;

  const { data } = await db
    .from("reading_progress")
    .select(`progress_percent, books(${CARD_COLUMNS})`)
    .eq("user_id", user.id)
    .lt("progress_percent", 100)
    .order("last_read_at", { ascending: false })
    .limit(4);

  const rows = (data || []).filter(row => row.books);   // skip books that were removed
  if (rows.length === 0) return;

  document.getElementById("continueSection").hidden = false;
  document.getElementById("continueList").innerHTML =
    rows.map(row => bookCard(row.books, row.progress_percent)).join("");
}

initHome();
