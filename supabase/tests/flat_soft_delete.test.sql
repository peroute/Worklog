-- Flat-team soft delete tests (pgTAP): stamp_deleted, live views, caps, deleted-item rules, storage.
-- Rows are set up as admin (no role); the checks run as user a (authenticated).
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- How many rows a plain DELETE removed (0 expected: no privilege, no delete policies).
create function pg_temp.delete_count(tbl text, col text, val uuid) returns int language plpgsql as $$
declare n int;
begin
  execute format('delete from public.%I where %I = $1', tbl, col) using val;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return 0;  -- the table privilege is revoked too: refused either way
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a3333333-3333-3333-3333-333333333333', 'sa@pgtap.local', '{"display_name":"A"}'),
  ('b3333333-3333-3333-3333-333333333333', 'sb@pgtap.local', '{"display_name":"B"}');

insert into public.projects (id, name, created_by) values
  ('d3333333-0000-0000-0000-000000000001', 'pgtap sd live',   'a3333333-3333-3333-3333-333333333333'),
  ('d3333333-0000-0000-0000-000000000002', 'pgtap sd doomed', 'a3333333-3333-3333-3333-333333333333');

insert into public.findings (id, project_id, title, explanation, author_id, status) values
  ('e3333333-0000-0000-0000-000000000001', 'd3333333-0000-0000-0000-000000000001', 'F1', 'x', 'b3333333-3333-3333-3333-333333333333', 'open'),
  ('e3333333-0000-0000-0000-000000000002', 'd3333333-0000-0000-0000-000000000001', 'F2', 'x', 'b3333333-3333-3333-3333-333333333333', 'open'),
  ('e3333333-0000-0000-0000-000000000003', 'd3333333-0000-0000-0000-000000000002', 'F3', 'x', 'b3333333-3333-3333-3333-333333333333', 'open'),
  ('e3333333-0000-0000-0000-000000000004', 'd3333333-0000-0000-0000-000000000001', 'F4', 'x', 'b3333333-3333-3333-3333-333333333333', 'open'),
  ('e3333333-0000-0000-0000-000000000005', 'd3333333-0000-0000-0000-000000000001', 'F5', 'x', 'b3333333-3333-3333-3333-333333333333', 'open'),
  ('e3333333-0000-0000-0000-000000000006', 'd3333333-0000-0000-0000-000000000001', 'F6', 'x', 'b3333333-3333-3333-3333-333333333333', 'verified');

insert into public.tasks (id, project_id, title, assigned_to, created_by, status) values
  ('f3333333-0000-0000-0000-000000000001', 'd3333333-0000-0000-0000-000000000001', 'T1', 'a3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'todo'),
  ('f3333333-0000-0000-0000-000000000002', 'd3333333-0000-0000-0000-000000000002', 'T2', 'a3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'todo'),
  ('f3333333-0000-0000-0000-000000000003', null,                                   'T3', 'a3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'todo'),
  ('f3333333-0000-0000-0000-000000000004', 'd3333333-0000-0000-0000-000000000001', 'T4', 'a3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'todo'),
  ('f3333333-0000-0000-0000-000000000005', 'd3333333-0000-0000-0000-000000000001', 'T5', 'a3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'done'),
  ('f3333333-0000-0000-0000-000000000006', 'd3333333-0000-0000-0000-000000000001', 'T6', 'a3333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'todo');

-- T4 holds 10 attachments, F5 holds 10 images (both at the cap).
insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
select 'f3333333-0000-0000-0000-000000000004', 'tasks/t4/' || g || '.png', g || '.png', 'image/png', 10,
       'a3333333-3333-3333-3333-333333333333'
from generate_series(1, 10) g;
insert into public.finding_images (finding_id, storage_path)
select 'e3333333-0000-0000-0000-000000000005', 'findings/f5/' || g || '.webp' from generate_series(1, 10) g;

select pg_temp.login_as('a3333333-3333-3333-3333-333333333333');
set local role authenticated;

-- ─── delete_is_refused ────────────────────────────────────────────────────────
select is(pg_temp.delete_count('findings', 'id', 'e3333333-0000-0000-0000-000000000001'), 0, 'delete_is_refused: delete affects 0 findings');
select is(pg_temp.delete_count('tasks', 'id', 'f3333333-0000-0000-0000-000000000001'), 0, 'delete_is_refused: delete affects 0 tasks');
select is(pg_temp.delete_count('projects', 'id', 'd3333333-0000-0000-0000-000000000001'), 0, 'delete_is_refused: delete affects 0 projects');
select is(pg_temp.delete_count('task_attachments', 'task_id', 'f3333333-0000-0000-0000-000000000004'), 0, 'delete_is_refused: delete affects 0 attachments');
select is(pg_temp.delete_count('finding_images', 'finding_id', 'e3333333-0000-0000-0000-000000000005'), 0, 'delete_is_refused: delete affects 0 finding images');

select ok(not exists (
  select 1 from unnest(array['projects','tasks','findings','finding_images','task_attachments']) tb
  where has_table_privilege('authenticated', 'public.' || tb, 'DELETE')
     or has_table_privilege('authenticated', 'public.' || tb, 'TRUNCATE')),
  'delete_is_refused: authenticated has no DELETE/TRUNCATE on the five soft-delete tables');
select ok(not has_table_privilege('authenticated', 'public.comments', 'TRUNCATE')
      and not has_table_privilege('authenticated', 'public.task_checklist_items', 'TRUNCATE'),
  'delete_is_refused: authenticated cannot TRUNCATE comments or checklist items');

-- ─── soft_delete_stamps / restore_clears ──────────────────────────────────────
update public.findings set deleted_at = '2000-01-01' where id = 'e3333333-0000-0000-0000-000000000001';
select ok((select deleted_at > now() - interval '1 minute' from public.findings where id = 'e3333333-0000-0000-0000-000000000001'),
  'soft_delete_stamps: deleted_at is now(), not the client value');
select is((select deleted_by from public.findings where id = 'e3333333-0000-0000-0000-000000000001'),
  'a3333333-3333-3333-3333-333333333333'::uuid, 'soft_delete_stamps: deleted_by is the caller');

-- A second edit cannot rewrite the stamp.
update public.findings set deleted_at = '2001-01-01', deleted_by = 'b3333333-3333-3333-3333-333333333333', title = 'F1b'
  where id = 'e3333333-0000-0000-0000-000000000001';
select is((select deleted_by from public.findings where id = 'e3333333-0000-0000-0000-000000000001'),
  'a3333333-3333-3333-3333-333333333333'::uuid, 'soft_delete_stamps: deleted_by can''t be rewritten');
select ok((select deleted_at > now() - interval '1 minute' from public.findings where id = 'e3333333-0000-0000-0000-000000000001'),
  'soft_delete_stamps: deleted_at can''t be rewritten');

update public.findings set deleted_at = null where id = 'e3333333-0000-0000-0000-000000000001';
select ok((select deleted_at is null and deleted_by is null from public.findings where id = 'e3333333-0000-0000-0000-000000000001'),
  'restore_clears: both columns null again');

-- Forging on insert: both forced to null.
select lives_ok($$ insert into public.findings (id, project_id, title, explanation, author_id, deleted_at, deleted_by)
  values ('e3333333-0000-0000-0000-0000000000f1', 'd3333333-0000-0000-0000-000000000001', 'forged', 'x',
          'a3333333-3333-3333-3333-333333333333', now(), 'b3333333-3333-3333-3333-333333333333') $$,
  'insert_forges_nothing: insert with deleted_* accepted');
select ok((select deleted_at is null and deleted_by is null from public.findings where id = 'e3333333-0000-0000-0000-0000000000f1'),
  'insert_forges_nothing: deleted_* forced to null on insert');

-- ─── live_views_hide_deleted ──────────────────────────────────────────────────
update public.findings set deleted_at = now() where id = 'e3333333-0000-0000-0000-000000000002';
update public.tasks set deleted_at = now() where id = 'f3333333-0000-0000-0000-000000000006';
select is((select count(*)::int from public.live_findings where id = 'e3333333-0000-0000-0000-000000000002'), 0,
  'live_views_hide_deleted: deleted finding not in live_findings');
select is((select count(*)::int from public.findings where id = 'e3333333-0000-0000-0000-000000000002'), 1,
  'live_views_hide_deleted: ...but still in the table');
select is((select count(*)::int from public.live_tasks where id = 'f3333333-0000-0000-0000-000000000006'), 0,
  'live_views_hide_deleted: deleted task not in live_tasks');
select is((select count(*)::int from public.live_tasks where id = 'f3333333-0000-0000-0000-000000000003'), 1,
  'live_views_hide_deleted: project-less task stays in live_tasks');

-- ─── project_delete_hides_children ────────────────────────────────────────────
update public.projects set deleted_at = now() where id = 'd3333333-0000-0000-0000-000000000002';
select is((select count(*)::int from public.live_projects where id = 'd3333333-0000-0000-0000-000000000002'), 0,
  'project_delete_hides_children: project hidden');
select is((select count(*)::int from public.live_tasks where id = 'f3333333-0000-0000-0000-000000000002'), 0,
  'project_delete_hides_children: its task hidden');
select is((select count(*)::int from public.live_findings where id = 'e3333333-0000-0000-0000-000000000003'), 0,
  'project_delete_hides_children: its finding hidden');
select ok((select deleted_at is null from public.tasks where id = 'f3333333-0000-0000-0000-000000000002')
      and (select deleted_at is null from public.findings where id = 'e3333333-0000-0000-0000-000000000003'),
  'project_delete_hides_children: children keep deleted_at null');

-- ─── name_reusable_after_delete ───────────────────────────────────────────────
select lives_ok($$ insert into public.projects (name, created_by)
  values ('pgtap sd doomed', 'a3333333-3333-3333-3333-333333333333') $$,
  'name_reusable_after_delete: deleted project''s name can be reused');
select throws_ok($$ insert into public.projects (name, created_by)
  values ('pgtap sd live', 'a3333333-3333-3333-3333-333333333333') $$,
  '23505', null, 'name_reusable_after_delete: a live name is still unique');

-- ─── cap_ignores_deleted ──────────────────────────────────────────────────────
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
  values ('f3333333-0000-0000-0000-000000000004', 'tasks/t4/x.png', 'x.png', 'image/png', 10) $$,
  '23514', null, 'cap_ignores_deleted: 11th live attachment refused');
update public.task_attachments set deleted_at = now() where storage_path = 'tasks/t4/1.png';
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
  values ('f3333333-0000-0000-0000-000000000004', 'tasks/t4/x.png', 'x.png', 'image/png', 10) $$,
  'cap_ignores_deleted: attachment fits after one is soft-deleted');
select throws_ok($$ insert into public.finding_images (finding_id, storage_path)
  values ('e3333333-0000-0000-0000-000000000005', 'findings/f5/x.webp') $$,
  '23514', null, 'cap_ignores_deleted: 11th live finding image refused');
update public.finding_images set deleted_at = now() where storage_path = 'findings/f5/1.webp';
select lives_ok($$ insert into public.finding_images (finding_id, storage_path)
  values ('e3333333-0000-0000-0000-000000000005', 'findings/f5/x.webp') $$,
  'cap_ignores_deleted: image fits after one is soft-deleted');

-- Restoring must respect the cap: both are full again (10 live), so un-deleting 1 makes 11.
select throws_ok($$ update public.task_attachments set deleted_at = null where storage_path = 'tasks/t4/1.png' $$,
  '23514', null, 'restore_respects_cap: attachment restore refused when full');
select throws_ok($$ update public.finding_images set deleted_at = null where storage_path = 'findings/f5/1.webp' $$,
  '23514', null, 'restore_respects_cap: image restore refused when full');
update public.task_attachments set deleted_at = now() where storage_path = 'tasks/t4/x.png';
update public.finding_images set deleted_at = now() where storage_path = 'findings/f5/x.webp';
select lives_ok($$ update public.task_attachments set deleted_at = null where storage_path = 'tasks/t4/1.png' $$,
  'restore_respects_cap: attachment restore works when there is room');
select lives_ok($$ update public.finding_images set deleted_at = null where storage_path = 'findings/f5/1.webp' $$,
  'restore_respects_cap: image restore works when there is room');

-- ─── no_status_change_when_deleted / no_comment_on_deleted ────────────────────
update public.tasks set deleted_at = now() where id = 'f3333333-0000-0000-0000-000000000001';
update public.findings set deleted_at = now() where id = 'e3333333-0000-0000-0000-000000000004';
select throws_ok($$ select public.set_task_status('f3333333-0000-0000-0000-000000000001', 'in_progress') $$,
  '42501', 'item is deleted', 'no_status_change_when_deleted: deleted task');
select throws_ok($$ select public.set_finding_status('e3333333-0000-0000-0000-000000000004', 'fixed') $$,
  '42501', 'item is deleted', 'no_status_change_when_deleted: deleted finding');
select throws_ok($$ insert into public.comments (task_id, body) values ('f3333333-0000-0000-0000-000000000001', 'hi') $$,
  '42501', null, 'no_comment_on_deleted: deleted task');
select throws_ok($$ insert into public.comments (finding_id, body) values ('e3333333-0000-0000-0000-000000000004', 'hi') $$,
  '42501', null, 'no_comment_on_deleted: deleted finding');
select lives_ok($$ insert into public.comments (finding_id, body) values ('e3333333-0000-0000-0000-000000000005', 'hi') $$,
  'no_comment_on_deleted: live finding still accepts comments');

-- New attachments / images need a live parent.
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
  values ('f3333333-0000-0000-0000-000000000001', 'tasks/t1/a.png', 'a.png', 'image/png', 10) $$,
  '42501', null, 'parent_must_be_live: no attachment on a deleted task');
select throws_ok($$ insert into public.finding_images (finding_id, storage_path)
  values ('e3333333-0000-0000-0000-000000000004', 'findings/f4/a.webp') $$,
  '42501', null, 'parent_must_be_live: no image on a deleted finding');

-- Anyone can restore: b restores what a deleted.
select pg_temp.login_as('b3333333-3333-3333-3333-333333333333');
update public.findings set deleted_at = null where id = 'e3333333-0000-0000-0000-000000000004';
select ok((select deleted_at is null and deleted_by is null from public.findings where id = 'e3333333-0000-0000-0000-000000000004'),
  'anyone_can_restore: b restores a finding a deleted');
select pg_temp.login_as('a3333333-3333-3333-3333-333333333333');
update public.findings set deleted_at = now() where id = 'e3333333-0000-0000-0000-000000000004';

-- ─── summaries_count_open ─────────────────────────────────────────────────────
-- Live project: F1 open (restored), F5 open, forged open = 3; F6 verified, F2/F4 deleted.
-- Tasks: T4 todo; T5 done, T1/T6 deleted.
select is((select open_findings from public.project_summaries where id = 'd3333333-0000-0000-0000-000000000001'), 3,
  'summaries_count_open: open findings skip deleted and verified');
select is((select open_tasks from public.project_summaries where id = 'd3333333-0000-0000-0000-000000000001'), 1,
  'summaries_count_open: open tasks skip deleted and done');

-- ─── storage: upload needs a live parent ──────────────────────────────────────
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('finding-images', 'findings/e3333333-0000-0000-0000-000000000004/a.webp') $$,
  '42501', null, 'storage: cannot upload into a deleted finding''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name)
  values ('task-attachments', 'tasks/f3333333-0000-0000-0000-000000000001/a.png') $$,
  '42501', null, 'storage: cannot upload into a deleted task''s folder');
select lives_ok($$ insert into storage.objects (bucket_id, name)
  values ('task-attachments', 'tasks/f3333333-0000-0000-0000-000000000004/a.png') $$,
  'storage: upload into a live task''s folder still works');
reset role;

select * from finish();
rollback;
