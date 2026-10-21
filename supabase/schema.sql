-- Run once in Supabase SQL Editor for the Bookwise project.
-- User state is private; the browser can only read its own row.
create table if not exists public.user_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint user_states_object check (jsonb_typeof(state) = 'object')
);

alter table public.user_states enable row level security;
revoke all on table public.user_states from anon, authenticated;
grant select on table public.user_states to authenticated;

drop policy if exists "Read own state" on public.user_states;
create policy "Read own state"
on public.user_states for select to authenticated
using ((select auth.uid()) = user_id);

-- Compare-and-swap prevents an old browser tab from silently overwriting
-- newer state from another device. No user_id parameter is accepted.
create or replace function public.save_user_state(
  p_expected_revision bigint,
  p_state jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
begin
  if v_user_id is null then
    raise exception 'sign_in_required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'invalid_revision' using errcode = '22023';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 2097152 then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  update public.user_states
  set state = p_state, revision = revision + 1, updated_at = now()
  where user_id = v_user_id and revision = p_expected_revision
  returning revision into v_revision;

  if v_revision is null and p_expected_revision = 0 then
    insert into public.user_states (user_id, state, revision)
    values (v_user_id, p_state, 1)
    on conflict (user_id) do nothing
    returning revision into v_revision;
  end if;

  if v_revision is null then
    raise exception 'state_conflict' using errcode = 'P0001';
  end if;
  return v_revision;
end;
$$;

revoke all on function public.save_user_state(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_user_state(bigint, jsonb) to authenticated;
