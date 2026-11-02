-- Assignees can attach files too (optional proof of work), not just the creator/lead.
-- Each attachment remembers who added it, so:
--   add:    creator, assignee or lead (nobody but the lead once the task is approved)
--   remove: your own attachments (until approved); the lead can remove any
-- The creator can't delete the assignee's proof, and the assignee can't delete the brief.

-- ─── Who added it ─────────────────────────────────────────────────────────────
-- Added nullable, backfilled (existing files were all added by the task's creator), then locked.
alter table public.task_attachments add column uploaded_by uuid references public.profiles (id);
update public.task_attachments a set uploaded_by = t.created_by from public.tasks t where t.id = a.task_id;
alter table public.task_attachments
  alter column uploaded_by set not null,
  alter column uploaded_by set default auth.uid();

-- ─── Replace the creator-only rules ──────────────────────────────────────────
drop policy "task editors can add attachments" on public.task_attachments;
drop policy "task editors can remove attachments" on public.task_attachments;
drop policy "task editors can upload task attachments" on storage.objects;
drop policy "task editors or orphan cleanup can delete task attachments" on storage.objects;
drop function public.can_edit_task_content(text);

-- Text param so storage policies can pass a folder name; a malformed id matches no task (denied).
create function public.can_attach_to_task(p_task_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id::text = p_task_id
      and (
        public.is_lead()
        or (t.status <> 'approved' and auth.uid() in (t.created_by, t.assigned_to))
      )
  );
$$;

revoke execute on function public.can_attach_to_task(text) from anon;

-- uploaded_by = auth.uid(): you can't add a file "as" someone else.
create policy "creator, assignee or lead can add attachments" on public.task_attachments
  for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_attach_to_task(task_id::text));

create policy "uploader or lead can remove attachments" on public.task_attachments
  for delete to authenticated
  using (
    public.is_lead()
    or (
      uploaded_by = auth.uid()
      and exists (select 1 from public.tasks t where t.id = task_id and t.status <> 'approved')
    )
  );

-- ─── Storage ─────────────────────────────────────────────────────────────────
create policy "creator, assignee or lead can upload task attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'tasks'
    and public.can_attach_to_task((storage.foldername(name))[2])
  );

-- Files are deleted AFTER their row (the row delete is where permissions are checked).
-- So a file may be deleted by:
--   * the lead;
--   * anyone, once its task is gone (task/project delete cleanup);
--   * its uploader (storage records them in owner_id), but only once the row is gone,
--     so nobody can strip the file out from under a row that still exists (e.g. approved work).
create policy "lead, orphan cleanup or uploader can delete task attachments" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and (
      public.is_lead()
      or not exists (select 1 from public.tasks t where t.id::text = (storage.foldername(name))[2])
      or (
        owner_id = auth.uid()::text
        and not exists (select 1 from public.task_attachments a where a.storage_path = objects.name)
      )
    )
  );
