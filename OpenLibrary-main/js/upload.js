/* upload.js - add a book. It is saved in the database and appears in the library at once. */

const form = document.getElementById("uploadForm");
const msgBox = document.getElementById("uploadMsg");
const submitBtn = document.getElementById("submitBtn");

async function initUpload() {
  await startPage();
  const user = await requireLogin();
  if (!user) return;

  // Fill the category drop-down from the database
  const cats = await db.from("categories").select("id, name").order("name");
  document.getElementById("category").innerHTML =
    (cats.data || []).map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  form.addEventListener("submit", handleSubmit);
}

// Upload one file to Supabase Storage and return its public link
async function uploadToStorage(file, folder, userId) {
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${userId}/${Date.now()}-${cleanName}`;   // folder must contain the user id (storage rule)
  // The file is sent as it is (no resizing, no compression), so the quality never decreases.
  const { error } = await db.storage.from("books").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",   // browsers may keep the file for a year, so it loads fast next time
    upsert: false
  });
  if (error) throw error;
  return db.storage.from("books").getPublicUrl(path).data.publicUrl;
}

async function handleSubmit(event) {
  event.preventDefault();
  msgBox.innerHTML = "";
  const user = await requireLogin();
  if (!user) return;

  const f = form.elements;
  const pdfFile = f.pdfFile.files[0];
  const coverFile = f.coverFile.files[0];

  // ---- Validation (checks before we send anything) ----
  if (!pdfFile) return showMessage(msgBox, "Please choose a PDF file.", "err");
  if (pdfFile.type !== "application/pdf") return showMessage(msgBox, "The book file must be a PDF.", "err");
  if (pdfFile.size > 50 * 1024 * 1024) return showMessage(msgBox, "The PDF is larger than 50 MB.", "err");
  if (coverFile && (!coverFile.type.startsWith("image/") || coverFile.size > 5 * 1024 * 1024)) {
    return showMessage(msgBox, "The cover must be an image smaller than 5 MB.", "err");
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Uploading...";

  try {
    // ---- Step 1: upload files ----
    const fileUrl = await uploadToStorage(pdfFile, "pdfs", user.id);
    const coverUrl = coverFile ? await uploadToStorage(coverFile, "covers", user.id) : null;

    // ---- Step 2: save the book row ----
    const { error } = await db.from("books").insert({
      title: f.title.value.trim(),
      author: f.author.value.trim(),
      description: f.description.value.trim(),
      category_id: Number(f.category.value),
      file_url: fileUrl,
      cover_url: coverUrl,
      uploaded_by: user.id
    });
    if (error) throw error;

    form.reset();
    showMessage(msgBox, "Done! Your book is now in the library.", "ok");
  } catch (err) {
    showMessage(msgBox, "Upload failed: " + err.message, "err");
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Upload book";
}

initUpload();
