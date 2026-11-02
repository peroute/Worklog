-- Rename review statuses so the database, the code and the UI use the same words (docs/ux-audit.md §1a).
-- Findings and tasks now share one vocabulary; tasks additionally start at 'todo'.
--
--   findings: open → submitted   needs_review → changes_requested   fixed → resubmitted   closed   → approved
--   tasks:    done → submitted   needs_review → changes_requested   fixed → resubmitted   approved (unchanged)
--
-- Also renames send_back_*() → request_changes_*() to match the "Request changes" button.
--
-- Findings: submitted → approved | changes_requested → resubmitted → approved | changes_requested
-- Tasks:    todo ⇄ submitted → approved | changes_requested → resubmitted → approved | changes_requested

-- ─── 1. Data + check constraints ──────────────────────────────────────────────
-- Drop the old rule first: it would reject the new values mid-update.
alter table public.findings drop constraint findings_status_check;
alter table public.tasks drop constraint tasks_status_check;

-- Renaming a status is not an edit: keep updated_at / done_at exactly as they were.
alter table public.findings disable trigger findings_set_updated_at;
alter table public.tasks disable trigger tasks_set_done_at;

update public.findings set status = case status
  when 'open' then 'submitted'
  when 'needs_review' then 'changes_requested'
  when 'fixed' then 'resubmitted'
  when 'closed' then 'approved'
  else status
end;

update public.tasks set status = case status
  when 'done' then 'submitted'
  when 'needs_review' then 'changes_requested'
  when 'fixed' then 'resubmitted'
  else status
end;

alter table public.findings enable trigger findings_set_updated_at;
alter table public.tasks enable trigger tasks_set_done_at;

alter table public.findings alter column status set default 'submitted';
alter table public.findings add constraint findings_status_check
  check (status in ('submitted', 'changes_requested', 'resubmitted', 'approved'));
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'submitted', 'changes_requested', 'resubmitted', 'approved'));

-- ─── 2. Insert policy: new findings start at the beginning of their lifecycle ─
drop policy "team can log findings as themselves" on public.findings;
create policy "team can log findings as themselves" on public.findings
  for insert to authenticated with check (author_id = auth.uid() and status = 'submitted');

-- ─── 3. Guards ────────────────────────────────────────────────────────────────
-- Moving to changes_requested is only allowed inside request_changes_*(), which sets this
-- flag for its own transaction after saving the required comment.
create function public.in_request_changes()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('worklog.request_changes', true), '') = 'on';
$$;

create or replace function public.findings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  lead boolean;
begin
  if uid is null then
    return new;  -- admin path (SQL editor / service role)
  end if;
  lead := public.is_lead();

  if new.author_id is distinct from old.author_id then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;

  -- Content: author (until the lead approves it) or lead.
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    if not (lead or (uid = old.author_id and old.status <> 'approved')) then
      raise exception 'only the author or lead can edit this finding' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'changes_requested' and not public.in_request_changes() then
      raise exception 'a comment is required to request changes' using errcode = '42501';
    end if;
    if not (
      (lead and (old.status, new.status) in (
        ('submitted', 'approved'), ('resubmitted', 'approved'), ('approved', 'submitted'),
        ('submitted', 'changes_requested'), ('resubmitted', 'changes_requested'),
        ('changes_requested', 'resubmitted')))
      or (uid = old.author_id and old.status = 'changes_requested' and new.status = 'resubmitted')
    ) then
      raise exception 'not allowed to change this status' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

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
  if (to_jsonb(new) - 'status' - 'done_at') is distinct from (to_jsonb(old) - 'status' - 'done_at') then
    if not (lead or (uid = old.created_by and old.status <> 'approved')) then
      raise exception 'not allowed to edit this task' using errcode = '42501';
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

-- ─── 4. Request changes: comment + status in one transaction ──────────────────
-- Runs as the caller (security invoker), so RLS and the guards above still decide.
create function public.request_changes_finding(p_id uuid, p_body text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'a comment is required to request changes' using errcode = '22023';
  end if;
  insert into public.comments (finding_id, body) values (p_id, p_body);
  perform set_config('worklog.request_changes', 'on', true);
  update public.findings set status = 'changes_requested' where id = p_id;
  if not found then  -- check FOUND right after the update (later statements overwrite it)
    raise exception 'finding not found' using errcode = 'P0002';
  end if;
  perform set_config('worklog.request_changes', 'off', true);
end;
$$;

create function public.request_changes_task(p_id uuid, p_body text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'a comment is required to request changes' using errcode = '22023';
  end if;
  insert into public.comments (task_id, body) values (p_id, p_body);
  perform set_config('worklog.request_changes', 'on', true);
  update public.tasks set status = 'changes_requested' where id = p_id;
  if not found then  -- check FOUND right after the update (later statements overwrite it)
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  perform set_config('worklog.request_changes', 'off', true);
end;
$$;

revoke execute on function public.request_changes_finding(uuid, text), public.request_changes_task(uuid, text), public.in_request_changes() from anon, public;
grant execute on function public.request_changes_finding(uuid, text), public.request_changes_task(uuid, text), public.in_request_changes() to authenticated;

-- The guards above no longer call these.
drop function public.send_back_finding(uuid, text);
drop function public.send_back_task(uuid, text);
drop function public.in_send_back();

-- ─── 5. Project list counts: "open" = not approved yet ────────────────────────
create or replace view public.project_summaries
with (security_invoker = on)
as
select
  p.*,
  (select count(*) from public.findings f where f.project_id = p.id and f.status <> 'approved')::int as open_findings,
  (select count(*) from public.tasks t where t.project_id = p.id and t.status <> 'approved')::int as open_tasks
from public.projects p;
