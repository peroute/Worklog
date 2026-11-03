-- Flat team: status transition rules (docs/superpowers/specs/2026-11-03-flat-team-design.md §3, §4).
-- Everyone may move any item, but only along the allowed arrows, and some arrows need a comment.
-- Two layers:
--   * set_finding_status / set_task_status: the only way for the app to change a status. They insert
--     the comment (if any), then update, all in one transaction, so a refused move leaves no comment.
--   * findings_guard / tasks_guard (before update triggers): the actual rules. They refuse a direct
--     "update ... set status", compute fixed_by / submitted_by / approved_by themselves, and lock
--     ownership columns. auth.uid() is null (SQL editor / service role) bypasses them.
-- The RPCs tell the guards "this change came through me" with two transaction-local session flags:
--   worklog.status_rpc = 'on'     the status change is going through an RPC
--   worklog.comment_given = 'on'  the caller supplied a non-blank comment (already inserted)
-- Postgres fires same-timing triggers alphabetically: tasks_guard runs before tasks_set_done_at.

-- ─── 1. done_at ───────────────────────────────────────────────────────────────
-- null while the task is todo / in_progress / blocked; stamped when it first reaches
-- waiting_for_review or done; kept when waiting_for_review -> done. Clients can't set it.
create or replace function public.set_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('todo', 'in_progress', 'blocked') then
    new.done_at := null;
  elsif tg_op = 'INSERT' then
    new.done_at := coalesce(new.done_at, now());
  elsif old.status in ('todo', 'in_progress', 'blocked') then
    new.done_at := now();
  else
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

-- ─── 2. Findings ──────────────────────────────────────────────────────────────
create function public.findings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  comment_ok boolean := coalesce(current_setting('worklog.comment_given', true), '') = 'on';
  needs_comment boolean := false;
begin
  if uid is null then
    return new;
  end if;

  -- A new finding starts with no fixer, whatever the client sent.
  if tg_op = 'INSERT' then
    new.fixed_by := null;
    return new;
  end if;

  if new.author_id is distinct from old.author_id then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;

  -- fixed_by is computed below, never taken from the client.
  new.fixed_by := old.fixed_by;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if coalesce(current_setting('worklog.status_rpc', true), '') <> 'on' then
    raise exception 'status can only be changed with set_finding_status' using errcode = '42501';
  end if;

  case old.status || '>' || new.status
    when 'open>fixed', 'needs_info>fixed' then
      new.fixed_by := uid;
    when 'open>needs_info', 'open>not_a_bug', 'needs_info>not_a_bug' then
      needs_comment := true;
    when 'needs_info>open' then
      needs_comment := true;                -- "reply"
    when 'fixed>verified' then
      if old.fixed_by = uid then
        raise exception 'you can''t verify your own fix' using errcode = '42501';
      end if;
    when 'fixed>open', 'not_a_bug>open', 'verified>open' then
      needs_comment := true;                -- "still broken" / reopen
      new.fixed_by := null;
    else
      raise exception 'not allowed from % to %', old.status, new.status using errcode = '42501';
  end case;

  if needs_comment and not comment_ok then
    raise exception 'a comment is required' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger findings_guard
  before insert or update on public.findings
  for each row execute function public.findings_guard();

create function public.set_finding_status(
  p_id uuid,
  p_to text,
  p_comment text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_old text;
begin
  select status into v_old from public.findings where id = p_id for update;
  if not found then
    raise exception 'finding not found' using errcode = 'P0002';
  end if;
  -- Re-sending the current status (stale screen, double click) is not a transition.
  if v_old = p_to then
    raise exception 'not allowed from % to %', v_old, p_to using errcode = '42501';
  end if;

  if nullif(trim(p_comment), '') is not null then
    insert into public.comments (finding_id, body) values (p_id, trim(p_comment));
    perform set_config('worklog.comment_given', 'on', true);
  end if;

  perform set_config('worklog.status_rpc', 'on', true);
  update public.findings set status = p_to where id = p_id;

  -- Flags are transaction-local; clear them so later statements in this transaction don't inherit them.
  perform set_config('worklog.status_rpc', 'off', true);
  perform set_config('worklog.comment_given', 'off', true);
end;
$$;

-- ─── 3. Tasks ─────────────────────────────────────────────────────────────────
create function public.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  comment_ok boolean := coalesce(current_setting('worklog.comment_given', true), '') = 'on';
  needs_comment boolean := false;
begin
  if uid is null then
    return new;
  end if;

  -- A new task starts with no submitter / approver / finish time, whatever the client sent.
  if tg_op = 'INSERT' then
    new.submitted_by := null;
    new.approved_by := null;
    new.done_at := null;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'ownership cannot be changed' using errcode = '42501';
  end if;

  -- Review settings are frozen while a reviewer is looking at the work.
  if old.status = 'waiting_for_review'
     and (new.needs_review is distinct from old.needs_review
          or new.assigned_to is distinct from old.assigned_to) then
    raise exception 'can''t change review or assignee while waiting for review' using errcode = '42501';
  end if;

  -- Computed below, never taken from the client. (done_at is handled by set_done_at.)
  new.submitted_by := old.submitted_by;
  new.approved_by := old.approved_by;

  if new.status is not distinct from old.status then
    new.done_at := old.done_at;
    return new;
  end if;

  if coalesce(current_setting('worklog.status_rpc', true), '') <> 'on' then
    raise exception 'status can only be changed with set_task_status' using errcode = '42501';
  end if;

  case old.status || '>' || new.status
    when 'todo>in_progress', 'in_progress>todo' then
      null;
    when 'todo>blocked', 'in_progress>blocked' then
      if nullif(trim(new.blocked_reason), '') is null then
        raise exception 'a reason is required' using errcode = '22023';
      end if;
      new.blocked_reason := trim(new.blocked_reason);
    when 'blocked>in_progress', 'blocked>todo' then
      new.blocked_reason := null;
    when 'todo>done', 'in_progress>done' then
      if old.needs_review then
        raise exception 'not allowed from % to %', old.status, new.status using errcode = '42501';
      end if;
    when 'todo>waiting_for_review', 'in_progress>waiting_for_review' then
      if not old.needs_review then
        raise exception 'not allowed from % to %', old.status, new.status using errcode = '42501';
      end if;
      new.submitted_by := uid;
    when 'waiting_for_review>done' then
      if old.submitted_by = uid then
        raise exception 'you can''t approve work you submitted' using errcode = '42501';
      end if;
      new.approved_by := uid;
    when 'waiting_for_review>in_progress' then
      -- The submitter may withdraw freely; anyone else is requesting changes and must say why.
      needs_comment := old.submitted_by is distinct from uid;
      new.submitted_by := null;
    when 'done>in_progress' then
      needs_comment := true;                -- "reopen"
      new.submitted_by := null;
      new.approved_by := null;
    else
      raise exception 'not allowed from % to %', old.status, new.status using errcode = '42501';
  end case;

  if needs_comment and not comment_ok then
    raise exception 'a comment is required' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger tasks_guard
  before insert or update on public.tasks
  for each row execute function public.tasks_guard();

create function public.set_task_status(
  p_id uuid,
  p_to text,
  p_comment text default null,
  p_reason text default null,
  p_note text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_old text;
begin
  select status into v_old from public.tasks where id = p_id for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if v_old = p_to then
    raise exception 'not allowed from % to %', v_old, p_to using errcode = '42501';
  end if;

  if nullif(trim(p_comment), '') is not null then
    insert into public.comments (task_id, body) values (p_id, trim(p_comment));
    perform set_config('worklog.comment_given', 'on', true);
  end if;

  perform set_config('worklog.status_rpc', 'on', true);
  -- One update, so the note lands together with the status or not at all.
  -- blocked_reason is only meaningful when blocking; every other target clears it.
  update public.tasks
  set status = p_to,
      blocked_reason = case when p_to = 'blocked' then nullif(trim(p_reason), '') else null end,
      submission_note = coalesce(p_note, submission_note)
  where id = p_id;

  perform set_config('worklog.status_rpc', 'off', true);
  perform set_config('worklog.comment_given', 'off', true);
end;
$$;

-- ─── 4. Who can call the RPCs ─────────────────────────────────────────────────
revoke execute on function public.set_finding_status(uuid, text, text) from public, anon;
revoke execute on function public.set_task_status(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_finding_status(uuid, text, text) to authenticated;
grant execute on function public.set_task_status(uuid, text, text, text, text) to authenticated;
