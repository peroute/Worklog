-- Project list with open counts (spec §7.3), as a plain Postgres view so any backend can reuse it.
-- security_invoker = on: the view runs with the CALLER's permissions, so RLS still applies.
-- (Without it, a view runs as its owner and silently bypasses RLS.)
create view public.project_summaries
with (security_invoker = on)
as
select
  p.*,
  (select count(*) from public.findings f where f.project_id = p.id and f.status = 'open')::int as open_findings,
  (select count(*) from public.tasks t where t.project_id = p.id and t.status = 'todo')::int as open_tasks
from public.projects p;

revoke all on public.project_summaries from anon;
grant select on public.project_summaries to authenticated;
