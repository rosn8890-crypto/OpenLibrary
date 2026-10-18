/* favorites.js - Favorites page: the books this user saved (table "favorites") */

let currentUser = null;

async function initFavorites() {
  await startPage();
  currentUser = await requireLogin();
  if (!currentUser) return;

  document.getElementById("favBox").addEventListener("click", handleRemove);
  loadFavorites();
}

async function loadFavorites() {
  const box = document.getElementById("favBox");

  // favorites -> books -> categories  (JOIN)
  const { data, error } = await db
    .from("favorites")
    .select(`created_at, books(${CARD_COLUMNS})`)
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) { showMessage(box, "Could not load favorites: " + error.message, "err"); return; }

  const rows = data.filter(row => row.books);
  if (rows.length === 0) {
    box.innerHTML = '<p class="empty">No favorites yet. Open a book and press "Add to favorites".</p>';
    return;
  }
  box.innerHTML = `<div class="grid">${rows.map(row => `
    <div class="fav-item">
      ${bookCard(row.books)}
      <button class="btn btn-outline btn-sm" data-book="${row.books.id}">Remove</button>
    </div>`).join("")}</div>`;
}

async function handleRemove(event) {
  const button = event.target.closest("button[data-book]");
  if (!button) return;
  await db.from("favorites").delete().eq("user_id", currentUser.id).eq("book_id", button.dataset.book);
  loadFavorites();
}

initFavorites();
