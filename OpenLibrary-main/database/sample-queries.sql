-- =====================================================================
-- OpenLibrary - database/sample-queries.sql
-- Just 3 ready-to-run SQL queries on the OpenLibrary database, matching
-- the topics taught in class: JOIN, GROUP BY, and aggregate functions
-- (COUNT, AVG). Good to show in your viva as real queries that work on
-- your own project's data.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste ONE query at a
-- time (not the whole file) -> Run, so you can see each result on its own.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Query 1: JOIN
-- Topic: combining two tables that are linked by a foreign key.
-- Every book's category_id points to a row in categories; JOIN brings
-- the category's name onto the same row as the book, instead of just
-- showing a number.
-- ---------------------------------------------------------------------
SELECT books.title, books.author, categories.name AS category
FROM books
JOIN categories ON books.category_id = categories.id
ORDER BY categories.name, books.title;


-- ---------------------------------------------------------------------
-- Query 2: GROUP BY + COUNT
-- Topic: combining rows that share the same value, then counting them -
-- the same pattern as "find the total number of students in each class".
-- Here, one row per category, with how many books are in it.
-- ---------------------------------------------------------------------
SELECT categories.name AS category, COUNT(books.id) AS total_books
FROM categories
LEFT JOIN books ON books.category_id = categories.id
GROUP BY categories.name
ORDER BY total_books DESC;


-- ---------------------------------------------------------------------
-- Query 3: GROUP BY + AVG, across two tables
-- Topic: the same GROUP BY + aggregate idea as Query 2, but the number
-- being averaged (progress_percent) lives in a DIFFERENT table
-- (reading_progress), reached through a JOIN - same pattern as
-- "find the average marks of each student", with books instead of students.
-- ---------------------------------------------------------------------
SELECT books.title, ROUND(AVG(reading_progress.progress_percent)) AS avg_percent_read
FROM books
JOIN reading_progress ON reading_progress.book_id = books.id
GROUP BY books.title
ORDER BY avg_percent_read DESC;
