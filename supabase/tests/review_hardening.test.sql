-- Final-review fixes (pgTAP): edges of the review-flow guards that a member could hit via the API.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('request.jwt.claims', '', true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');
update public.profiles set role = 'lead' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
insert into public.projects (id, name, created_by) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pgtap: hardening', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- Admin-path fixtures in review states. t1: approved, assigned to hedi. t2: changes_requested, created by khaushik for hedi.
insert into public.tasks (id, project_id, title, assigned_to, created_by, status) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Approved', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'approved'),
  ('a2a2a2a2-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Under review', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'changes_requested'),
  ('a3a3a3a3-0000-0000-0000-000000000003', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Fresh', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'todo');
insert into public.findings (id, project_id, title, explanation, author_id, status) values
  ('f1f1f1f1-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Closed one', 'x', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'approved');
update public.tasks set done_at = '2026-01-01T00:00:00Z' where id = 'a1a1a1a1-0000-0000-0000-000000000001';

-- ─── 1. done_at belongs to the database ───────────────────────────────────────
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc'); set local role authenticated;
update public.tasks set done_at = '2030-01-01T00:00:00Z' where id = 'a1a1a1a1-0000-0000-0000-000000000001';
reset role;
select is((select done_at from public.tasks where id = 'a1a1a1a1-0000-0000-0000-000000000001'), '2026-01-01T00:00:00Z'::timestamptz,
  'a member cannot rewrite done_at on someone else''s task');                                        -- 1

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
update public.tasks set status = 'submitted', done_at = '2020-01-01T00:00:00Z' where id = 'a3a3a3a3-0000-0000-0000-000000000003';
reset role;
select ok((select done_at > now() - interval '1 minute' from public.tasks where id = 'a3a3a3a3-0000-0000-0000-000000000003'),
  'finishing a task stamps now(), not a client-supplied date');                                      -- 2

-- ─── 2. Approved work cannot be deleted by its owner ──────────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
delete from public.findings where id = 'f1f1f1f1-0000-0000-0000-000000000001';
delete from public.tasks where id = 'a1a1a1a1-0000-0000-0000-000000000001';
reset role;
select is((select count(*)::int from public.findings where id = 'f1f1f1f1-0000-0000-0000-000000000001'), 1,
  'author cannot delete a closed finding');                                                          -- 3
select is((select count(*)::int from public.tasks where id = 'a1a1a1a1-0000-0000-0000-000000000001'), 1,
  'creator cannot delete an approved task');                                                         -- 4

-- ─── 3. Closed findings' screenshots are frozen too ───────────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
select throws_ok($$ insert into public.finding_images (finding_id, storage_path)
                    values ('f1f1f1f1-0000-0000-0000-000000000001', 'findings/f1/new.webp') $$,
  '42501', null, 'author cannot add a screenshot row to a closed finding');                          -- 5
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('finding-images', 'findings/f1f1f1f1-0000-0000-0000-000000000001/new.webp') $$,
  '42501', null, 'author cannot upload a file into a closed finding''s folder');                    -- 6
reset role;

select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); set local role authenticated;
select lives_ok($$ insert into public.finding_images (finding_id, storage_path)
                   values ('f1f1f1f1-0000-0000-0000-000000000001', 'findings/f1/lead.webp') $$,
  'the lead still can');                                                                             -- 7
reset role;

-- ─── 4. Only the lead reassigns a task once it has left "to do" ───────────────
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc'); set local role authenticated;
select throws_ok($$ update public.tasks set assigned_to = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                    where id = 'a2a2a2a2-0000-0000-0000-000000000002' $$,
  '42501', 'only the lead can reassign a task under review', 'creator cannot grab a task under review'); -- 8
reset role;

select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); set local role authenticated;
select lives_ok($$ update public.tasks set assigned_to = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                   where id = 'a2a2a2a2-0000-0000-0000-000000000002' $$,
  'the lead can reassign it');                                                                       -- 9
reset role;
select is((select status from public.tasks where id = 'a2a2a2a2-0000-0000-0000-000000000002'), 'changes_requested',
  'reassigning keeps the review status');                                                            -- 10

select * from finish();
rollback;
