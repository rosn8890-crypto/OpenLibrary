# 📚 OpenLibrary

**A free e-book library and sharing website, built for college students.**

OpenLibrary is a database-driven web application where students can upload study material and books as PDFs, and other students can browse, search, read, and download them — all organized, searchable, and free. It was built as a Database Management System mini project, with the real focus on designing a correct, well-structured relational database rather than piling on features.

---

## ✨ What it does

| Feature | What it means |
|---|---|
| **Sign Up / Login / Logout** | Secure email + password accounts, handled by Supabase Auth |
| **Browse & Search** | Filter by category, search by title or author, sort by newest, oldest, title, or author |
| **Upload a Book** | Share a PDF (up to 50 MB) with a title, author, description, category, and optional cover |
| **Book Details** | A dedicated page per book with its description, category, and actions |
| **Read & Download** | An in-browser HD PDF reader — zoom by button, touchpad pinch, or touchscreen pinch, 3 reading themes, and a one-click download of the original file |
| **Reading Progress** | The last page you read is saved automatically and restored the next time you open that book |
| **Favorites** | Save any book to a personal list and remove it later |
| **Dashboard** | See your reading stats (books started, finished, average progress) and manage your own uploads |
| **Delete Own Upload** | Only the person who uploaded a book can delete it |

Every file is kept exactly as uploaded — no compression, no quality loss — so study material stays sharp and readable.

---

## 🧱 How it's built

OpenLibrary has **no custom backend server**. The browser talks directly to **Supabase**, a Backend-as-a-Service platform, which provides:

- a **PostgreSQL database** for all structured data,
- **Authentication** for sign up / login,
- and **Storage** for the actual PDF and cover image files.

| Layer | Technology |
|---|---|
| Frontend | Plain HTML5, CSS3, and vanilla JavaScript — no framework |
| In-browser reading | PDF.js, rendering every page in HD on a canvas |
| Database & Auth & Storage | Supabase (built on PostgreSQL) |
| Hosting | GitHub Pages (website) + Supabase Cloud (database) |

```
Browser  →  Supabase JS Client  →  Supabase (Auth / REST API / Storage)  →  PostgreSQL
```

---

## 🗄️ Database design

The entire project runs on **4 tables**, connected to Supabase's own built-in login table:

```
categories  →  books  ←  reading_progress / favorites  ←  auth.users
```

- **categories** — the subjects books are grouped under (Programming, Cybersecurity, Exam Preparation, …)
- **books** — every uploaded book: title, author, category, file link, uploader
- **reading_progress** — each user's last page and percent read, per book (a many-to-many relationship *with* attributes)
- **favorites** — which books each user has saved (a pure many-to-many relationship)

Every table uses proper **primary keys**, **foreign keys**, and **integrity constraints**, and the schema is already normalized through **1NF, 2NF, 3NF, and BCNF** — nothing is repeated that doesn't need to be. Access control is enforced *inside the database itself* with PostgreSQL **Row Level Security**: a user can only edit or delete the rows they own, no matter how the request is made.

---

## 🔍 A peek at the SQL behind it

The live website never writes raw SQL — it calls the Supabase JS client (e.g. `books.insert(...)`), which Supabase translates into real SQL on PostgreSQL. A few examples of what that looks like underneath:

```sql
-- Every book, with its category name joined in
select books.title, books.author, categories.name as category
from books
join categories on books.category_id = categories.id;

-- How many books are in each category
select categories.name, count(books.id) as total_books
from categories
left join books on books.category_id = categories.id
group by categories.name;
```

---

## 🎯 Why this project exists

Most students share study material through WhatsApp groups, Telegram channels, or random Google Drive links. These work for a day or two, then the material gets buried, loses quality from repeated forwarding, and nobody can search through it. OpenLibrary replaces that with one organized, searchable library — backed by a real relational database instead of scattered messages.

---

## 🔭 Future scope

- Ratings and comments on books
- A lightweight "report this book" and review flow
- Full-text search instead of simple keyword matching
- Support for more file formats (e.g. EPUB)
- Recommendations based on reading history and favorites
