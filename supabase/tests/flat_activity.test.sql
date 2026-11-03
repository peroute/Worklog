-- Flat-team activity history tests (pgTAP): the triggers that fill public.activity, and its lockdown.
-- Setup is done as admin (no role); the checks run as user a (authenticated).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Number of activity rows for an item with a given action.
create function pg_temp.n(col text, id uuid, act text) returns bigint language plpgsql as $$
declare r bigint;
begin
  execute format('select count(*) from public.activity where %I = $1 and action = $2', col)
    into r using id, act;
  return r;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a4444444-4444-4444-4444-444444444444', 'aa@pgtap.local', '{"display_name":"A"}'),
  ('b4444444-4444-4444-4444-444444444444', 'ab@pgtap.local', '{"display_name":"B"}');

-- Admin-created rows (auth.uid() is null: the actor is null, but the history is still written).
insert into public.projects (id, name, created_by) values
  ('d4444444-0000-0000-0000-000000000001', 'pgtap act p1', 'a4444444-4444-4444-4444-444444444444'),
  ('d4444444-0000-0000-0000-000000000002', 'pgtap act doomed', 'a4444444-4444-4444-4444-444444444444');
insert into public.tasks (id, project_id, title, explanation, assigned_to, created_by) values
  ('f4444444-0000-0000-0000-000000000001', 'd4444444-0000-0000-0000-000000000001', 'T1', 'x',
   'a4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444'),
  ('f4444444-0000-0000-0000-000000000002', 'd4444444-0000-0000-0000-000000000002', 'T2', 'x',
   'a4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444');
insert into public.findings (id, project_id, title, explanation, author_id) values
  ('e4444444-0000-0000-0000-000000000001', 'd4444444-0000-0000-0000-000000000001', 'F1', 'x',
   'b4444444-4444-4444-4444-444444444444');
insert into public.task_checklist_items (id, task_id, title) values
  ('c4444444-0000-0000-0000-000000000002', 'f4444444-0000-0000-0000-000000000002', 'doomed step');

-- ─── created_logged ───────────────────────────────────────────────────────────
select is(pg_temp.n('project_id', 'd4444444-0000-0000-0000-000000000001', 'created'), 1::bigint, 'created_logged: project');
select is(pg_temp.n('task_id', 'f4444444-0000-0000-0000-000000000001', 'created'), 1::bigint, 'created_logged: task');
select is(pg_temp.n('finding_id', 'e4444444-0000-0000-0000-000000000001', 'created'), 1::bigint, 'created_logged: finding');
select is((select actor_id from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001' and action = 'created'),
  null::uuid, 'actor_is_caller: admin (no login) writes a null actor');

-- ─── admin hard delete still works with checklist items present (cascade safety) ──
select lives_ok($$delete from public.projects where id = 'd4444444-0000-0000-0000-000000000002'$$,
  'cascade_safe: admin delete of a project with checklist items succeeds');
select is((select count(*) from public.activity where task_id = 'f4444444-0000-0000-0000-000000000002'), 0::bigint,
  'cascade_safe: the purged task leaves no activity behind');

select pg_temp.login_as('a4444444-4444-4444-4444-444444444444');
set local role authenticated;

-- ─── actor_is_caller ──────────────────────────────────────────────────────────
insert into public.tasks (id, project_id, title, assigned_to, created_by) values
  ('f4444444-0000-0000-0000-000000000003', 'd4444444-0000-0000-0000-000000000001', 'T3',
   'a4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444');
select is((select actor_id from public.activity where task_id = 'f4444444-0000-0000-0000-000000000003' and action = 'created'),
  'a4444444-4444-4444-4444-444444444444'::uuid, 'actor_is_caller: a logged-in insert records that user');

-- ─── title_edit_logged_with_values ────────────────────────────────────────────
update public.tasks set title = 'T1 renamed' where id = 'f4444444-0000-0000-0000-000000000001';
select is((select details from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001' and action = 'edited'),
  '{"fields": {"title": {"from": "T1", "to": "T1 renamed"}}}'::jsonb,
  'title_edit_logged_with_values: from/to recorded');
select is((select actor_id from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001' and action = 'edited'),
  'a4444444-4444-4444-4444-444444444444'::uuid, 'actor_is_caller: edit records the caller');

-- ─── explanation_edit_logged_without_values ───────────────────────────────────
update public.tasks set explanation = 'a secret long text' where id = 'f4444444-0000-0000-0000-000000000001';
select ok(exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001'
                  and details = '{"fields": {"explanation": null}}'::jsonb),
  'explanation_edit_logged_without_values: field is null, no text leaked');
select ok(not exists (select 1 from public.activity where details::text like '%secret long text%'),
  'explanation_edit_logged_without_values: the text is nowhere in the log');

-- Project rename (short) and description (long).
update public.projects set name = 'pgtap act p1b' where id = 'd4444444-0000-0000-0000-000000000001';
select ok(exists (select 1 from public.activity where project_id = 'd4444444-0000-0000-0000-000000000001'
                  and details = '{"fields": {"name": {"from": "pgtap act p1", "to": "pgtap act p1b"}}}'::jsonb),
  'edited: project rename logs name from/to');

-- A no-op update logs nothing.
update public.tasks set title = title where id = 'f4444444-0000-0000-0000-000000000001';
select is(pg_temp.n('task_id', 'f4444444-0000-0000-0000-000000000001', 'edited'), 2::bigint,
  'edited: an update that changes nothing writes no row');

-- ─── status_change_logged ─────────────────────────────────────────────────────
select set_task_status('f4444444-0000-0000-0000-000000000001', 'blocked', null, 'waiting on API key');
select is((select details from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001' and action = 'status_changed'),
  '{"from": "todo", "to": "blocked", "reason": "waiting on API key"}'::jsonb,
  'status_change_logged: blocked includes the reason');
select is(pg_temp.n('task_id', 'f4444444-0000-0000-0000-000000000001', 'edited'), 2::bigint,
  'status_change_logged: blocked_reason is not logged as an edit');
select set_task_status('f4444444-0000-0000-0000-000000000001', 'in_progress');
select ok(exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001'
                  and action = 'status_changed' and details = '{"from": "blocked", "to": "in_progress"}'::jsonb),
  'status_change_logged: no reason key for non-blocked targets');
-- DB-managed columns (done_at etc.) never show up as edits.
select ok(not exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001'
                      and details::text like '%done_at%'),
  'status_change_logged: done_at / DB-managed columns are never logged as edits');

-- Finding status.
select set_finding_status('e4444444-0000-0000-0000-000000000001', 'fixed');
select ok(exists (select 1 from public.activity where finding_id = 'e4444444-0000-0000-0000-000000000001'
                  and action = 'status_changed' and details = '{"from": "open", "to": "fixed"}'::jsonb),
  'status_change_logged: finding status change');
select ok(not exists (select 1 from public.activity where finding_id = 'e4444444-0000-0000-0000-000000000001'
                      and action = 'edited'), 'status_change_logged: fixed_by is not an edit');

-- ─── soft_delete_logs_only_deleted ────────────────────────────────────────────
update public.tasks set deleted_at = now() where id = 'f4444444-0000-0000-0000-000000000003';
select is((select array_agg(action order by created_at, action) from public.activity
           where task_id = 'f4444444-0000-0000-0000-000000000003'),
  array['created', 'deleted'], 'soft_delete_logs_only_deleted: no edited / status noise for deleted_at / deleted_by');
update public.tasks set deleted_at = null where id = 'f4444444-0000-0000-0000-000000000003';
select is(pg_temp.n('task_id', 'f4444444-0000-0000-0000-000000000003', 'restored'), 1::bigint,
  'soft_delete_logs_only_deleted: restore logs restored');

-- ─── a content edit inside a delete / restore is still logged ─────────────────
update public.tasks set deleted_at = now(), title = 'T3 gone' where id = 'f4444444-0000-0000-0000-000000000003';
select ok(pg_temp.n('task_id', 'f4444444-0000-0000-0000-000000000003', 'deleted') = 2
      and exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000003'
                  and details = '{"fields": {"title": {"from": "T3", "to": "T3 gone"}}}'::jsonb),
  'delete_with_edit: delete + title change logs deleted and edited');
update public.tasks set deleted_at = null, title = 'T3 back' where id = 'f4444444-0000-0000-0000-000000000003';
select ok(pg_temp.n('task_id', 'f4444444-0000-0000-0000-000000000003', 'restored') = 2
      and exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000003'
                  and details = '{"fields": {"title": {"from": "T3 gone", "to": "T3 back"}}}'::jsonb),
  'restore_with_edit: restore + title change logs restored and edited');

-- ─── submit with a note: status_changed + edited(submission_note) ─────────────
insert into public.tasks (id, project_id, title, assigned_to, created_by, needs_review) values
  ('f4444444-0000-0000-0000-000000000004', 'd4444444-0000-0000-0000-000000000001', 'T4',
   'a4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444', true);
select set_task_status('f4444444-0000-0000-0000-000000000004', 'waiting_for_review', null, null, 'my note');
select ok(exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000004'
                  and action = 'status_changed' and details = '{"from": "todo", "to": "waiting_for_review"}'::jsonb)
      and exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000004'
                  and action = 'edited' and details = '{"fields": {"submission_note": null}}'::jsonb),
  'submit_with_note: logs status_changed and edited submission_note (no text)');

-- ─── file_added_and_removed_logged ────────────────────────────────────────────
insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values
  ('aa444444-0000-0000-0000-000000000001', 'f4444444-0000-0000-0000-000000000001', 'tasks/t1/spec.pdf',
   'spec.pdf', 'application/pdf', 10, 'a4444444-4444-4444-4444-444444444444');
select ok(exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001'
                  and action = 'file_added' and details = '{"file_name": "spec.pdf"}'::jsonb),
  'file_added_and_removed_logged: attachment insert logs file_added on the task');
update public.task_attachments set deleted_at = now() where id = 'aa444444-0000-0000-0000-000000000001';
select ok(exists (select 1 from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001'
                  and action = 'file_removed' and details = '{"file_name": "spec.pdf"}'::jsonb),
  'file_added_and_removed_logged: soft delete logs file_removed on the task');
update public.task_attachments set deleted_at = null where id = 'aa444444-0000-0000-0000-000000000001';
select is(pg_temp.n('task_id', 'f4444444-0000-0000-0000-000000000001', 'file_added'), 2::bigint,
  'file_added_and_removed_logged: restore logs file_added again');

insert into public.finding_images (id, finding_id, storage_path) values
  ('bb444444-0000-0000-0000-000000000001', 'e4444444-0000-0000-0000-000000000001', 'findings/f1/1.webp');
update public.finding_images set deleted_at = now() where id = 'bb444444-0000-0000-0000-000000000001';
select ok(exists (select 1 from public.activity where finding_id = 'e4444444-0000-0000-0000-000000000001'
                  and action = 'file_added' and details = '{"file_name": "Screenshot"}'::jsonb)
      and exists (select 1 from public.activity where finding_id = 'e4444444-0000-0000-0000-000000000001'
                  and action = 'file_removed' and details = '{"file_name": "Screenshot"}'::jsonb),
  'file_added_and_removed_logged: finding screenshots log as "Screenshot"');

-- ─── checklist_tick_logged ────────────────────────────────────────────────────
insert into public.task_checklist_items (id, task_id, title) values
  ('c4444444-0000-0000-0000-000000000001', 'f4444444-0000-0000-0000-000000000001', 'step one');
update public.task_checklist_items set done = true where id = 'c4444444-0000-0000-0000-000000000001';
update public.task_checklist_items set done = false where id = 'c4444444-0000-0000-0000-000000000001';
update public.task_checklist_items set title = 'step 1', position = 5 where id = 'c4444444-0000-0000-0000-000000000001';
update public.task_checklist_items set position = 9 where id = 'c4444444-0000-0000-0000-000000000001';
select is((select array_agg(action order by created_at, action) filter (where action like 'checklist_%')
           from public.activity where task_id = 'f4444444-0000-0000-0000-000000000001'),
  array['checklist_added', 'checklist_renamed', 'checklist_ticked', 'checklist_unticked'],  -- sorted by name: now() is frozen in a test transaction
  'checklist_tick_logged: added, ticked, unticked, renamed (position moves are not logged)');
select ok(exists (select 1 from public.activity where action = 'checklist_renamed'
                  and details = '{"title": "step 1", "from": "step one"}'::jsonb),
  'checklist_tick_logged: renamed carries title and from');
delete from public.task_checklist_items where id = 'c4444444-0000-0000-0000-000000000001';
select ok(exists (select 1 from public.activity where action = 'checklist_removed'
                  and task_id = 'f4444444-0000-0000-0000-000000000001' and details = '{"title": "step 1"}'::jsonb),
  'checklist_tick_logged: deleting an item logs checklist_removed');

-- ─── client lockdown ──────────────────────────────────────────────────────────
select throws_ok($$insert into public.activity (task_id, action) values ('f4444444-0000-0000-0000-000000000001', 'created')$$,
  '42501', null, 'client_cannot_insert_activity');

create function pg_temp.mutate(sql text) returns int language plpgsql as $$
declare n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return 0;
end;
$$;
select is(pg_temp.mutate($$update public.activity set action = 'x'$$), 0, 'client_cannot_update_or_delete_activity: update');
select is(pg_temp.mutate($$delete from public.activity$$), 0, 'client_cannot_update_or_delete_activity: delete');

select * from finish();
rollback;
