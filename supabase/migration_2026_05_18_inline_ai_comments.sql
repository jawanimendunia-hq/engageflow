-- =============================================================
-- Migration 2026-05-18: Inline AI-generated comments di assignments
-- Tujuan: komentar hasil AI Meta Import tidak perlu disimpan ke
-- table `comments` lagi (menghemat storage Supabase).
--
-- Strategi:
--  - comment_id jadi nullable
--  - tambah comment_text + comment_tone untuk inline storage
--  - constraint: minimal salah satu (comment_id ATAU comment_text) harus terisi
--
-- Komentar lama di table `comments` TIDAK dihapus — masih dipakai
-- untuk Generate Assignment manual (non-AI flow).
--
-- Jalankan di Supabase SQL Editor.
-- =============================================================

-- 1) Tambah kolom inline
alter table public.assignments
  add column if not exists comment_text text,
  add column if not exists comment_tone text;

-- 2) Buat comment_id nullable
alter table public.assignments
  alter column comment_id drop not null;

-- 3) Drop unique constraint (link_id, comment_id) — sekarang komentar inline
--    bisa duplikat reference (tapi text berbeda). Validasi uniqueness pindah ke app layer.
alter table public.assignments
  drop constraint if exists assignments_link_id_comment_id_key;

-- 4) Constraint: minimal salah satu harus terisi (comment_id ATAU comment_text)
alter table public.assignments
  drop constraint if exists assignments_comment_source_check;
alter table public.assignments
  add constraint assignments_comment_source_check
  check (comment_id is not null or (comment_text is not null and length(comment_text) > 0));
