-- Task checklist: the tick rule also applies when an item is created.
-- 20261103000010_task_checklist only guarded updates, so a creator could insert an item with done = true
-- and it would show as ticked by them. Ticking is the assignee's job (or the lead's).
-- Covered by supabase/tests/task_checklist.test.sql.

create or replace function public.task_checklist_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
begin
  if uid is null then
    return new;  -- admin path
  end if;

  if tg_op = 'INSERT' then
    -- Who may add rows at all is the insert policy's job; here only "born ticked" is checked.
    if new.done and not public.is_lead() then
      raise exception 'new checklist items start unticked; the assignee ticks them' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.task_id is distinct from old.task_id then
    raise exception 'checklist items cannot move to another task' using errcode = '42501';
  end if;

  select * into t from public.tasks where id = old.task_id;

  if new.title is distinct from old.title or new.position is distinct from old.position then
    if not (public.is_lead() or (uid = t.created_by and t.status <> 'approved')) then
      raise exception 'only the task creator or lead can change the checklist' using errcode = '42501';
    end if;
  end if;

  if new.done is distinct from old.done then
    if not (public.is_lead() or (uid = t.assigned_to and t.status in ('todo', 'changes_requested'))) then
      raise exception 'only the assignee can tick items, while the task is theirs to work on' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger task_checklist_items_guard on public.task_checklist_items;
create trigger task_checklist_items_guard
  before insert or update on public.task_checklist_items
  for each row execute function public.task_checklist_items_guard();
