-- Task checklist: an ordered list of steps inside a task. The creator (or lead) writes the
-- list; the assignee ticks items off. Not sub-tasks: items have no assignee, status or review.
-- Covered by supabase/tests/task_checklist.test.sql.
--
--   1. Add / rename / reorder / delete items: the task's creator until it's approved, the lead always.
--   2. Tick / untick: the assignee while it's their turn (todo, changes_requested), the lead always.
--   3. done_by / done_at are set by the database; client-supplied values are ignored.
--   4. At most 50 items per task.

-- ─── Table ────────────────────────────────────────────────────────────────────
create table public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null check (char_length(trim(title)) between 1 and 200),
  position   int not null default 0,
  done       boolean not null default false,
  done_by    uuid references public.profiles (id),
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

create index task_checklist_items_task_position_idx on public.task_checklist_items (task_id, position);

-- ─── 3. Who ticked it, and when: the database decides ─────────────────────────
create function public.task_checklist_items_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.done then
    new.done_by := null;
    new.done_at := null;
  elsif auth.uid() is null then
    -- Admin path (SQL editor / service role / backfills): trust supplied values.
    new.done_at := coalesce(new.done_at, now());
  elsif tg_op = 'INSERT' or not old.done then
    new.done_by := auth.uid();                -- just ticked
    new.done_at := now();
  else
    new.done_by := old.done_by;               -- still ticked: keep the original stamp
    new.done_at := old.done_at;
  end if;
  return new;
end;
$$;

create trigger task_checklist_items_stamp
  before insert or update on public.task_checklist_items
  for each row execute function public.task_checklist_items_stamp();

-- ─── 1 + 2. Column rules (RLS can't tell columns apart, so a guard does) ──────
-- Same idea as tasks_guard: list content and ticks belong to different people.
create function public.task_checklist_items_guard()
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

create trigger task_checklist_items_guard
  before update on public.task_checklist_items
  for each row execute function public.task_checklist_items_guard();

-- ─── 4. Server-side cap ───────────────────────────────────────────────────────
create function public.task_checklist_items_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.task_checklist_items where task_id = new.task_id) >= 50 then
    raise exception 'a task can have at most 50 checklist items' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger task_checklist_items_limit
  before insert on public.task_checklist_items
  for each row execute function public.task_checklist_items_limit();

-- ─── Row level security ──────────────────────────────────────────────────────
revoke all on public.task_checklist_items from anon;
alter table public.task_checklist_items enable row level security;

create policy "team can read checklist items" on public.task_checklist_items
  for select to authenticated using (true);

create policy "creator or lead can add checklist items" on public.task_checklist_items
  for insert to authenticated with check (
    public.is_lead()
    or exists (select 1 from public.tasks t
               where t.id = task_id and t.created_by = auth.uid() and t.status <> 'approved')
  );

create policy "creator or lead can remove checklist items" on public.task_checklist_items
  for delete to authenticated using (
    public.is_lead()
    or exists (select 1 from public.tasks t
               where t.id = task_id and t.created_by = auth.uid() and t.status <> 'approved')
  );

-- Row-level gate only; task_checklist_items_guard decides which columns each person may change.
create policy "creator, assignee or lead can update checklist items" on public.task_checklist_items
  for update to authenticated using (
    public.is_lead()
    or exists (select 1 from public.tasks t
               where t.id = task_id and (t.created_by = auth.uid() or t.assigned_to = auth.uid()))
  );
