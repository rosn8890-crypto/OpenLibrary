# OpenLibrary — Simple ER Diagram (4 tables)

```mermaid
erDiagram
    CATEGORIES ||--o{ BOOKS : "has many"
    USERS ||--o{ BOOKS : "uploads"
    USERS ||--o{ READING_PROGRESS : "has"
    BOOKS ||--o{ READING_PROGRESS : "tracked in"
    USERS ||--o{ FAVORITES : "has"
    BOOKS ||--o{ FAVORITES : "saved in"

    CATEGORIES {
        int id PK
        text name
        text slug
    }

    USERS {
        uuid id PK
        text email
    }

    BOOKS {
        uuid id PK
        text title
        text author
        text description
        int category_id FK
        text file_url "the PDF (required)"
        text cover_url
        uuid uploaded_by FK
        timestamp created_at
    }

    READING_PROGRESS {
        uuid id PK
        uuid user_id FK
        uuid book_id FK
        int current_page
        int scroll_percent
        int progress_percent
        timestamp last_read_at
    }

    FAVORITES {
        uuid user_id PK,FK
        uuid book_id PK,FK
        timestamp created_at
    }
```

**How to read it:** `USERS` is Supabase's own login table (`auth.users`) — you never create or edit it.

- One **category** has many **books** (Cybersecurity → many books). One-to-many.
- One **user** uploads many **books**. One-to-many.
- **READING_PROGRESS** connects a user and a book with *extra data* (page, percent). One-to-many from both sides through this table.
- **FAVORITES** is a pure many-to-many link: one user can favorite many books, one book can be favorited by many users. Its primary key is the pair `(user_id, book_id)`, so it needs no separate `id` column.
