-- Review flow tests (pgTAP): who may move findings/tasks through the review loop, and comments.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- lead = a…, hedi = b…, khaushik = c…
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');
update public.profiles set role = 'lead' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.projects (id, name, created_by) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pgtap: QA', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
-- f1 = hedi's finding (review loop), f2 = hedi's finding (close/reopen)
insert into public.findings (id, project_id, title, explanation, author_id) values
  ('f1f1f1f1-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Crash', 'x', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  ('f2f2f2f2-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Typo', 'x', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
-- t1 = created by khaushik, assigned to hedi; t2 = assigned to the lead
insert into public.tasks (id, project_id, title, assigned_to, created_by) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Retest', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('a2a2a2a2-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'Lead own', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

-- ─── Findings: members cannot close or review ─────────────────────────────────
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
select throws_ok($$ update public.findings set status = 'approved' where id = 'f1f1f1f1-0000-0000-0000-000000000001' $$,
  '42501', 'not allowed to change this status', 'author cannot close their own finding');                 -- 1
select throws_ok($$ insert into public.findings (project_id, title, explanation, status)
                    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'x', 'x', 'approved') $$,
  '42501', null, 'a new finding cannot start closed');                                                    -- 2
reset role;

select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc'); set local role authenticated;
select throws_ok($$ update public.findings set status = 'approved' where id = 'f2f2f2f2-0000-0000-0000-000000000002' $$,
  '42501', 'not allowed to change this status', 'member cannot close someone else''s finding');            -- 3
select throws_ok($$ select public.request_changes_finding('f1f1f1f1-0000-0000-0000-000000000001', 'redo') $$,
  '42501', null, 'member cannot send a finding back');                                                   -- 4
reset role;
select is((select count(*)::int from public.comments), 0, 'a refused send-back leaves no comment behind'); -- 5

-- ─── Findings: the lead's loop ────────────────────────────────────────────────
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); set local role authenticated;
select lives_ok($$ update public.findings set status = 'approved' where id = 'f2f2f2f2-0000-0000-0000-000000000002' $$,
  'lead closes an open finding');                                                                        -- 6
select lives_ok($$ update public.findings set status = 'submitted' where id = 'f2f2f2f2-0000-0000-0000-000000000002' $$,
  'lead reopens a closed finding');                                                                      -- 7
select throws_ok($$ select public.request_changes_finding('f1f1f1f1-0000-0000-0000-000000000001', '   ') $$,
  '22023', 'a comment is required to request changes', 'requesting changes needs a non-blank comment');             -- 8
select throws_ok($$ update public.findings set status = 'changes_requested' where id = 'f1f1f1f1-0000-0000-0000-000000000001' $$,
  '42501', 'a comment is required to request changes', 'changes_requested cannot be set without request_changes_*()');      -- 9
select lives_ok($$ select public.request_changes_finding('f1f1f1f1-0000-0000-0000-000000000001', 'Need the logs too') $$,
  'lead sends a finding back with a comment');                                                           -- 10
reset role;
select is((select status from public.findings where id = 'f1f1f1f1-0000-0000-0000-000000000001'), 'changes_requested',
  'finding is now changes_requested');                                                                        -- 11
select is((select count(*)::int from public.comments where finding_id = 'f1f1f1f1-0000-0000-0000-000000000001'
           and author_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 1, 'the comment was saved with it');  -- 12

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
select lives_ok($$ insert into public.comments (finding_id, body) values ('f1f1f1f1-0000-0000-0000-000000000001', 'Added logs') $$,
  'author replies in the thread');                                                                       -- 13
select lives_ok($$ update public.findings set status = 'resubmitted' where id = 'f1f1f1f1-0000-0000-0000-000000000001' $$,
  'author marks it fixed');                                                                              -- 14
select throws_ok($$ update public.findings set status = 'approved' where id = 'f1f1f1f1-0000-0000-0000-000000000001' $$,
  '42501', 'not allowed to change this status', 'author cannot approve their own fix');                  -- 15
reset role;

select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); set local role authenticated;
select lives_ok($$ update public.findings set status = 'approved' where id = 'f1f1f1f1-0000-0000-0000-000000000001' $$,
  'lead closes the fixed finding');                                                                      -- 16
reset role;

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
select throws_ok($$ update public.findings set title = 'changed' where id = 'f1f1f1f1-0000-0000-0000-000000000001' $$,
  '42501', 'only the author or lead can edit this finding', 'closed work is frozen for the author');      -- 17
reset role;

-- ─── Comments: who may write ──────────────────────────────────────────────────
select pg_temp.login_as('cccccccc-cccc-cccc-cccc-cccccccccccc'); set local role authenticated;
select throws_ok($$ insert into public.comments (finding_id, body) values ('f2f2f2f2-0000-0000-0000-000000000002', 'hi') $$,
  '42501', null, 'a teammate cannot comment on someone else''s finding');                                -- 18
select lives_ok($$ insert into public.comments (task_id, body) values ('a1a1a1a1-0000-0000-0000-000000000001', 'context') $$,
  'task creator can comment');                                                                          -- 19
select throws_ok($$ insert into public.comments (task_id, body) values ('a1a1a1a1-0000-0000-0000-000000000001', '  ') $$,
  '23514', null, 'blank comments are rejected');                                                        -- 20

-- ─── Tasks ────────────────────────────────────────────────────────────────────
select throws_ok($$ update public.tasks set status = 'submitted' where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  '42501', 'not allowed to change this status', 'creator (not assignee) cannot change status');           -- 21
reset role;

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
select lives_ok($$ update public.tasks set status = 'submitted' where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  'assignee marks done');                                                                               -- 22
select lives_ok($$ update public.tasks set status = 'todo' where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  'assignee can undo done before review');                                                              -- 23
update public.tasks set status = 'submitted' where id = 'a1a1a1a1-0000-0000-0000-000000000001';
select throws_ok($$ update public.tasks set status = 'approved' where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  '42501', 'not allowed to change this status', 'assignee cannot approve');                              -- 24
reset role;

select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); set local role authenticated;
select lives_ok($$ select public.request_changes_task('a1a1a1a1-0000-0000-0000-000000000001', 'Also test Android 14') $$,
  'lead sends a task back');                                                                            -- 25
reset role;

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'); set local role authenticated;
select lives_ok($$ update public.tasks set status = 'resubmitted' where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  'assignee marks the task fixed');                                                                     -- 26
reset role;

select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); set local role authenticated;
select lives_ok($$ update public.tasks set status = 'approved' where id = 'a1a1a1a1-0000-0000-0000-000000000001' $$,
  'lead approves the fixed task');                                                                      -- 27
select lives_ok($$ update public.tasks set status = 'submitted' where id = 'a2a2a2a2-0000-0000-0000-000000000002';
                   update public.tasks set status = 'approved' where id = 'a2a2a2a2-0000-0000-0000-000000000002' $$,
  'lead finishes and approves their own task');                                                         -- 28
reset role;
select isnt((select done_at from public.tasks where id = 'a1a1a1a1-0000-0000-0000-000000000001'), null,
  'done_at survives the review loop and approval');                                                     -- 29

-- ─── Project counts: "open" = not finished ────────────────────────────────────
-- f1 closed, f2 open → 1 open finding; t1 approved, t2 approved → 0 open tasks
select is((select open_findings from public.project_summaries where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 1,
  'open findings = not closed');                                                                         -- 30
-- Admin path: clear the "logged in user" claims (reset role alone keeps them) so auth.uid() is null.
select set_config('request.jwt.claims', '', true);
update public.tasks set status = 'submitted' where id = 'a1a1a1a1-0000-0000-0000-000000000001';
select is((select open_tasks from public.project_summaries where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 1,
  'a done (unreviewed) task still counts as open');                                                       -- 31

select * from finish();
rollback;
