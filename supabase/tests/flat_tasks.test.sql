-- Flat-team task lifecycle tests (pgTAP): set_task_status + tasks_guard + set_done_at.
-- Rows in specific statuses are set up as admin (no role): the admin path bypasses the guards.
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2222222-2222-2222-2222-222222222222', 'ta@pgtap.local', '{"display_name":"A"}'),
  ('b2222222-2222-2222-2222-222222222222', 'tb@pgtap.local', '{"display_name":"B"}'),
  ('c2222222-2222-2222-2222-222222222222', 'tc@pgtap.local', '{"display_name":"C"}');

-- T1 todo (no review)            T2 in_progress (review)
-- T3 waiting, submitted by c, done_at fixed     T4 waiting, submitted by c
-- T5 waiting, submitted by c     T6 done (submitted c, approved b)
-- T7 in_progress (review), note 'old'
insert into public.tasks (id, title, assigned_to, created_by, status, needs_review, submitted_by, approved_by, done_at, submission_note) values
  ('f2222222-0000-0000-0000-000000000001', 'T1', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'todo', false, null, null, null, null),
  ('f2222222-0000-0000-0000-000000000002', 'T2', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'in_progress', true, null, null, null, null),
  ('f2222222-0000-0000-0000-000000000003', 'T3', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'waiting_for_review', true, 'c2222222-2222-2222-2222-222222222222', null, '2026-01-01 00:00:00+00', null),
  ('f2222222-0000-0000-0000-000000000004', 'T4', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'waiting_for_review', true, 'c2222222-2222-2222-2222-222222222222', null, null, null),
  ('f2222222-0000-0000-0000-000000000005', 'T5', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'waiting_for_review', true, 'c2222222-2222-2222-2222-222222222222', null, null, null),
  ('f2222222-0000-0000-0000-000000000006', 'T6', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'done', true, 'c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', null, null),
  ('f2222222-0000-0000-0000-000000000008', 'T8', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'in_progress', false, null, null, null, null),
  ('f2222222-0000-0000-0000-000000000007', 'T7', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'in_progress', true, null, null, null, 'old');

-- ─── A: plain moves and blocking (T1) ─────────────────────────────────────────
select pg_temp.login_as('a2222222-2222-2222-2222-222222222222');
set local role authenticated;
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'in_progress') $$,
  't_start_stop: todo -> in_progress');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'todo') $$,
  't_start_stop: in_progress -> todo');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'in_progress') $$,
  't_start_stop: and back to in_progress');
select throws_ok($$ update public.tasks set status = 'done' where id = 'f2222222-0000-0000-0000-000000000001' $$,
  '42501', null, 't_start_stop: direct status update rejected');

select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'blocked') $$,
  '22023', 'a reason is required', 't_block_requires_reason: missing reason');
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'blocked', null, '   ') $$,
  '22023', 'a reason is required', 't_block_requires_reason: blank reason');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'blocked', null, '  Waiting on API keys ') $$,
  't_block_requires_reason: blocking with a reason');
select is((select blocked_reason from public.tasks where id = 'f2222222-0000-0000-0000-000000000001'),
  'Waiting on API keys', 't_block_requires_reason: reason stored trimmed');

select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'in_progress') $$,
  't_unblock_clears_reason: blocked -> in_progress');
select is((select blocked_reason from public.tasks where id = 'f2222222-0000-0000-0000-000000000001'),
  null, 't_unblock_clears_reason: reason cleared');

-- blocked -> todo works and done_at stays null while blocked (T8, admin-made in_progress)
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000008', 'blocked', null, 'Needs design') $$,
  't_block_then_todo: in_progress -> blocked');
select is((select done_at from public.tasks where id = 'f2222222-0000-0000-0000-000000000008'),
  null, 't_block_then_todo: done_at null while blocked');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000008', 'todo') $$,
  't_block_then_todo: blocked -> todo');
select ok((select blocked_reason is null and status = 'todo' from public.tasks where id = 'f2222222-0000-0000-0000-000000000008'),
  't_block_then_todo: back to todo with the reason cleared');

-- ─── B: finishing (T1 no review, T2 review) ───────────────────────────────────
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'waiting_for_review') $$,
  '42501', 'not allowed from in_progress to waiting_for_review', 't_finish_no_review_goes_done: -> waiting_for_review refused');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'done') $$,
  't_finish_no_review_goes_done: -> done');
select isnt((select done_at from public.tasks where id = 'f2222222-0000-0000-0000-000000000001'),
  null, 't_finish_no_review_goes_done: done_at set');
reset role;

select pg_temp.login_as('c2222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000002', 'done') $$,
  '42501', 'not allowed from in_progress to done', 't_finish_with_review_goes_waiting: -> done refused');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000002', 'waiting_for_review') $$,
  't_finish_with_review_goes_waiting: -> waiting_for_review');
select is((select submitted_by from public.tasks where id = 'f2222222-0000-0000-0000-000000000002'),
  'c2222222-2222-2222-2222-222222222222'::uuid, 't_finish_with_review_goes_waiting: submitted_by is the caller');

-- t_submitter_cannot_approve
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000002', 'done') $$,
  '42501', 'you can''t approve work you submitted', 't_submitter_cannot_approve');

-- t_reassign_then_approve / t_untick_review_while_waiting
select throws_ok($$ update public.tasks set assigned_to = 'b2222222-2222-2222-2222-222222222222' where id = 'f2222222-0000-0000-0000-000000000002' $$,
  '42501', 'can''t change review or assignee while waiting for review', 't_reassign_then_approve: reassigning while waiting is refused');
select throws_ok($$ update public.tasks set needs_review = false where id = 'f2222222-0000-0000-0000-000000000002' $$,
  '42501', 'can''t change review or assignee while waiting for review', 't_untick_review_while_waiting: refused');
reset role;

-- t_other_approves
select pg_temp.login_as('b2222222-2222-2222-2222-222222222222');
set local role authenticated;
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000002', 'done') $$,
  't_other_approves: someone else approves');
select is((select approved_by from public.tasks where id = 'f2222222-0000-0000-0000-000000000002'),
  'b2222222-2222-2222-2222-222222222222'::uuid, 't_other_approves: approved_by is the caller');

-- t_done_at_kept_through_approval (T3 waiting, done_at 2026-01-01)
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000003', 'done') $$,
  't_done_at_kept_through_approval: approve T3');
select is((select done_at from public.tasks where id = 'f2222222-0000-0000-0000-000000000003'),
  '2026-01-01 00:00:00+00'::timestamptz, 't_done_at_kept_through_approval: done_at unchanged');
reset role;

-- t_withdraw_without_comment_by_submitter (T4): c withdraws without a comment
select pg_temp.login_as('c2222222-2222-2222-2222-222222222222');
set local role authenticated;
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000004', 'in_progress') $$,
  't_withdraw_without_comment_by_submitter: submitter withdraws without a comment');
select is((select submitted_by from public.tasks where id = 'f2222222-0000-0000-0000-000000000004'),
  null, 't_withdraw_without_comment_by_submitter: submitted_by cleared');
reset role;

-- t_request_changes_needs_comment_by_other (T5)
select pg_temp.login_as('b2222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000005', 'in_progress') $$,
  '22023', 'a comment is required', 't_request_changes_needs_comment_by_other: no comment refused');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000005', 'in_progress', 'Please add tests') $$,
  't_request_changes_needs_comment_by_other: with a comment');
select is((select count(*)::int from public.comments
           where task_id = 'f2222222-0000-0000-0000-000000000005' and author_id = 'b2222222-2222-2222-2222-222222222222'),
  1, 't_request_changes_needs_comment_by_other: comment stored');
select is((select done_at from public.tasks where id = 'f2222222-0000-0000-0000-000000000005'),
  null, 't_request_changes_needs_comment_by_other: done_at null');

-- t_reopen_needs_comment_and_clears_done_at (T6 done)
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000006', 'in_progress') $$,
  '22023', 'a comment is required', 't_reopen_needs_comment_and_clears_done_at: no comment refused');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000006', 'in_progress', 'Found a regression') $$,
  't_reopen_needs_comment_and_clears_done_at: reopen with a comment');
select ok((select done_at is null and submitted_by is null and approved_by is null
           from public.tasks where id = 'f2222222-0000-0000-0000-000000000006'),
  't_reopen_needs_comment_and_clears_done_at: done_at, submitted_by, approved_by cleared');
reset role;

-- t_note_with_finish_is_atomic (T7: in_progress, review on, note 'old')
select pg_temp.login_as('c2222222-2222-2222-2222-222222222222');
set local role authenticated;
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000007', 'done', null, null, 'new') $$,
  '42501', 'not allowed from in_progress to done', 't_note_with_finish_is_atomic: refused transition');
select is((select submission_note from public.tasks where id = 'f2222222-0000-0000-0000-000000000007'),
  'old', 't_note_with_finish_is_atomic: note unchanged after refusal');
select lives_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000007', 'waiting_for_review', null, null, 'new') $$,
  't_note_with_finish_is_atomic: allowed transition');
select is((select submission_note from public.tasks where id = 'f2222222-0000-0000-0000-000000000007'),
  'new', 't_note_with_finish_is_atomic: note saved with the status');

-- t_client_cannot_set_approved_by (T7, waiting; the update runs but the protected columns are restored)
select lives_ok($$ update public.tasks set approved_by = 'c2222222-2222-2222-2222-222222222222', submitted_by = null
                   where id = 'f2222222-0000-0000-0000-000000000007' $$,
  't_client_cannot_set_approved_by: the update runs');
select ok((select approved_by is null and submitted_by = 'c2222222-2222-2222-2222-222222222222'
           from public.tasks where id = 'f2222222-0000-0000-0000-000000000007'),
  't_client_cannot_set_approved_by: approved_by / submitted_by did not change');

-- direct client update of done_at is ignored (T7 is waiting; done_at was stamped by the transition)
select lives_ok($$ update public.tasks set done_at = '2000-01-01 00:00:00+00' where id = 'f2222222-0000-0000-0000-000000000007' $$,
  't_client_cannot_set_done_at: the update runs');
select isnt((select done_at from public.tasks where id = 'f2222222-0000-0000-0000-000000000007'),
  '2000-01-01 00:00:00+00'::timestamptz, 't_client_cannot_set_done_at: done_at not taken from the client');

-- a refused RPC with a comment leaves no comment (T1 is done: done -> todo is not allowed)
select throws_ok($$ select public.set_task_status('f2222222-0000-0000-0000-000000000001', 'todo', 'sneaky') $$,
  '42501', 'not allowed from done to todo', 't_refused_leaves_no_comment: refused');
select is((select count(*)::int from public.comments where task_id = 'f2222222-0000-0000-0000-000000000001'),
  0, 't_refused_leaves_no_comment: no comment left behind');

-- t_insert_cannot_forge_attribution
select lives_ok($$ insert into public.tasks (id, title, assigned_to, created_by, submitted_by, approved_by, done_at)
                   values ('f2222222-0000-0000-0000-000000000009', 'Forged', 'c2222222-2222-2222-2222-222222222222',
                           'c2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222',
                           'b2222222-2222-2222-2222-222222222222', now()) $$,
  't_insert_cannot_forge_attribution: the insert runs');
select ok((select submitted_by is null and approved_by is null and done_at is null
           from public.tasks where id = 'f2222222-0000-0000-0000-000000000009'),
  't_insert_cannot_forge_attribution: forged submitted_by / approved_by / done_at were nulled');
reset role;

select * from finish();
rollback;
