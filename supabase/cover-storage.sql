-- Configure private book cover storage. Safe to re-run.
begin;
-- Private cover images are stored separately from the small JSON sync state.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Read own book covers" on storage.objects;
create policy "Read own book covers"
on storage.objects for select to authenticated
using (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Upload own book covers" on storage.objects;
create policy "Upload own book covers"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Update own book covers" on storage.objects;
create policy "Update own book covers"
on storage.objects for update to authenticated
using (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Delete own book covers" on storage.objects;
create policy "Delete own book covers"
on storage.objects for delete to authenticated
using (
  bucket_id = 'book-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;

select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'book-covers';
select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like '%own book covers';
