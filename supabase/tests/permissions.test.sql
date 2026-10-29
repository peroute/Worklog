-- Permission tests (pgTAP) for spec §6. Each block impersonates a user the same way
-- Supabase does for a real request: switch to the `authenticated` role and set the JWT
-- claims that auth.uid() reads. `reset role` goes back to the test superuser.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Sets the "logged in user" for the next statements (call before `set local role`).
create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- ─── Fixtures (as superuser) ──────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');
update public.profiles set role = 'lead' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.projects (id, name, created_by) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Mobile App QA', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

insert into public.findings (id, project_id, title, explanation, author_id) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Khaushik finding', 'by khaushik', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Hedi finding', 'by hedi', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- Task created by the lead, assigned to Hedi
insert into public.tasks (id, project_id, title, assigned_to, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Lead task for Hedi',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ─── 1. Not logged in: nothing readable ───────────────────────────────────────
set local role anon;
select throws_ok('select count(*) from public.findings', '42501', null,
                 'anon cannot read findings');
reset role;

-- ─── Projects ─────────────────────────────────────────────────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select lives_ok($$ insert into public.projects (id, name)
                   values ('22222222-2222-2222-2222-222222222222', 'Hedi project') $$,
                'member can create a project');                                        -- 2
delete from public.projects where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is((select count(*)::int from public.projects where id = '22222222-2222-2222-2222-222222222222'),
          1, 'member delete of a project is silently blocked');                        -- 3

select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;
delete from public.projects where id = '22222222-2222-2222-2222-222222222222';
reset role;
select is((select count(*)::int from public.projects where id = '22222222-2222-2222-2222-222222222222'),
          0, 'lead can delete a project');                                             -- 4

-- ─── Findings ─────────────────────────────────────────────────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select lives_ok($$ update public.findings set status = 'closed'
                   where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
                'member can close someone else''s finding');                           -- 5
select is((select status from public.findings where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
          'closed', 'the status change took effect');                                  -- 6
select throws_ok($$ update public.findings set title = 'hijacked'
                    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
                 '42501', 'only the author or lead can edit this finding',
                 'member cannot edit someone else''s finding text');                   -- 7
select lives_ok($$ update public.findings set title = 'Hedi finding v2'
                   where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' $$,
                'member can edit their own finding');                                  -- 8
delete from public.findings where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
reset role;
select is((select count(*)::int from public.findings where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
          1, 'member delete of someone else''s finding is silently blocked');          -- 9

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select throws_ok($$ insert into public.findings (project_id, title, explanation, author_id)
                    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'fake', 'x',
                            'cccccccc-cccc-cccc-cccc-cccccccccccc') $$,
                 '42501', null, 'member cannot log a finding as someone else');        -- 10
reset role;

select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;
select lives_ok($$ update public.findings set title = 'Edited by lead'
                   where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' $$,
                'lead can edit anyone''s finding');                                    -- 11
reset role;

-- ─── Finding images follow the parent finding's edit rights ────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select throws_ok($$ insert into public.finding_images (finding_id, storage_path)
                    values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'findings/eeee/x.webp') $$,
                 '42501', null, 'member cannot attach images to someone else''s finding'); -- 12
select lives_ok($$ insert into public.finding_images (finding_id, storage_path)
                   values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'findings/ffff/x.webp') $$,
                'member can attach images to their own finding');                      -- 13
reset role;

-- ─── Tasks ────────────────────────────────────────────────────────────────────
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
select lives_ok($$ insert into public.tasks (id, project_id, title, assigned_to)
                   values ('33333333-3333-3333-3333-333333333333', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                           'Khaushik task for Hedi', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
                'member can create and assign a task');                                -- 14
select throws_ok($$ update public.tasks set status = 'done'
                    where id = '11111111-1111-1111-1111-111111111111' $$,
                 '42501', 'not allowed to edit this task',
                 'member cannot complete a task assigned to someone else');            -- 15
select throws_ok($$ insert into public.tasks (project_id, title, assigned_to, created_by)
                    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'forged',
                            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
                 '42501', null, 'member cannot create a task as someone else');        -- 16
reset role;

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select lives_ok($$ update public.tasks set status = 'done'
                   where id = '33333333-3333-3333-3333-333333333333' $$,
                'assignee can mark their task done');                                  -- 17
select throws_ok($$ update public.tasks set title = 'renamed'
                    where id = '33333333-3333-3333-3333-333333333333' $$,
                 '42501', 'not allowed to edit this task',
                 'assignee cannot edit a task someone else created');                  -- 18
delete from public.tasks where id = '33333333-3333-3333-3333-333333333333';
reset role;
select is((select count(*)::int from public.tasks where id = '33333333-3333-3333-3333-333333333333'),
          1, 'assignee delete of someone else''s task is silently blocked');           -- 19

-- ─── Profiles: nobody can promote themselves ──────────────────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
update public.profiles set role = 'lead' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
reset role;
select is((select role from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
          'member', 'member cannot promote themselves to lead');                       -- 20

-- ─── Ownership columns can't be reassigned by the owner ───────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select throws_ok($$ update public.findings set author_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
                    where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff' $$,
                 '42501', 'ownership cannot be changed',
                 'author cannot pin their finding on someone else');                   -- 21
reset role;
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
set local role authenticated;
select throws_ok($$ update public.tasks set created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
                    where id = '33333333-3333-3333-3333-333333333333' $$,
                 '42501', 'ownership cannot be changed',
                 'creator cannot reassign who created a task');                        -- 22
reset role;

select * from finish();
rollback;
