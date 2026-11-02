-- Task submissions: when the assignee finishes, they hand in a short note ("what I did")
-- plus proof files, together, for the lead to review. Before this, proof was only loose
-- files mixed in with the creator's brief, with no place to explain anything.
--
--   tasks.submission_note    the assignee's explanation; written by the assignee or the lead
--   task_attachments.kind    'brief' (what to do, from the creator) or 'proof' (evidence, from the assignee)

-- ─── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.tasks
  add column submission_note text
  check (submission_note is null or char_length(submission_note) <= 5000);

alter table public.task_attachments
  add column kind text not null default 'brief'
  check (kind in ('brief', 'proof'));

-- Existing files the assignee added were proof. Self-assigned tasks can't be told apart, so they stay 'brief'.
update public.task_attachments a
set kind = 'proof'
from public.tasks t
where t.id = a.task_id and a.uploaded_by = t.assigned_to and a.uploaded_by <> t.created_by;

-- ─── 2. Who may write the note ───────────────────────────────────────────────
-- Same as 20261102000010, plus: submission_note is NOT task content (the creator can't
-- rewrite the assignee's explanation). Only the assignee (until approved) or the lead may change it.
create or replace function public.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lead boolean;
begin
  if uid is null then
    return new;  -- admin path
  end if;
  lead := public.is_lead();

  if new.created_by is distinct from old.created_by then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;

  -- Content: creator (until approved) or lead.
  if (to_jsonb(new) - 'status' - 'done_at' - 'submission_note')
     is distinct from (to_jsonb(old) - 'status' - 'done_at' - 'submission_note') then
    if not (lead or (uid = old.created_by and old.status <> 'approved')) then
      raise exception 'not allowed to edit this task' using errcode = '42501';
    end if;
  end if;

  -- Submission note: assignee (until approved) or lead.
  if new.submission_note is distinct from old.submission_note then
    if not (lead or (uid = old.assigned_to and old.status <> 'approved')) then
      raise exception 'only the assignee or lead can write the submission' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'changes_requested' and not public.in_request_changes() then
      raise exception 'a comment is required to request changes' using errcode = '42501';
    end if;
    if not (
      (lead and (old.status, new.status) in (
        ('todo', 'submitted'), ('submitted', 'todo'), ('changes_requested', 'resubmitted'),
        ('submitted', 'approved'), ('resubmitted', 'approved'), ('approved', 'todo'),
        ('submitted', 'changes_requested'), ('resubmitted', 'changes_requested')))
      or (uid = old.assigned_to and (old.status, new.status) in (
        ('todo', 'submitted'), ('submitted', 'todo'), ('changes_requested', 'resubmitted')))
    ) then
      raise exception 'not allowed to change this status' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ─── 3. Who may add which kind of file ───────────────────────────────────────
-- brief: the creator or lead.  proof: the assignee or lead.
-- (can_attach_to_task still gates both, and the storage upload policy is unchanged.)
drop policy "creator, assignee or lead can add attachments" on public.task_attachments;
create policy "creator, assignee or lead can add attachments" on public.task_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_attach_to_task(task_id::text)
    and (
      public.is_lead()
      or exists (
        select 1 from public.tasks t
        where t.id = task_id
          and ((kind = 'brief' and t.created_by = auth.uid()) or (kind = 'proof' and t.assigned_to = auth.uid()))
      )
    )
  );
