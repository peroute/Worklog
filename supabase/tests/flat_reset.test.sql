-- Flat-team cutover tests (pgTAP): roles are gone, the new columns exist, no policy mentions is_lead.
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email, raw_user_meta_data)
values ('61111111-1111-1111-1111-111111111111', 'flat@pgtap.local', '{"display_name":"Flat"}');

-- 1-2: roles are gone
select hasnt_column('public', 'profiles', 'role', 'profiles has no role column');
select hasnt_function('public', 'is_lead', 'is_lead() is gone');

-- 3-7: new columns
select has_column('public', 'findings', 'fixed_by', 'findings.fixed_by exists');
select has_column('public', 'tasks', 'needs_review', 'tasks.needs_review exists');
select has_column('public', 'tasks', 'blocked_reason', 'tasks.blocked_reason exists');
select has_column('public', 'tasks', 'submitted_by', 'tasks.submitted_by exists');
select has_column('public', 'tasks', 'approved_by', 'tasks.approved_by exists');

-- 8-9: a blocked task needs a real reason
select throws_ok(
  $$ insert into public.tasks (title, assigned_to, created_by, status)
     values ('Blocked, no reason', '61111111-1111-1111-1111-111111111111',
             '61111111-1111-1111-1111-111111111111', 'blocked') $$,
  '23514', null, 'a blocked task without a reason is rejected'
);
select throws_ok(
  $$ insert into public.tasks (title, assigned_to, created_by, status, blocked_reason)
     values ('Blocked, blank reason', '61111111-1111-1111-1111-111111111111',
             '61111111-1111-1111-1111-111111111111', 'blocked', '   ') $$,
  '23514', null, 'a blank blocked reason is rejected'
);

-- 10-11: defaults
select col_default_is('public', 'findings', 'status', 'open', 'new findings start as open');
select col_default_is('public', 'tasks', 'needs_review', 'false', 'needs_review is off by default');

-- 12: sanity check only (cheap, not coverage of the rules; those are tested behaviourally below)
-- no leftover role-based policy anywhere (public tables and storage)
select is(
  (select count(*)::int from pg_policies where qual like '%is_lead%' or with_check like '%is_lead%'),
  0,
  'no policy mentions is_lead'
);

-- ─── Base rules that survive the role removal ─────────────────────────────────
create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data)
values ('62222222-2222-2222-2222-222222222222', 'flat2@pgtap.local', '{"display_name":"Flat2"}');

-- Fixtures (admin path): everything below was created by user 6111…
insert into public.projects (id, name, created_by) values
  ('63333333-0000-0000-0000-000000000001', 'pgtap: flat', '61111111-1111-1111-1111-111111111111');
insert into public.tasks (id, title, assigned_to, created_by) values
  ('64444444-0000-0000-0000-000000000001', 'T1', '61111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111111'),
  ('64444444-0000-0000-0000-000000000002', 'T2', '61111111-1111-1111-1111-111111111111', '61111111-1111-1111-1111-111111111111');
insert into public.findings (id, project_id, title, explanation, author_id) values
  ('65555555-0000-0000-0000-000000000001', '63333333-0000-0000-0000-000000000001', 'F1', 'x',
   '61111111-1111-1111-1111-111111111111'),
  ('65555555-0000-0000-0000-000000000002', '63333333-0000-0000-0000-000000000001', 'F2', 'x',
   '61111111-1111-1111-1111-111111111111');
insert into public.finding_images (id, finding_id, storage_path) values
  ('66666666-0000-0000-0000-000000000001', '65555555-0000-0000-0000-000000000001', 'findings/65555555-0000-0000-0000-000000000001/a.webp');
insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by) values
  ('67777777-0000-0000-0000-000000000001', '64444444-0000-0000-0000-000000000001',
   'tasks/64444444-0000-0000-0000-000000000001/a.pdf', 'a.pdf', 'application/pdf', 10,
   '61111111-1111-1111-1111-111111111111');

-- 13-15: not logged in = no access
set local role anon;
select throws_ok($$ select * from public.findings $$, '42501', null, 'anon cannot read findings');
select throws_ok($$ select * from public.tasks $$, '42501', null, 'anon cannot read tasks');
select throws_ok($$ select * from public.projects $$, '42501', null, 'anon cannot read projects');
reset role;

-- 16-22: you create things only as yourself, and new items start at the start of their lifecycle
select pg_temp.login_as('62222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok(
  $$ insert into public.findings (project_id, title, explanation, author_id)
     values ('63333333-0000-0000-0000-000000000001', 'Forged', 'x', '61111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'cannot log a finding as someone else');
select throws_ok(
  $$ insert into public.tasks (title, assigned_to, created_by)
     values ('Forged', '62222222-2222-2222-2222-222222222222', '61111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'cannot create a task as someone else');
select throws_ok(
  $$ insert into public.projects (name, created_by)
     values ('pgtap: forged', '61111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'cannot create a project as someone else');
select throws_ok(
  $$ insert into public.comments (task_id, author_id, body)
     values ('64444444-0000-0000-0000-000000000001', '61111111-1111-1111-1111-111111111111', 'hi') $$,
  '42501', null, 'cannot comment as someone else');
select throws_ok(
  $$ insert into public.findings (project_id, title, explanation, author_id, status)
     values ('63333333-0000-0000-0000-000000000001', 'Pre-verified', 'x', '62222222-2222-2222-2222-222222222222', 'verified') $$,
  '42501', null, 'a new finding must start as open');
select throws_ok(
  $$ insert into public.tasks (title, assigned_to, created_by, status)
     values ('Pre-done', '62222222-2222-2222-2222-222222222222', '62222222-2222-2222-2222-222222222222', 'done') $$,
  '42501', null, 'a new task must start as todo');

-- 23-27: ownership and file location are immutable
select throws_ok(
  $$ update public.task_attachments set uploaded_by = '62222222-2222-2222-2222-222222222222'
     where id = '67777777-0000-0000-0000-000000000001' $$,
  '42501', 'ownership cannot be changed', 'attachment uploaded_by cannot change');
select throws_ok(
  $$ update public.task_attachments set task_id = '64444444-0000-0000-0000-000000000002'
     where id = '67777777-0000-0000-0000-000000000001' $$,
  '42501', 'ownership cannot be changed', 'attachment cannot move to another task');
select throws_ok(
  $$ update public.task_attachments set storage_path = 'tasks/64444444-0000-0000-0000-000000000001/b.pdf'
     where id = '67777777-0000-0000-0000-000000000001' $$,
  '42501', 'ownership cannot be changed', 'attachment storage_path cannot change');
select throws_ok(
  $$ update public.finding_images set storage_path = 'x'
     where id = '66666666-0000-0000-0000-000000000001' $$,
  '42501', 'ownership cannot be changed', 'finding image storage_path cannot change');
select throws_ok(
  $$ update public.finding_images set finding_id = '65555555-0000-0000-0000-000000000002'
     where id = '66666666-0000-0000-0000-000000000001' $$,
  '42501', 'ownership cannot be changed', 'finding image cannot move to another finding');
select throws_ok(
  $$ update public.projects set created_by = '62222222-2222-2222-2222-222222222222'
     where id = '63333333-0000-0000-0000-000000000001' $$,
  '42501', 'ownership cannot be changed', 'project created_by cannot change');
reset role;

select * from finish();
rollback;
