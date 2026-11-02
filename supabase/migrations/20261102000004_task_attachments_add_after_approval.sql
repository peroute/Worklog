-- Adding files to a task is allowed at any status, including after approval
-- (e.g. follow-up screenshots). REMOVING stays frozen once approved: approved work
-- keeps every file the lead reviewed. See "uploader or lead can remove attachments".
--
-- `create or replace` keeps the function's identity, so the policies that call it
-- (table insert + storage upload) pick up the new rule without being recreated.
create or replace function public.can_attach_to_task(p_task_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id::text = p_task_id
      and (public.is_lead() or auth.uid() in (t.created_by, t.assigned_to))
  );
$$;
