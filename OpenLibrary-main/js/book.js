/* book.js - Book details page: info, read button, favorite button */

const bookId = new URLSearchParams(location.search).get("id");
let isFavorite = false;

async function initBook() {
  await startPage();
  const box = document.getElementById("bookBox");
  if (!bookId) { showMessage(box, "No book selected.", "err"); return; }

  // 1) Load this book (without the heavy text content)
  const { data: book, error } = await db
    .from("books")
    .select("id, title, author, description, cover_url, file_url, categories(name, slug)")
    .eq("id", bookId)
    .maybeSingle();

  if (error || !book) { showMessage(box, "This book was not found.", "err"); return; }

  // 2) If the user is logged in: did he start this book? Is it in his favorites?
  const user = await getUser();
  let progress = null;
  if (user) {
    const [p, f] = await Promise.all([
      db.from("reading_progress").select("current_page, progress_percent").eq("user_id", user.id).eq("book_id", bookId).maybeSingle(),
      db.from("favorites").select("book_id").eq("user_id", user.id).eq("book_id", bookId).maybeSingle()
    ]);
    progress = p.data;
    isFavorite = !!f.data;
  }

  document.title = book.title + " - OpenLibrary";
  const category = book.categories ? book.categories.name : "General";
  const readLabel = progress ? `Continue reading (page ${progress.current_page})` : "Start reading";

  // A button to download the ORIGINAL PDF (full HD quality, exactly as uploaded)
  const downloadBtn = `<a class="btn btn-outline" href="${escapeHtml(safeUrl(book.file_url))}?download=${encodeURIComponent(book.title + ".pdf")}">Download original PDF</a>`;

  // 3) Draw the page
  box.innerHTML = `
    <div class="detail">
      <div>${coverHtml(book)}</div>
      <div>
        <p class="meta">${escapeHtml(category)}</p>
        <h1>${escapeHtml(book.title)}</h1>
        <p class="author">by ${escapeHtml(book.author)}</p>
        <p class="desc">${escapeHtml(book.description || "No description yet.")}</p>
        ${progress ? `<div class="bar"><span style="width:${progress.progress_percent}%"></span></div>` : ""}
        <div class="actions">
          <a class="btn" href="reader.html?id=${book.id}">${readLabel}</a>
          <button class="btn btn-outline" id="favBtn"></button>
          ${downloadBtn}
        </div>
      </div>
    </div>`;

  drawFavoriteButton();
  document.getElementById("favBtn").addEventListener("click", toggleFavorite);
}

function drawFavoriteButton() {
  document.getElementById("favBtn").textContent = isFavorite ? "Remove from favorites" : "Add to favorites";
}

// One row in the "favorites" table = one favorite book of one user
async function toggleFavorite() {
  const user = await requireLogin();
  if (!user) return;

  const { error } = isFavorite
    ? await db.from("favorites").delete().eq("user_id", user.id).eq("book_id", bookId)
    : await db.from("favorites").insert({ user_id: user.id, book_id: bookId });

  if (error) { showToast(error.message); return; }
  isFavorite = !isFavorite;
  drawFavoriteButton();
  showToast(isFavorite ? "Added to favorites" : "Removed from favorites");
}

initBook();
