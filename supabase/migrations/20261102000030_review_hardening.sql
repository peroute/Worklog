-- Review-flow hardening: close gaps a member could reach by calling the API directly.
-- Covered by supabase/tests/review_hardening.test.sql.
--
--   1. done_at is set by the database only; a client-supplied value is ignored.
--   2. Approved findings and tasks can no longer be deleted by their owner (lead still can).
--   3. An approved finding's screenshots are frozen for its author (rows + storage files).
--   4. Once a task has left "to do", only the lead can reassign it.
--
-- Deliberately does NOT redefine tasks_guard(): other migrations extend that function, and a
-- later `create or replace` would silently drop their rules. Rule 4 is a separate trigger instead.

-- ─── 1. done_at belongs to the database ───────────────────────────────────────
-- done_at = when the task was first finished; kept through review/approval, cleared on reopen.
create or replace function public.set_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'todo' then
    new.done_at := null;
  elsif auth.uid() is null then
    -- Admin path (SQL editor / service role / backfills): trust a supplied value.
    new.done_at := coalesce(new.done_at, now());
  elsif tg_op = 'INSERT' or old.status = 'todo' then
    new.done_at := now();                           -- just finished
  else
    new.done_at := coalesce(old.done_at, now());    -- still finished: keep the original stamp
  end if;
  return new;
end;
$$;

-- Previously `update of status` only, so an update touching just done_at skipped the trigger.
drop trigger tasks_set_done_at on public.tasks;
create trigger tasks_set_done_at
  before insert or update on public.tasks
  for each row execute function public.set_done_at();

-- ─── 2. Approved work cannot be deleted by its owner ──────────────────────────
drop policy "creator or lead can delete tasks" on public.tasks;
create policy "creator or lead can delete tasks" on public.tasks
  for delete to authenticated using (
    public.is_lead() or (created_by = auth.uid() and status <> 'approved')
  );

drop policy "author or lead can delete findings" on public.findings;
create policy "author or lead can delete findings" on public.findings
  for delete to authenticated using (
    public.is_lead() or (author_id = auth.uid() and status <> 'approved')
  );

-- ─── 3. Approved findings' screenshots are frozen for the author ──────────────
-- Same rule as findings_guard's content check: author until approved, lead always.
drop policy "author or lead can add finding images" on public.finding_images;
create policy "author or lead can add finding images" on public.finding_images
  for insert to authenticated with check (
    exists (select 1 from public.findings f
            where f.id = finding_id
              and (public.is_lead() or (f.author_id = auth.uid() and f.status <> 'approved')))
  );

drop policy "author or lead can remove finding images" on public.finding_images;
create policy "author or lead can remove finding images" on public.finding_images
  for delete to authenticated using (
    exists (select 1 from public.findings f
            where f.id = finding_id
              and (public.is_lead() or (f.author_id = auth.uid() and f.status <> 'approved')))
  );

drop policy "author or lead can reorder finding images" on public.finding_images;
create policy "author or lead can reorder finding images" on public.finding_images
  for update to authenticated using (
    exists (select 1 from public.findings f
            where f.id = finding_id
              and (public.is_lead() or (f.author_id = auth.uid() and f.status <> 'approved')))
  );

drop policy "author or lead can upload finding images" on storage.objects;
create policy "author or lead can upload finding images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'finding-images'
    and (storage.foldername(name))[1] = 'findings'
    and exists (
      select 1 from public.findings f
      where f.id::text = (storage.foldername(name))[2]
        and (public.is_lead() or (f.author_id = auth.uid() and f.status <> 'approved'))
    )
  );

-- Orphan cleanup is unchanged: once the finding row is gone, anyone may remove its files.
drop policy "author, lead, or orphan cleanup can delete finding images" on storage.objects;
create policy "author, lead, or orphan cleanup can delete finding images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'finding-images'
    and (
      public.is_lead()
      or exists (
        select 1 from public.findings f
        where f.id::text = (storage.foldername(name))[2]
          and f.author_id = auth.uid() and f.status <> 'approved'
      )
      or not exists (
        select 1 from public.findings f
        where f.id::text = (storage.foldername(name))[2]
      )
    )
  );

-- ─── 4. Only the lead reassigns a task once it has left "to do" ───────────────
-- Runs after tasks_guard (same timing, alphabetical), so the usual edit rules apply first.
create function public.tasks_reassign_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and old.status <> 'todo' and not public.is_lead() then
    raise exception 'only the lead can reassign a task under review' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tasks_reassign_guard
  before update of assigned_to on public.tasks
  for each row
  when (new.assigned_to is distinct from old.assigned_to)
  execute function public.tasks_reassign_guard();
