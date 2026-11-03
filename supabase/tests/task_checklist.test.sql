-- Task checklist tests (pgTAP).
--   list (add / rename / reorder / delete): creator until approved, lead always
--   ticks: assignee while it's their turn (todo, changes_requested), lead always
--   done_by / done_at: set by the database only;  max 50 items per task
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');
update public.profiles set role = 'lead' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Hedi created all three and assigned them to Khaushik.
insert into public.tasks (id, title, assigned_to, created_by, status) values
  ('22222222-0000-0000-0000-000000000001', 'To do task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'todo'),
  ('22222222-0000-0000-0000-000000000002', 'Approved task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'approved'),
  ('22222222-0000-0000-0000-000000000003', 'Submitted task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'submitted');

insert into public.task_checklist_items (id, task_id, title, position) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Reproduce', 0),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Fix', 0),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003', 'Test', 0);

-- ── Assignee (Khaushik) ──
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
-- 1
select lives_ok($$ update public.task_checklist_items set done = true
                   where id = '33333333-0000-0000-0000-000000000001' $$,
                'assignee can tick an item on a to-do task');
-- 2
select results_eq($$ select done_by, done_at is not null from public.task_checklist_items
                     where id = '33333333-0000-0000-0000-000000000001' $$,
                  $$ values ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, true) $$,
                  'ticking records who and when');
-- 3
update public.task_checklist_items set done_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  where id = '33333333-0000-0000-0000-000000000001';
select is((select done_by from public.task_checklist_items where id = '33333333-0000-0000-0000-000000000001'),
          'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
          'done_by cannot be forged');
-- 4
select throws_ok($$ update public.task_checklist_items set title = 'Skip this'
                    where id = '33333333-0000-0000-0000-000000000001' $$,
                 '42501', null, 'assignee cannot rename an item');
-- 5
select throws_ok($$ insert into public.task_checklist_items (task_id, title)
                    values ('22222222-0000-0000-0000-000000000001', 'Extra') $$,
                 '42501', null, 'assignee cannot add items');
-- 6
delete from public.task_checklist_items where id = '33333333-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_checklist_items where id = '33333333-0000-0000-0000-000000000001'),
          1, 'assignee cannot delete items');
-- 7
select throws_ok($$ update public.task_checklist_items set done = true
                    where id = '33333333-0000-0000-0000-000000000003' $$,
                 '42501', null, 'assignee cannot tick after submitting');
reset role;

-- ── Creator (Hedi) ──
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
-- 8
select lives_ok($$ insert into public.task_checklist_items (task_id, title, position)
                     values ('22222222-0000-0000-0000-000000000001', 'Capture logs', 1);
                   update public.task_checklist_items set title = 'Reproduce on Pixel 6'
                     where id = '33333333-0000-0000-0000-000000000001' $$,
                'creator can add and rename items');
-- 9
select throws_ok($$ update public.task_checklist_items set done = false
                    where id = '33333333-0000-0000-0000-000000000001' $$,
                 '42501', null, 'creator cannot tick items');
-- 10
select throws_ok($$ update public.task_checklist_items set title = 'Rewrite'
                    where id = '33333333-0000-0000-0000-000000000002' $$,
                 '42501', null, 'creator cannot edit the list after approval');
-- 10b: ticking is the assignee's job even when creating an item
select throws_ok($$ insert into public.task_checklist_items (task_id, title, done)
                    values ('22222222-0000-0000-0000-000000000001', 'Already done', true) $$,
                 '42501', null, 'creator cannot create an item already ticked');
-- 10c
select throws_ok($$ update public.task_checklist_items set task_id = '22222222-0000-0000-0000-000000000003'
                    where id = '33333333-0000-0000-0000-000000000001' $$,
                 '42501', null, 'items cannot move to another task');
reset role;

-- ── Lead ──
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;
-- 11
select lives_ok($$ update public.task_checklist_items set title = 'Fix (lead edit)'
                     where id = '33333333-0000-0000-0000-000000000002';
                   update public.task_checklist_items set done = true
                     where id = '33333333-0000-0000-0000-000000000003' $$,
                'lead can edit an approved list and tick a submitted task');
-- 12
update public.task_checklist_items set done = false where id = '33333333-0000-0000-0000-000000000003';
select results_eq($$ select done_by is null, done_at is null from public.task_checklist_items
                     where id = '33333333-0000-0000-0000-000000000003' $$,
                  $$ values (true, true) $$,
                  'unticking clears who and when');
reset role;

-- ── Limits and cleanup (admin) ──
-- 13: T1 has 2 items; fill to 50, then one more
insert into public.task_checklist_items (task_id, title, position)
  select '22222222-0000-0000-0000-000000000001', 'Item ' || n, n from generate_series(2, 49) n;
select throws_ok($$ insert into public.task_checklist_items (task_id, title)
                    values ('22222222-0000-0000-0000-000000000001', 'One too many') $$,
                 '23514', null, 'a task can have at most 50 items');
-- 14
delete from public.tasks where id = '22222222-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_checklist_items
           where task_id = '22222222-0000-0000-0000-000000000001'),
          0, 'items are deleted with their task');

select * from finish();
rollback;
