-- Task checklist tests (pgTAP). Anyone on the team may add, rename, reorder, tick and delete items.
--   done_by / done_at: set by the database only;  items cannot move to another task;  max 50 per task
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');

-- Hedi created both and assigned them to Khaushik.
insert into public.tasks (id, title, assigned_to, created_by, status) values
  ('22222222-0000-0000-0000-000000000001', 'To do task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'todo'),
  ('22222222-0000-0000-0000-000000000003', 'Waiting task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'waiting_for_review');

insert into public.task_checklist_items (id, task_id, title, position) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Reproduce', 0),
  ('33333333-0000-0000-0000-000000000003', '22222222-0000-0000-0000-000000000003', 'Test', 0);

-- ── Khaushik ──
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
-- 1
select lives_ok($$ update public.task_checklist_items set done = true
                   where id = '33333333-0000-0000-0000-000000000001' $$,
                'can tick an item');
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
reset role;

-- ── Hedi ──
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
-- 4
select lives_ok($$ insert into public.task_checklist_items (task_id, title, position)
                     values ('22222222-0000-0000-0000-000000000001', 'Capture logs', 1);
                   update public.task_checklist_items set title = 'Reproduce on Pixel 6'
                     where id = '33333333-0000-0000-0000-000000000001' $$,
                'can add and rename items');
-- 5
select throws_ok($$ update public.task_checklist_items set task_id = '22222222-0000-0000-0000-000000000003'
                    where id = '33333333-0000-0000-0000-000000000001' $$,
                 '42501', null, 'items cannot move to another task');
-- 6
update public.task_checklist_items set done = true where id = '33333333-0000-0000-0000-000000000003';
update public.task_checklist_items set done = false where id = '33333333-0000-0000-0000-000000000003';
select results_eq($$ select done_by is null, done_at is null from public.task_checklist_items
                     where id = '33333333-0000-0000-0000-000000000003' $$,
                  $$ values (true, true) $$,
                  'unticking clears who and when');
-- 7
delete from public.task_checklist_items where id = '33333333-0000-0000-0000-000000000003';
select is((select count(*)::int from public.task_checklist_items where id = '33333333-0000-0000-0000-000000000003'),
          0, 'can delete items');
reset role;

-- ── Limits and cleanup (admin) ──
-- 8: T1 has 2 items; fill to 50, then one more
insert into public.task_checklist_items (task_id, title, position)
  select '22222222-0000-0000-0000-000000000001', 'Item ' || n, n from generate_series(2, 49) n;
select throws_ok($$ insert into public.task_checklist_items (task_id, title)
                    values ('22222222-0000-0000-0000-000000000001', 'One too many') $$,
                 '23514', null, 'a task can have at most 50 items');
-- 9
delete from public.tasks where id = '22222222-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_checklist_items
           where task_id = '22222222-0000-0000-0000-000000000001'),
          0, 'items are deleted with their task');

select * from finish();
rollback;
