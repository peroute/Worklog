-- Task submission tests (pgTAP): the assignee's note + proof files.
--   note:  assignee (until approved) or lead; never the creator
--   brief files: creator or lead;  proof files: assignee or lead
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');
update public.profiles set role = 'lead' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Hedi created both and assigned them to Khaushik. The second is already approved.
insert into public.tasks (id, title, assigned_to, created_by, status) values
  ('22222222-0000-0000-0000-000000000001', 'Open task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'todo'),
  ('22222222-0000-0000-0000-000000000002', 'Approved task',
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'approved');

-- ── Assignee (Khaushik) ──
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
-- 1: note + status change in one update
select lives_ok($$ update public.tasks set submission_note = 'Tested on Android 13 and 14', status = 'submitted'
                   where id = '22222222-0000-0000-0000-000000000001' $$,
                'assignee can submit with a note');
-- 2: can still adjust the note while it waits for review
select lives_ok($$ update public.tasks set submission_note = 'Tested on Android 13, 14 and 15'
                   where id = '22222222-0000-0000-0000-000000000001' $$,
                'assignee can edit their note before approval');
-- 3: frozen once approved
select throws_ok($$ update public.tasks set submission_note = 'rewrite'
                    where id = '22222222-0000-0000-0000-000000000002' $$,
                 '42501', null, 'assignee cannot change the note after approval');
-- 4: proof files are theirs to add
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, kind)
                   values ('22222222-0000-0000-0000-000000000001',
                           'tasks/22222222-0000-0000-0000-000000000001/proof.webp', 'proof.webp', 'image/webp', 1000, 'proof') $$,
                'assignee can add proof');
-- 5: but not the brief
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, kind)
                    values ('22222222-0000-0000-0000-000000000001',
                            'tasks/22222222-0000-0000-0000-000000000001/brief.pdf', 'brief.pdf', 'application/pdf', 1000, 'brief') $$,
                 '42501', null, 'assignee cannot add to the brief');
reset role;

-- ── Creator (Hedi) ──
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
-- 6: the creator can't rewrite the assignee's explanation
select throws_ok($$ update public.tasks set submission_note = 'they did nothing'
                    where id = '22222222-0000-0000-0000-000000000001' $$,
                 '42501', null, 'creator cannot write the submission note');
-- 7: and can't add proof on the assignee's behalf
select throws_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, kind)
                    values ('22222222-0000-0000-0000-000000000001',
                            'tasks/22222222-0000-0000-0000-000000000001/fake.webp', 'fake.webp', 'image/webp', 1000, 'proof') $$,
                 '42501', null, 'creator cannot add proof');
-- 8: brief files still work for the creator
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes)
                   values ('22222222-0000-0000-0000-000000000001',
                           'tasks/22222222-0000-0000-0000-000000000001/plan.pdf', 'plan.pdf', 'application/pdf', 1000) $$,
                'creator can add to the brief (kind defaults to brief)');
reset role;

-- ── Lead ──
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;
-- 9-10: the lead can do both, even after approval
select lives_ok($$ update public.tasks set submission_note = 'Lead correction'
                   where id = '22222222-0000-0000-0000-000000000002' $$,
                'lead can edit the note after approval');
select lives_ok($$ insert into public.task_attachments (task_id, storage_path, file_name, mime_type, size_bytes, kind)
                   values ('22222222-0000-0000-0000-000000000002',
                           'tasks/22222222-0000-0000-0000-000000000002/lead.webp', 'lead.webp', 'image/webp', 1000, 'proof') $$,
                'lead can add proof');
reset role;

select * from finish();
rollback;
