-- Flat team: soft delete (docs/superpowers/specs/2026-11-03-flat-team-design.md §6).
-- Nobody can really delete projects, tasks, findings, images or attachments (there are no delete
-- policies). "Delete" means setting deleted_at; the app reads the live_* views, which hide those rows.
-- NOTE: the live_* views and project_summaries freeze `t.*` at creation time. Adding a column to
-- tasks, findings or projects later means recreating those views too.
-- Restoring is setting deleted_at back to null. Files in Storage are always kept.
-- findings_guard() / tasks_guard() are NOT touched here: the "deleted items can't change status" rule
-- is its own trigger, so the guard functions keep a single definition.

-- ─── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.projects         add column deleted_at timestamptz, add column deleted_by uuid references public.profiles (id);
alter table public.tasks            add column deleted_at timestamptz, add column deleted_by uuid references public.profiles (id);
alter table public.findings         add column deleted_at timestamptz, add column deleted_by uuid references public.profiles (id);
alter table public.finding_images   add column deleted_at timestamptz, add column deleted_by uuid references public.profiles (id);
alter table public.task_attachments add column deleted_at timestamptz, add column deleted_by uuid references public.profiles (id);

-- ─── 2. Stamp: who deleted it and when, decided by the database ───────────────
-- Clients only say "deleted" (non-null) or "restored" (null); the real timestamp and user are ours.
-- On INSERT both are forced to null, so a new row can't be born with a forged delete stamp.
-- auth.uid() is null (SQL editor / service role) bypasses, like the other guards.
create function public.stamp_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.deleted_at := null;
    new.deleted_by := null;
  elsif old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  else
    -- Not a delete or a restore: whatever the client sent, the stamp stays as it was.
    new.deleted_at := old.deleted_at;
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

create trigger stamp_deleted before insert or update on public.projects
  for each row execute function public.stamp_deleted();
create trigger stamp_deleted before insert or update on public.tasks
  for each row execute function public.stamp_deleted();
create trigger stamp_deleted before insert or update on public.findings
  for each row execute function public.stamp_deleted();
create trigger stamp_deleted before insert or update on public.finding_images
  for each row execute function public.stamp_deleted();
create trigger stamp_deleted before insert or update on public.task_attachments
  for each row execute function public.stamp_deleted();

-- ─── 3. A deleted task / finding can't change status ──────────────────────────
-- Restore it first. Separate from the status guards on purpose (see header).
create function public.refuse_if_deleted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and old.deleted_at is not null
     and new.status is distinct from old.status then
    raise exception 'item is deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger refuse_if_deleted before update on public.tasks
  for each row execute function public.refuse_if_deleted();
create trigger refuse_if_deleted before update on public.findings
  for each row execute function public.refuse_if_deleted();

-- ─── 4. Project names: unique among live projects only ────────────────────────
alter table public.projects drop constraint projects_name_key;
create unique index projects_name_live_key on public.projects (name) where deleted_at is null;

-- ─── 5. Caps count live rows only ─────────────────────────────────────────────
-- Run on insert, and when a deleted row is restored (deleted -> live), so restoring can't push
-- past 10. The parent row is locked first so two parallel inserts can't both see room.
create or replace function public.task_attachments_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (old.deleted_at is not null and new.deleted_at is null) then
    return new;
  end if;
  perform 1 from public.tasks where id = new.task_id for update;
  if (select count(*) from public.task_attachments
      where task_id = new.task_id and deleted_at is null and id <> new.id) >= 10 then
    raise exception 'a task can have at most 10 attachments' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger task_attachments_limit on public.task_attachments;
create trigger task_attachments_limit
  before insert or update of deleted_at on public.task_attachments
  for each row execute function public.task_attachments_limit();

create function public.finding_images_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (old.deleted_at is not null and new.deleted_at is null) then
    return new;
  end if;
  perform 1 from public.findings where id = new.finding_id for update;
  if (select count(*) from public.finding_images
      where finding_id = new.finding_id and deleted_at is null and id <> new.id) >= 10 then
    raise exception 'a finding can have at most 10 images' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger finding_images_limit
  before insert or update of deleted_at on public.finding_images
  for each row execute function public.finding_images_limit();

-- ─── 5b. No hard deletes, not even by accident ────────────────────────────────
-- No delete policies exist, but the table privilege is a second lock. TRUNCATE ignores RLS entirely.
revoke delete, truncate on public.projects, public.tasks, public.findings,
  public.finding_images, public.task_attachments from authenticated;
revoke truncate on public.comments, public.task_checklist_items from authenticated;

-- ─── 5c. New images / attachments need a live parent ──────────────────────────
drop policy "team can add finding images" on public.finding_images;
create policy "team can add finding images" on public.finding_images
  for insert to authenticated
  with check (exists (
    select 1 from public.findings f where f.id = finding_id and f.deleted_at is null));

drop policy "team can attach files as themselves" on public.task_attachments;
create policy "team can attach files as themselves" on public.task_attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid() and exists (
    select 1 from public.tasks t where t.id = task_id and t.deleted_at is null));

-- ─── 6. Live views ────────────────────────────────────────────────────────────
-- Plain "select t.* from t where ..." so PostgREST can still embed related tables through them.
-- security_invoker: the caller's own permissions apply, not the view owner's.
create view public.live_projects
with (security_invoker = on)
as
select p.* from public.projects p where p.deleted_at is null;

create view public.live_tasks
with (security_invoker = on)
as
select t.* from public.tasks t
where t.deleted_at is null
  and not exists (
    select 1 from public.projects p where p.id = t.project_id and p.deleted_at is not null
  );

create view public.live_findings
with (security_invoker = on)
as
select f.* from public.findings f
where f.deleted_at is null
  and not exists (
    select 1 from public.projects p where p.id = f.project_id and p.deleted_at is not null
  );

-- Project list counts, now over live rows only.
drop view public.project_summaries;
create view public.project_summaries
with (security_invoker = on)
as
select
  p.*,
  (select count(*) from public.live_findings f where f.project_id = p.id and f.status not in ('not_a_bug', 'verified'))::int as open_findings,
  (select count(*) from public.live_tasks t where t.project_id = p.id and t.status <> 'done')::int as open_tasks
from public.live_projects p;

revoke all on public.live_projects, public.live_tasks, public.live_findings, public.project_summaries from anon;
grant select on public.live_projects, public.live_tasks, public.live_findings, public.project_summaries to authenticated;

-- ─── 7. Comments only on live items ───────────────────────────────────────────
drop policy "team can comment as themselves" on public.comments;
create policy "team can comment on live items as themselves" on public.comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (finding_id is not null and exists (
        select 1 from public.findings f where f.id = finding_id and f.deleted_at is null))
      or
      (task_id is not null and exists (
        select 1 from public.tasks t where t.id = task_id and t.deleted_at is null))
    )
  );

-- ─── 8. Storage: upload needs an existing, live parent; still no delete policies ──
drop policy "team can upload finding images" on storage.objects;
create policy "team can upload finding images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'finding-images'
    and (storage.foldername(name))[1] = 'findings'
    and exists (
      select 1 from public.findings f
      where f.id::text = (storage.foldername(name))[2] and f.deleted_at is null
    )
  );

drop policy "team can upload task attachments" on storage.objects;
create policy "team can upload task attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'tasks'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2] and t.deleted_at is null
    )
  );
