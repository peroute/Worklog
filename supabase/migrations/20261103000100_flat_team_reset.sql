-- Flat team cutover (docs/superpowers/specs/2026-11-03-flat-team-design.md §3, §4, §10).
-- Everyone on the team has the same rights. This migration:
--   * throws away every role-based rule (policies, guard triggers/functions, is_lead(), profiles.role);
--   * maps existing statuses onto the new lifecycles and adds the columns the new rules need;
--   * recreates plain policies: read everything, create things only as yourself, edit anything.
-- It deliberately does NOT patch the old guards one by one (several migrations redefined them).
-- Transition guards, soft delete, history and read markers arrive in later migrations, so until
-- those land the database is intentionally permissive.

-- ─── 1. Drop every policy ─────────────────────────────────────────────────────
-- Done first because policies depend on the helper functions dropped below.
-- Loop over pg_policies so none of the earlier migrations' policy names must be listed by hand.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
       or (
         schemaname = 'storage' and tablename = 'objects'
         and (
           coalesce(qual, '') ~ '(finding-images|task-attachments)'
           or coalesce(with_check, '') ~ '(finding-images|task-attachments)'
         )
       )
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- ─── 2. Drop the old guard triggers and functions ─────────────────────────────
drop trigger findings_guard on public.findings;
drop trigger tasks_guard on public.tasks;
drop trigger tasks_reassign_guard on public.tasks;
drop trigger task_checklist_items_guard on public.task_checklist_items;

drop function public.findings_guard();
drop function public.tasks_guard();
drop function public.tasks_reassign_guard();
drop function public.task_checklist_items_guard();
drop function public.can_attach_to_task(text);
drop function public.request_changes_finding(uuid, text);
drop function public.request_changes_task(uuid, text);
drop function public.in_request_changes();

-- ─── 3. Roles are gone ────────────────────────────────────────────────────────
drop function public.is_lead();
alter table public.profiles drop column role;

-- ─── 4. New columns ───────────────────────────────────────────────────────────
-- findings.fixed_by: who moved the finding to "fixed" (a later migration sets it; no self-verify).
alter table public.findings add column fixed_by uuid references public.profiles (id);

-- tasks: needs_review is the per-task "someone must approve this" checkbox.
alter table public.tasks
  add column needs_review boolean not null default false,
  add column blocked_reason text
    check (char_length(trim(blocked_reason)) between 1 and 500),
  add column submitted_by uuid references public.profiles (id),
  add column approved_by uuid references public.profiles (id);

-- ─── 5. Statuses: map the data, then swap the checks ──────────────────────────
-- Drop the old rules first: they would reject the new values mid-update.
alter table public.findings drop constraint findings_status_check;
alter table public.tasks drop constraint tasks_status_check;

-- Renaming a status is not an edit: keep updated_at / done_at exactly as they were.
alter table public.findings disable trigger findings_set_updated_at;
alter table public.tasks disable trigger tasks_set_done_at;

update public.findings set status = case status
  when 'submitted' then 'open'
  when 'resubmitted' then 'open'
  when 'changes_requested' then 'needs_info'
  when 'approved' then 'verified'
  else status
end;

update public.tasks set status = case status
  when 'submitted' then 'waiting_for_review'
  when 'resubmitted' then 'waiting_for_review'
  when 'changes_requested' then 'in_progress'
  when 'approved' then 'done'
  else status
end;

-- Every existing task went through review, so it keeps needing it.
update public.tasks set needs_review = true;
-- A task already waiting was submitted by whoever was assigned to it.
update public.tasks set submitted_by = assigned_to where status = 'waiting_for_review';

-- done_at is null unless the task is finished; a task sent back to in_progress was "finished" before.
update public.tasks set done_at = null where status = 'in_progress';

alter table public.findings enable trigger findings_set_updated_at;
alter table public.tasks enable trigger tasks_set_done_at;

alter table public.findings alter column status set default 'open';
alter table public.findings add constraint findings_status_check
  check (status in ('open', 'needs_info', 'fixed', 'not_a_bug', 'verified'));
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'blocked', 'waiting_for_review', 'done'));

-- A task is blocked exactly when it has a reason.
alter table public.tasks add constraint tasks_blocked_reason_iff_blocked
  check ((status = 'blocked') = (blocked_reason is not null));

-- "Open" counts on the project list: not closed yet (the old definitions used retired statuses).
create or replace view public.project_summaries
with (security_invoker = on)
as
select
  p.*,
  (select count(*) from public.findings f where f.project_id = p.id and f.status not in ('not_a_bug', 'verified'))::int as open_findings,
  (select count(*) from public.tasks t where t.project_id = p.id and t.status <> 'done')::int as open_tasks
from public.projects p;

-- ─── 6. Plain policies ────────────────────────────────────────────────────────
-- Read: everything, for any logged-in user. Create: only as yourself.
-- Update: any row (transition guards come later). Delete: not allowed yet on projects, tasks,
-- findings, finding images and task attachments (soft delete comes later).
create policy "team can read profiles" on public.profiles
  for select to authenticated using (true);

create policy "team can read projects" on public.projects
  for select to authenticated using (true);
create policy "team can create projects as themselves" on public.projects
  for insert to authenticated with check (created_by = auth.uid());
create policy "team can edit projects" on public.projects
  for update to authenticated using (true) with check (true);

create policy "team can read tasks" on public.tasks
  for select to authenticated using (true);
create policy "team can create tasks as themselves" on public.tasks
  for insert to authenticated with check (created_by = auth.uid() and status = 'todo');
create policy "team can edit tasks" on public.tasks
  for update to authenticated using (true) with check (true);

create policy "team can read findings" on public.findings
  for select to authenticated using (true);
create policy "team can log findings as themselves" on public.findings
  for insert to authenticated with check (author_id = auth.uid() and status = 'open');
create policy "team can edit findings" on public.findings
  for update to authenticated using (true) with check (true);

create policy "team can read finding images" on public.finding_images
  for select to authenticated using (true);
create policy "team can add finding images" on public.finding_images
  for insert to authenticated with check (true);
create policy "team can edit finding images" on public.finding_images
  for update to authenticated using (true) with check (true);

create policy "team can read comments" on public.comments
  for select to authenticated using (true);
create policy "team can comment as themselves" on public.comments
  for insert to authenticated with check (author_id = auth.uid());

create policy "team can read task attachments" on public.task_attachments
  for select to authenticated using (true);
create policy "team can attach files as themselves" on public.task_attachments
  for insert to authenticated with check (uploaded_by = auth.uid());
create policy "team can edit task attachments" on public.task_attachments
  for update to authenticated using (true) with check (true);

create policy "team can read checklist items" on public.task_checklist_items
  for select to authenticated using (true);
create policy "team can add checklist items" on public.task_checklist_items
  for insert to authenticated with check (true);
create policy "team can edit checklist items" on public.task_checklist_items
  for update to authenticated using (true) with check (true);
create policy "team can remove checklist items" on public.task_checklist_items
  for delete to authenticated using (true);

-- ─── 7. Storage policies ──────────────────────────────────────────────────────
-- Folder layout is unchanged: findings/<finding_id>/<file> and tasks/<task_id>/<file>.
-- Compared as text so a malformed path is simply denied instead of raising a cast error.
create policy "team can view finding images" on storage.objects
  for select to authenticated
  using (bucket_id = 'finding-images');

create policy "team can upload finding images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'finding-images'
    and (storage.foldername(name))[1] = 'findings'
    and exists (
      select 1 from public.findings f
      where f.id::text = (storage.foldername(name))[2]
    )
  );

create policy "team can view task attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments');

create policy "team can upload task attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'tasks'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[2]
    )
  );

-- ─── 8. Checklist guard, reduced to the one rule that stays ───────────────────
-- Items belong to one task for life. Ticking, renaming and reordering are open to everyone.
create function public.task_checklist_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.task_id is distinct from old.task_id then
    raise exception 'checklist items cannot move to another task' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger task_checklist_items_guard
  before insert or update on public.task_checklist_items
  for each row execute function public.task_checklist_items_guard();

-- ─── 9. Ownership and file location never change ──────────────────────────────
-- The update policies above let anyone edit any row, so these columns are locked by triggers
-- (RLS can't tell columns apart). Admin path (auth.uid() is null: SQL editor / service role) bypasses.
create function public.task_attachments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.uploaded_by is distinct from old.uploaded_by
    or new.task_id is distinct from old.task_id
    or new.storage_path is distinct from old.storage_path
  ) then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger task_attachments_guard
  before update on public.task_attachments
  for each row execute function public.task_attachments_guard();

create function public.finding_images_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.finding_id is distinct from old.finding_id
    or new.storage_path is distinct from old.storage_path
  ) then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger finding_images_guard
  before update on public.finding_images
  for each row execute function public.finding_images_guard();

create function public.projects_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and new.created_by is distinct from old.created_by then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger projects_guard
  before update on public.projects
  for each row execute function public.projects_guard();
