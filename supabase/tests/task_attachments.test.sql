-- Task attachment tests (pgTAP): private bucket, type/size limits, the 10-file cap, and
-- "you attach as yourself". Anyone on the team can attach to any task.
-- Run: npx supabase test db
-- Storage DELETEs are not tested here: Supabase blocks direct SQL deletes on storage.objects.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');

-- Hedi created the task and assigned it to Khaushik. No project (also checks attachments don't need one).
insert into public.tasks (id, project_id, title, assigned_to, created_by, status) values
  ('11111111-0000-0000-0000-000000000001', null, 'Open task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'todo');

-- 1-3: bucket exists, is private, and enforces the 10 MB limit
select is((select count(*)::int from storage.buckets where id = 'task-attachments'), 1,
          'task-attachments bucket exists');
select is((select public from storage.buckets where id = 'task-attachments'), false,
          'task-attachments bucket is private');
select is((select file_size_limit from storage.buckets where id = 'task-attachments'), 10485760::bigint,
          'task-attachments bucket caps files at 10 MB');

-- ── Hedi ──
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
-- 4-5: attaches a file (row + file in storage)
select lives_ok($$ insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('a0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
                           'tasks/11111111-0000-0000-0000-000000000001/brief.pdf', 'brief.pdf', 'application/pdf', 1000) $$,
                'can attach to a task');
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('task-attachments', 'tasks/11111111-0000-0000-0000-000000000001/brief.pdf') $$,
                'can upload into a task''s folder');
-- 6: can't add a file "as" someone else
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/fake.pdf', 'fake.pdf', 'application/pdf', 1000,
                            'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
                 '42501', null, 'nobody can attach a file under someone else''s name');
reset role;

-- ── Khaushik ──
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
-- 7-8: attaches proof of work (row + file)
select lives_ok($$ insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes, kind)
                   values ('a0000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
                           'tasks/11111111-0000-0000-0000-000000000001/proof.webp', 'proof.webp', 'image/webp', 1000, 'proof') $$,
                'can attach proof of work');
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('task-attachments', 'tasks/11111111-0000-0000-0000-000000000001/proof.webp') $$,
                'can upload proof into the task''s folder');
reset role;

-- 9: oversized rows are rejected by the check constraint
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/huge.zip', 'huge.zip', 'application/zip', 10485761) $$,
                 '23514', null, 'attachments over 10 MB are rejected');

-- 10: an 11th attachment is rejected (brief + proof share the same 10 slots; 2 exist, add 8 more)
insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
select '11111111-0000-0000-0000-000000000001', 'tasks/11111111-0000-0000-0000-000000000001/n' || i || '.txt',
       'n' || i || '.txt', 'text/plain', 10
from generate_series(1, 8) as i;
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/x.txt', 'x.txt', 'text/plain', 10) $$,
                 '23514', 'a task can have at most 10 attachments', 'a task is capped at 10 attachments');

-- 11: deleting a task removes its attachment rows (files are cleaned up by the app)
delete from public.tasks where id = '11111111-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_attachments
           where task_id = '11111111-0000-0000-0000-000000000001'), 0,
          'deleting a task deletes its attachment rows');

select * from finish();
rollback;
