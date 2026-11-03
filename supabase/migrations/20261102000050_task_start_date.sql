-- Scheduled tasks: a task can have a start day. Before that day it stays off the Today screen
-- (the app filters on it); from that day on it behaves like any open task.
-- null = visible right away, so every existing task keeps working exactly as before.
--
-- Editing it is "content", which tasks_guard already limits to the creator (until approved) or
-- the lead: it compares the whole row minus status/done_at, so a new column is covered for free.

alter table public.tasks add column start_date date;

-- A deadline before the work may even start makes no sense. The form checks this too; this is
-- the backstop for anything that skips the form.
alter table public.tasks add constraint tasks_deadline_not_before_start
  check (start_date is null or deadline is null or deadline >= start_date);
