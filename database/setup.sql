-- OpenLibrary database setup

-- Table: book categories
create table categories (
  id    serial primary key,
  name  text not null unique,
  slug  text not null unique
);

-- Table: every uploaded book (always a PDF)
create table books (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  author       text not null,
  description  text,
  category_id  int references categories(id) on delete set null,
  file_url     text not null,
  cover_url    text,
  uploaded_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- Table: which page each user reached in each book
create table reading_progress (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  book_id          uuid not null references books(id) on delete cascade,
  current_page     int not null default 1,
  scroll_percent   int not null default 0,
  progress_percent int not null default 0,
  last_read_at     timestamptz not null default now(),
  unique (user_id, book_id)
);

-- Table: favorite books (many-to-many between users and books)
create table favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  book_id     uuid not null references books(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- Turn on row-level security for every table
alter table categories       enable row level security;
alter table books            enable row level security;
alter table reading_progress enable row level security;
alter table favorites        enable row level security;

-- Policy: anyone can read categories and books
create policy "Anyone can read categories" on categories for select using (true);
create policy "Anyone can read books" on books for select using (true);

-- Policy: a user can only add/edit/delete their own book
create policy "Users add books" on books for insert to authenticated
  with check (uploaded_by = auth.uid());
create policy "Owners update own books" on books for update to authenticated
  using (uploaded_by = auth.uid()) with check (uploaded_by = auth.uid());
create policy "Owners delete own books" on books for delete to authenticated
  using (uploaded_by = auth.uid());

-- Policy: a user can only see/change their own progress and favorites
create policy "Own progress" on reading_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Own favorites" on favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Give the basic database roles permission to use the tables above
grant usage on schema public to anon, authenticated;
grant select on categories, books to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Storage bucket for PDF files and cover images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', true, 52428800,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

-- Policy: a user can only upload/delete files inside their own folder
create policy "Users upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'books' and (storage.foldername(name))[2] = auth.uid()::text);
create policy "Users delete own files" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[2] = auth.uid()::text);

-- Starting categories
insert into categories (name, slug) values
  ('Cybersecurity',    'cybersecurity'),
  ('Programming',      'programming'),
  ('Self-Improvement', 'self-improvement'),
  ('Science',          'science'),
  ('Exam Preparation', 'exam-preparation');

