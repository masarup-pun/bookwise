-- Run after importing content, in SQL Editor as postgres. No permanent changes.
begin;
set local role anon;
do $$
begin
  begin
    perform 1 from public.book_chapters limit 1;
    raise exception 'FAIL: signed-out visitors can read chapter content';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
do $$
begin
  if not exists(select 1 from public.book_chapters) then
    raise exception 'FAIL: signed-in reader cannot read imported content';
  end if;
end $$;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":true}',true);
do $$
begin
  if exists(select 1 from public.book_chapters) then
    raise exception 'FAIL: anonymous Auth users can bypass the login requirement';
  end if;
end $$;
reset role;
select count(*) as imported_chapters,
  not has_table_privilege('anon','public.book_chapters','select') as guest_blocked,
  not has_table_privilege('authenticated','public.book_chapters','insert,update,delete') as reader_writes_blocked,
  (select relrowsecurity from pg_class where oid='public.book_chapters'::regclass) as rls_enabled
from public.book_chapters;
rollback;
