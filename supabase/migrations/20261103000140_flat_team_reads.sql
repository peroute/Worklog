-- Flat team: NEW markers (docs/superpowers/specs/2026-11-03-flat-team-design.md §8).
-- Remembers, per person, when they last opened each task / finding, so the UI can mark items where
-- someone else has done something since.
--
-- "Someone else" = actor_id is distinct from me (so admin activity, actor null, counts as someone else)
-- and comment author <> me. An item I never opened is NEW iff someone else has activity / comments on
-- it; every created item has a 'created' activity row, so "created by someone else" is covered too.

-- ─── 1. Table ─────────────────────────────────────────────────────────────────
create table public.item_reads (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_type    text not null check (item_type in ('task', 'finding')),
  item_id      uuid not null,
  last_seen_at timestamptz not null,
  primary key (user_id, item_type, item_id)
);

alter table public.item_reads enable row level security;
create policy "read my own reads" on public.item_reads
  for select to authenticated using (user_id = auth.uid());
create policy "insert my own reads" on public.item_reads
  for insert to authenticated with check (user_id = auth.uid());
create policy "update my own reads" on public.item_reads
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No delete policy, and no delete privilege either (second lock).
revoke all on public.item_reads from anon, authenticated;
grant select, insert, update on public.item_reads to authenticated;

-- ─── 2. mark_seen: "I just opened this item" ──────────────────────────────────
-- Upsert. An invalid p_type is rejected by the table's check constraint.
-- An invalid p_type is refused; an id that matches no task / finding is silently ignored (no junk rows).
create function public.mark_seen(p_type text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_type is null or p_type not in ('task', 'finding') then
    raise exception 'invalid item type: %', p_type using errcode = '23514';
  end if;
  insert into public.item_reads (user_id, item_type, item_id, last_seen_at)
  select auth.uid(), p_type, p_id, now()
   where (p_type = 'task' and exists (select 1 from public.tasks where id = p_id))
      or (p_type = 'finding' and exists (select 1 from public.findings where id = p_id))
  on conflict (user_id, item_type, item_id) do update set last_seen_at = now();
end;
$$;

-- ─── 2b. Comment timestamps are server-controlled ─────────────────────────────
-- unseen_items trusts comments.created_at, so a signed-in user must not be able to forge it (a future
-- date would make an item NEW forever, a past one would hide a comment). Admin (auth.uid() null) is exempt.
create function public.comments_stamp_created_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger comments_stamp_created_at before insert or update on public.comments
  for each row execute function public.comments_stamp_created_at();

-- ─── 3. unseen_items: live items where someone else acted after I last looked ─
create function public.unseen_items()
returns table (item_type text, item_id uuid, latest_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  with events as (
    select 'task'::text as item_type, a.task_id as item_id, a.created_at as at
      from public.activity a
     where a.task_id is not null and a.actor_id is distinct from auth.uid()
    union all
    select 'finding', a.finding_id, a.created_at
      from public.activity a
     where a.finding_id is not null and a.actor_id is distinct from auth.uid()
    union all
    select 'task', c.task_id, c.created_at
      from public.comments c
     where c.task_id is not null and c.author_id <> auth.uid()
    union all
    select 'finding', c.finding_id, c.created_at
      from public.comments c
     where c.finding_id is not null and c.author_id <> auth.uid()
  ),
  live as (
    select 'task'::text as item_type, t.id as item_id from public.live_tasks t
    union all
    select 'finding', f.id from public.live_findings f
  )
  select l.item_type, l.item_id, max(e.at) as latest_at
    from live l
    join events e on e.item_type = l.item_type and e.item_id = l.item_id
    left join public.item_reads r
      on r.user_id = auth.uid() and r.item_type = l.item_type and r.item_id = l.item_id
   where e.at > coalesce(r.last_seen_at, '-infinity'::timestamptz)
   group by l.item_type, l.item_id;
$$;

revoke execute on function public.mark_seen(text, uuid) from public, anon;
revoke execute on function public.unseen_items() from public, anon;
grant execute on function public.mark_seen(text, uuid) to authenticated;
grant execute on function public.unseen_items() to authenticated;

-- ─── 4. Backfill ──────────────────────────────────────────────────────────────
-- Everything that exists today counts as already seen by everyone, so nobody opens the app to a wall
-- of NEW badges. Only things that happen after this migration light up.
insert into public.item_reads (user_id, item_type, item_id, last_seen_at)
select p.id, 'task', t.id, now() from public.profiles p cross join public.tasks t
union all
select p.id, 'finding', f.id, now() from public.profiles p cross join public.findings f;
