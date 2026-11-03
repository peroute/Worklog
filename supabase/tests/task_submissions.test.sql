-- Task submission tests (pgTAP): the assignee's note + proof files.
-- Who may write them is no longer restricted; these cover the note cap and the file kind label.
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');

-- Hedi created the task and assigned it to Khaushik.
insert into public.tasks (id, title, assigned_to, created_by, status) values
  ('22222222-0000-0000-0000-000000000001', 'Open task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'todo');

select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
-- 1: the note can be saved (the status moves only via set_task_status, covered in flat_tasks.test.sql)
select lives_ok($$ update public.tasks set submission_note = 'Tested on Android 13 and 14'
                   where id = '22222222-0000-0000-0000-000000000001' $$,
                'can save a submission note');
-- 2: the note is capped at 5000 characters
select throws_ok($$ update public.tasks set submission_note = repeat('x', 5001)
                    where id = '22222222-0000-0000-0000-000000000001' $$,
                 '23514', null, 'a note over 5000 characters is rejected');
-- 3: proof files
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, kind)
                   values ('22222222-0000-0000-0000-000000000001',
                           'tasks/22222222-0000-0000-0000-000000000001/proof.webp', 'proof.webp', 'image/webp', 1000, 'proof') $$,
                'can add proof');
-- 4: kind defaults to brief
select lives_ok($$ insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('a0000000-0000-0000-0000-000000000004', '22222222-0000-0000-0000-000000000001',
                           'tasks/22222222-0000-0000-0000-000000000001/plan.pdf', 'plan.pdf', 'application/pdf', 1000) $$,
                'can add to the brief');
reset role;
select is((select kind from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000004'),
          'brief', 'kind defaults to brief');

select * from finish();
rollback;
