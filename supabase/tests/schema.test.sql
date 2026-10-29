-- Schema tests (pgTAP). Run: npx supabase test db
-- Everything runs inside a transaction that is rolled back, so no data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- 1-5: all tables exist
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'tasks', 'tasks table exists');
select has_table('public', 'findings', 'findings table exists');
select has_table('public', 'finding_images', 'finding_images table exists');

-- 6-7: creating an auth user creates a matching profile (handle_new_user trigger)
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'hedi@pgtap.local', '{"display_name":"Hedi"}');

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Hedi',
  'new auth user gets a profile with display_name from metadata'
);
select is(
  (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'member',
  'new profiles default to the member role'
);

-- Fixtures: one project, one task, one finding linked to that task
insert into public.projects (id, name, created_by)
values ('22222222-2222-2222-2222-222222222222', 'Mobile App QA', '11111111-1111-1111-1111-111111111111');

insert into public.tasks (id, project_id, title, assigned_to, created_by)
values ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'Retest login',
        '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

insert into public.findings (id, project_id, task_id, title, explanation, author_id)
values ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333', 'Login crash', 'Crashes on Android 13',
        '11111111-1111-1111-1111-111111111111');

-- 8-9: done_at follows status (set_done_at trigger)
update public.tasks set status = 'done' where id = '33333333-3333-3333-3333-333333333333';
select isnt(
  (select done_at from public.tasks where id = '33333333-3333-3333-3333-333333333333'),
  null,
  'marking a task done stamps done_at'
);
update public.tasks set status = 'todo' where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select done_at from public.tasks where id = '33333333-3333-3333-3333-333333333333'),
  null,
  'reopening a task clears done_at'
);

-- 10: status check constraint
select throws_ok(
  $$ insert into public.tasks (project_id, title, assigned_to, created_by, status)
     values ('22222222-2222-2222-2222-222222222222', 'Bad', '11111111-1111-1111-1111-111111111111',
             '11111111-1111-1111-1111-111111111111', 'doing') $$,
  '23514',
  null,
  'task status must be todo or done'
);

-- 11-12: deleting a task keeps its findings but unlinks them (on delete set null)
delete from public.tasks where id = '33333333-3333-3333-3333-333333333333';
select is(
  (select count(*)::int from public.findings where id = '44444444-4444-4444-4444-444444444444'),
  1,
  'finding survives when its task is deleted'
);
select is(
  (select task_id from public.findings where id = '44444444-4444-4444-4444-444444444444'),
  null,
  'finding task_id is cleared when its task is deleted'
);

-- 13-14: deleting a project cascades to its tasks and findings
insert into public.tasks (project_id, title, assigned_to, created_by)
values ('22222222-2222-2222-2222-222222222222', 'Another task',
        '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
delete from public.projects where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select count(*)::int from public.tasks where project_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'deleting a project deletes its tasks'
);
select is(
  (select count(*)::int from public.findings where project_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'deleting a project deletes its findings'
);

select * from finish();
rollback;
