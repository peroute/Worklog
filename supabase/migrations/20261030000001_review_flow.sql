-- Review flow & comments (spec: docs/superpowers/specs/2026-10-30-review-flow-design.md).
-- Findings: open → closed | needs_review → fixed → closed | needs_review
-- Tasks:    todo ⇄ done → approved | needs_review → fixed → approved | needs_review

-- ─── Statuses ─────────────────────────────────────────────────────────────────
alter table public.findings drop constraint findings_status_check;
alter table public.findings add constraint findings_status_check
  check (status in ('open', 'needs_review', 'fixed', 'closed'));

alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'done', 'needs_review', 'fixed', 'approved'));

-- done_at = when the task was first finished; kept through review/approval, cleared on reopen.
create or replace function public.set_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'todo' then
    new.done_at := null;
  elsif new.done_at is null then
    new.done_at := now();
  end if;
  return new;
end;
$$;

-- New items always start at the beginning of their lifecycle.
drop policy "team can log findings as themselves" on public.findings;
create policy "team can log findings as themselves" on public.findings
  for insert to authenticated with check (author_id = auth.uid() and status = 'open');

drop policy "team can create tasks as themselves" on public.tasks;
create policy "team can create tasks as themselves" on public.tasks
  for insert to authenticated with check (created_by = auth.uid() and status = 'todo');

-- ─── Comments ─────────────────────────────────────────────────────────────────
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  finding_id uuid references public.findings (id) on delete cascade,
  task_id    uuid references public.tasks (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id),
  body       text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  -- A comment belongs to exactly one finding or one task.
  check (num_nonnulls(finding_id, task_id) = 1)
);

create index comments_finding_idx on public.comments (finding_id, created_at);
create index comments_task_idx on public.comments (task_id, created_at);

alter table public.comments enable row level security;
revoke all on public.comments from anon;

create policy "team can read comments" on public.comments
  for select to authenticated using (true);

-- The thread is between the lead and the person whose work it is.
create policy "lead, author, assignee or creator can comment" on public.comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and (
      public.is_lead()
      or exists (select 1 from public.findings f where f.id = finding_id and f.author_id = auth.uid())
      or exists (
        select 1 from public.tasks t
        where t.id = task_id and (t.assigned_to = auth.uid() or t.created_by = auth.uid())
      )
    )
  );

-- ─── Guards: explicit transition tables ───────────────────────────────────────
-- Moving to needs_review is only allowed inside send_back_*(), which sets this flag
-- for its own transaction after saving the required comment.
create function public.in_send_back()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('worklog.send_back', true), '') = 'on';
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

  -- Content: author (until the lead closes it) or lead.
  if (to_jsonb(new) - 'status' - 'updated_at') is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
    if not (lead or (uid = old.author_id and old.status <> 'closed')) then
      raise exception 'only the author or lead can edit this finding' using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'needs_review' and not public.in_send_back() then
      raise exception 'a comment is required to send this back' using errcode = '42501';
    end if;
    if not (
      (lead and (old.status, new.status) in (
        ('open', 'closed'), ('fixed', 'closed'), ('closed', 'open'),
        ('open', 'needs_review'), ('fixed', 'needs_review'), ('needs_review', 'fixed')))
      or (uid = old.author_id and old.status = 'needs_review' and new.status = 'fixed')
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
    if new.status = 'needs_review' and not public.in_send_back() then
      raise exception 'a comment is required to send this back' using errcode = '42501';
    end if;
    if not (
      (lead and (old.status, new.status) in (
        ('todo', 'done'), ('done', 'todo'), ('needs_review', 'fixed'),
        ('done', 'approved'), ('fixed', 'approved'), ('approved', 'todo'),
        ('done', 'needs_review'), ('fixed', 'needs_review')))
      or (uid = old.assigned_to and (old.status, new.status) in (
        ('todo', 'done'), ('done', 'todo'), ('needs_review', 'fixed')))
    ) then
      raise exception 'not allowed to change this status' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- ─── Send back: comment + status in one transaction ───────────────────────────
-- Runs as the caller (security invoker), so RLS and the guards above still decide.
create function public.send_back_finding(p_id uuid, p_body text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'a comment is required to send this back' using errcode = '22023';
  end if;
  insert into public.comments (finding_id, body) values (p_id, p_body);
  perform set_config('worklog.send_back', 'on', true);
  update public.findings set status = 'needs_review' where id = p_id;
  if not found then  -- check FOUND right after the update (later statements overwrite it)
    raise exception 'finding not found' using errcode = 'P0002';
  end if;
  perform set_config('worklog.send_back', 'off', true);
end;
$$;

create function public.send_back_task(p_id uuid, p_body text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_body is null or char_length(trim(p_body)) = 0 then
    raise exception 'a comment is required to send this back' using errcode = '22023';
  end if;
  insert into public.comments (task_id, body) values (p_id, p_body);
  perform set_config('worklog.send_back', 'on', true);
  update public.tasks set status = 'needs_review' where id = p_id;
  if not found then  -- check FOUND right after the update (later statements overwrite it)
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  perform set_config('worklog.send_back', 'off', true);
end;
$$;

revoke execute on function public.send_back_finding(uuid, text), public.send_back_task(uuid, text), public.in_send_back() from anon, public;
grant execute on function public.send_back_finding(uuid, text), public.send_back_task(uuid, text), public.in_send_back() to authenticated;

-- ─── Project list counts: "open" = not finished ───────────────────────────────
create or replace view public.project_summaries
with (security_invoker = on)
as
select
  p.*,
  (select count(*) from public.findings f where f.project_id = p.id and f.status <> 'closed')::int as open_findings,
  (select count(*) from public.tasks t where t.project_id = p.id and t.status <> 'approved')::int as open_tasks
from public.projects p;
