-- Task attachment tests (pgTAP): private bucket, type/size limits, and who may add/remove:
--   add: creator, assignee or lead, at any status (even approved);
--   remove: your own until approved, or any as lead.
-- Run: npx supabase test db
-- Storage DELETEs are not tested here: Supabase blocks direct SQL deletes on storage.objects.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'outsider@pgtap.local', '{"display_name":"Outsider"}');
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

-- ── Creator (Hedi) ──
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
-- 4-5: attaches the brief (row + file) to their open task
select lives_ok($$ insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('a0000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
                           'tasks/11111111-0000-0000-0000-000000000001/brief.pdf', 'brief.pdf', 'application/pdf', 1000) $$,
                'creator can attach to their own task');
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('task-attachments', 'tasks/11111111-0000-0000-0000-000000000001/brief.pdf') $$,
                'creator can upload into their own task''s folder');
-- 6: can't add a file "as" someone else
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/fake.pdf', 'fake.pdf', 'application/pdf', 1000,
                            'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
                 '42501', null, 'nobody can attach a file under someone else''s name');
-- 7: adding still works after approval
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('11111111-0000-0000-0000-000000000002',
                           'tasks/11111111-0000-0000-0000-000000000002/late.pdf', 'late.pdf', 'application/pdf', 1000) $$,
                'creator can still attach to an approved task');
reset role;

-- ── Assignee (Khaushik) ──
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
-- 8-9: attaches proof of work (row + file)
select lives_ok($$ insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes, kind)
                   values ('a0000000-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
                           'tasks/11111111-0000-0000-0000-000000000001/proof.webp', 'proof.webp', 'image/webp', 1000, 'proof') $$,
                'assignee can attach proof of work');
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('task-attachments', 'tasks/11111111-0000-0000-0000-000000000001/proof.webp') $$,
                'assignee can upload into their task''s folder');
-- 10: adding still works after approval, but removing their own file does not
insert into public.task_attachments (id, task_id, storage_path, file_name, mime_type, size_bytes, kind)
values ('a0000000-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002',
        'tasks/11111111-0000-0000-0000-000000000002/late.webp', 'late.webp', 'image/webp', 1000, 'proof');
delete from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000003'), 1,
          'assignee can attach to an approved task but not remove from it');
-- 11: can't delete the creator's brief (RLS hides the row from DELETE, so it just stays)
delete from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000001'), 1,
          'assignee cannot remove the creator''s attachment');
-- 12: can delete their own
delete from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000002'), 0,
          'assignee can remove their own attachment');
reset role;

-- 13: someone not on the task can't attach
select pg_temp.login_as('dddddddd-dddd-dddd-dddd-dddddddddddd');
set local role authenticated;
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/x.pdf', 'x.pdf', 'application/pdf', 1000) $$,
                 '42501', null, 'a member not on the task cannot attach');
reset role;

-- ── Lead ──
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;
-- 14: can attach even to approved work
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('11111111-0000-0000-0000-000000000002',
                           'tasks/11111111-0000-0000-0000-000000000002/lead.pdf', 'lead.pdf', 'application/pdf', 1000) $$,
                'lead can attach to an approved task');
-- 15: can remove anyone's attachment
delete from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_attachments where id = 'a0000000-0000-0000-0000-000000000001'), 0,
          'lead can remove anyone''s attachment');
reset role;

-- 16: oversized rows are rejected by the check constraint
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/huge.zip', 'huge.zip', 'application/zip', 10485761) $$,
                 '23514', null, 'attachments over 10 MB are rejected');

-- 17: an 11th attachment is rejected (brief + proof share the same 10 slots)
insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
select '11111111-0000-0000-0000-000000000001', 'tasks/11111111-0000-0000-0000-000000000001/n' || i || '.txt',
       'n' || i || '.txt', 'text/plain', 10
from generate_series(1, 10) as i;
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                    values ('11111111-0000-0000-0000-000000000001',
                            'tasks/11111111-0000-0000-0000-000000000001/x.txt', 'x.txt', 'text/plain', 10) $$,
                 '23514', 'a task can have at most 10 attachments', 'a task is capped at 10 attachments');

-- 18: deleting a task removes its attachment rows (files are cleaned up by the app)
delete from public.tasks where id = '11111111-0000-0000-0000-000000000001';
select is((select count(*)::int from public.task_attachments
           where task_id = '11111111-0000-0000-0000-000000000001'), 0,
          'deleting a task deletes its attachment rows');

select * from finish();
rollback;
