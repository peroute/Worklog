-- Task attachment tests (pgTAP): private bucket, type/size limits, edit rights follow the task.
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');
update public.profiles set role = 'lead' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Hedi created both tasks and assigned them to Khaushik. The second one is already approved.
-- Neither has a project (also checks attachments don't depend on one).
insert into public.tasks (id, project_id, title, assigned_to, created_by, status) values
  ('11111111-0000-0000-0000-000000000001', null, 'Open task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'todo'),
  ('11111111-0000-0000-0000-000000000002', null, 'Approved task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'approved');

-- 1-3: bucket exists, is private, and enforces the 10 MB limit
select is((select count(*)::int from storage.buckets where id = 'task-attachments'), 1,
          'task-attachments bucket exists');
select is((select public from storage.buckets where id = 'task-attachments'), false,
          'task-attachments bucket is private');
select is((select file_size_limit from storage.buckets where id = 'task-attachments'), 10485760::bigint,
          'task-attachments bucket caps files at 10 MB');

-- 4-5: creator can attach (row + file) to their own open task
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('11111111-0000-0000-0000-000000000001',
                           'tasks/11111111-0000-0000-0000-000000000001/a.pdf', 'spec.pdf', 'application/pdf', 1000) $$,
                'creator can attach to their own task');
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('task-attachments', 'tasks/11111111-0000-0000-0000-000000000001/a.pdf') $$,
                'creator can upload into their own task''s folder');

-- 6-7: but not once the task is approved (content is frozen for the creator)
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000002',
                            'tasks/11111111-0000-0000-0000-000000000002/b.pdf', 'late.pdf', 'application/pdf', 1000) $$,
                 '42501', null, 'creator cannot attach to an approved task');
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('task-attachments', 'tasks/11111111-0000-0000-0000-000000000002/b.pdf') $$,
                 '42501', null, 'creator cannot upload into an approved task''s folder');
reset role;

-- 8-9: the assignee is not an editor: they can read attachments but not add any
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
select is((select count(*)::int from public.task_attachments), 1, 'assignee can see the task''s attachments');
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/c.pdf', 'mine.pdf', 'application/pdf', 1000) $$,
                 '42501', null, 'assignee cannot attach to someone else''s task');
reset role;

-- 10: the lead can attach even to an approved task
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('11111111-0000-0000-0000-000000000002',
                           'tasks/11111111-0000-0000-0000-000000000002/d.pdf', 'lead.pdf', 'application/pdf', 1000) $$,
                'lead can attach to an approved task');
reset role;

-- 11: oversized rows are rejected by the check constraint
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/huge.zip', 'huge.zip', 'application/zip', 10485761) $$,
                 '23514', null, 'attachments over 10 MB are rejected');

-- 12: an 11th attachment is rejected (task 1 already has 1; add 9 more, then one too many)
insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
select '11111111-0000-0000-0000-000000000001', 'tasks/11111111-0000-0000-0000-000000000001/n' || i || '.txt',
       'n' || i || '.txt', 'text/plain', 10
from generate_series(1, 9) as i;
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/x.txt', 'x.txt', 'text/plain', 10) $$,
                 '23514', 'a task can have at most 10 attachments', 'a task is capped at 10 attachments');

-- 13: deleting a task removes its attachment rows (files are cleaned up by the app)
delete from public.tasks where id = '11111111-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_attachments
           where task_id = '11111111-0000-0000-0000-000000000001'), 0,
          'deleting a task deletes its attachment rows');

select * from finish();
rollback;
