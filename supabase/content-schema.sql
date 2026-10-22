-- Authenticated readers only. Run with an admin connection or SQL Editor.
create table if not exists public.book_chapters (
  book_id text not null,
  chapter_index integer not null check (chapter_index >= 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (book_id, chapter_index)
);
alter table public.book_chapters enable row level security;
revoke all on public.book_chapters from public, anon, authenticated;
grant select on public.book_chapters to authenticated;
drop policy if exists "Signed-in readers" on public.book_chapters;
create policy "Signed-in readers" on public.book_chapters
for select to authenticated
using ((select auth.uid()) is not null and coalesce((select auth.jwt())->>'is_anonymous','false') <> 'true');
