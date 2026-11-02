-- Tasks no longer need a project (e.g. one-off chores for a teammate).
-- The foreign key and `on delete cascade` stay: a task that HAS a project still
-- goes away with it; a task with project_id = null is simply unaffected.
-- Findings keep requiring a project.
alter table public.tasks alter column project_id drop not null;
