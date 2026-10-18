/* dashboard.js - reading statistics, progress of each book, and my uploads */

async function initDashboard() {
  await startPage();
  const user = await requireLogin();
  if (!user) return;

  // 1) All books this user has started (JOIN with the books table)
  const { data, error } = await db
    .from("reading_progress")
    .select(`current_page, progress_percent, last_read_at, books(${CARD_COLUMNS})`)
    .eq("user_id", user.id)
    .order("last_read_at", { ascending: false });

  if (error) {
    showMessage(document.getElementById("readingNow"), "Could not load your progress: " + error.message, "err");
    return;
  }
  const rows = data.filter(row => row.books);
  const inProgress = rows.filter(row => row.progress_percent < 100);
  const finished = rows.filter(row => row.progress_percent >= 100);
  const average = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.progress_percent, 0) / rows.length) : 0;

  // 2) Numbers at the top
  document.getElementById("statStarted").textContent = rows.length;
  document.getElementById("statFinished").textContent = finished.length;
  document.getElementById("statAverage").textContent = average + "%";

  // 3) Lists of books
  document.getElementById("readingNow").innerHTML = inProgress.length
    ? inProgress.map(progressRow).join("")
    : '<p class="empty">Nothing in progress. <a href="categories.html"><u>Pick a book</u></a> and start reading.</p>';
  document.getElementById("finishedList").innerHTML = finished.length
    ? finished.map(progressRow).join("")
    : '<p class="empty">No finished books yet.</p>';

  loadMyUploads(user);
}

function progressRow(row) {
  const book = row.books;
  return `<div class="progress-row">
            <div>
              <a href="book.html?id=${book.id}"><strong>${escapeHtml(book.title)}</strong></a>
              <div class="author">${escapeHtml(book.author)}</div>
            </div>
            <div>
              <div class="bar"><span style="width:${row.progress_percent}%"></span></div>
              <small>Page ${row.current_page}, ${row.progress_percent}% read</small>
            </div>
            <a class="btn btn-sm" href="reader.html?id=${book.id}">${row.progress_percent >= 100 ? "Read again" : "Continue"}</a>
          </div>`;
}

// Books uploaded by this user. There is no admin, so the owner can delete his own book.
let currentUser = null;

async function loadMyUploads(user) {
  currentUser = user;
  const box = document.getElementById("myUploads");
  const { data, error } = await db.from("books").select("id, title, created_at")
    .eq("uploaded_by", user.id).order("created_at", { ascending: false });

  if (error) { showMessage(box, error.message, "err"); return; }
  if (data.length === 0) {
    box.innerHTML = '<p class="empty">You have not uploaded any books. <a href="upload.html"><u>Upload one</u></a>.</p>';
    return;
  }
  box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Title</th><th>Date</th><th></th></tr></thead>
      <tbody>${data.map(book => `<tr>
        <td><a href="book.html?id=${book.id}">${escapeHtml(book.title)}</a></td>
        <td>${new Date(book.created_at).toLocaleDateString()}</td>
        <td><button class="btn btn-danger btn-sm" data-book="${book.id}">Delete</button></td></tr>`).join("")}
      </tbody></table></div>`;
}

async function handleUploadClick(event) {
  const button = event.target.closest("button[data-book]");
  if (!button) return;
  if (!confirm("Delete this book for everyone?")) return;
  const { error } = await db.from("books").delete().eq("id", button.dataset.book);
  if (error) { showToast(error.message); return; }
  showToast("Book deleted");
  loadMyUploads(currentUser);
}

document.getElementById("myUploads").addEventListener("click", handleUploadClick);
initDashboard();
