-- Flat-team finding lifecycle tests (pgTAP): set_finding_status + findings_guard.
-- Users a/b/c are equals. b reports, c fixes, etc. Rows in specific statuses are set up as admin
-- (no role), because the admin path bypasses the guards.
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-1111-1111-1111-111111111111', 'fa@pgtap.local', '{"display_name":"A"}'),
  ('b1111111-1111-1111-1111-111111111111', 'fb@pgtap.local', '{"display_name":"B"}'),
  ('c1111111-1111-1111-1111-111111111111', 'fc@pgtap.local', '{"display_name":"C"}');

insert into public.projects (id, name, created_by) values
  ('d1111111-0000-0000-0000-000000000001', 'pgtap: findings', 'a1111111-1111-1111-1111-111111111111');

-- F1 open (b's), F2 open (b's), F3 needs_info, F4 fixed by c, F5 open
insert into public.findings (id, project_id, title, explanation, author_id, status, fixed_by) values
  ('e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', 'F1', 'x', 'b1111111-1111-1111-1111-111111111111', 'open', null),
  ('e1111111-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000001', 'F2', 'x', 'b1111111-1111-1111-1111-111111111111', 'open', null),
  ('e1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000001', 'F3', 'x', 'b1111111-1111-1111-1111-111111111111', 'needs_info', null),
  ('e1111111-0000-0000-0000-000000000004', 'd1111111-0000-0000-0000-000000000001', 'F4', 'x', 'b1111111-1111-1111-1111-111111111111', 'fixed', 'c1111111-1111-1111-1111-111111111111'),
  ('e1111111-0000-0000-0000-000000000005', 'd1111111-0000-0000-0000-000000000001', 'F5', 'x', 'b1111111-1111-1111-1111-111111111111', 'open', null);

-- f_anyone_marks_fixed: c (not the reporter) marks F1 fixed
select pg_temp.login_as('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000001', 'fixed') $$,
  'f_anyone_marks_fixed: anyone can mark a finding fixed');
select is((select fixed_by from public.findings where id = 'e1111111-0000-0000-0000-000000000001'),
  'c1111111-1111-1111-1111-111111111111'::uuid, 'f_anyone_marks_fixed: fixed_by is the caller');

-- f_fixer_cannot_verify
select throws_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000001', 'verified') $$,
  '42501', 'you can''t verify your own fix', 'f_fixer_cannot_verify: the fixer cannot verify');
reset role;

-- f_reporter_verifies
select pg_temp.login_as('b1111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000001', 'verified') $$,
  'f_reporter_verifies: someone else can verify');
select is((select status from public.findings where id = 'e1111111-0000-0000-0000-000000000001'),
  'verified', 'f_reporter_verifies: status is verified');
reset role;

-- f_stale_transition: verified -> fixed is not in the table
select pg_temp.login_as('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000001', 'fixed') $$,
  '42501', 'not allowed from verified to fixed', 'f_stale_transition: verified -> fixed is refused');
select throws_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000001', 'fixed', 'late') $$,
  '42501', 'not allowed from verified to fixed', 'f_stale_transition: still refused with a comment');

-- f_refused_leaves_no_comment
select is((select count(*)::int from public.comments where finding_id = 'e1111111-0000-0000-0000-000000000001'),
  0, 'f_refused_leaves_no_comment: refused transition left no comment');

-- f_needs_info_requires_comment
select throws_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000002', 'needs_info', '   ') $$,
  '22023', 'a comment is required', 'f_needs_info_requires_comment: blank comment rejected');
select throws_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000002', 'needs_info') $$,
  '22023', 'a comment is required', 'f_needs_info_requires_comment: missing comment rejected');
select throws_ok($$ update public.findings set status = 'needs_info' where id = 'e1111111-0000-0000-0000-000000000002' $$,
  '42501', null, 'f_needs_info_requires_comment: direct status update rejected');
select is((select status from public.findings where id = 'e1111111-0000-0000-0000-000000000002'),
  'open', 'f_needs_info_requires_comment: F2 still open');
reset role;

-- f_reply_reopens: F3 needs_info -> open with a comment
select pg_temp.login_as('b1111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000003', 'open', 'It is the login page') $$,
  'f_reply_reopens: needs_info -> open with a comment');
select is((select count(*)::int from public.comments
           where finding_id = 'e1111111-0000-0000-0000-000000000003'
             and author_id = 'b1111111-1111-1111-1111-111111111111' and body = 'It is the login page'),
  1, 'f_reply_reopens: comment row exists, authored by the caller');
reset role;

-- f_still_broken_clears_fixed_by: F4 fixed (by c) -> open
select pg_temp.login_as('a1111111-1111-1111-1111-111111111111');
set local role authenticated;
select throws_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000004', 'open') $$,
  '22023', 'a comment is required', 'f_still_broken_clears_fixed_by: needs a comment');
select lives_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000004', 'open', 'Still broken') $$,
  'f_still_broken_clears_fixed_by: reopen with a comment');
select is((select fixed_by from public.findings where id = 'e1111111-0000-0000-0000-000000000004'),
  null, 'f_still_broken_clears_fixed_by: fixed_by cleared');

-- f_not_a_bug_then_reopen: F5
select lives_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000005', 'not_a_bug', 'Works as designed') $$,
  'f_not_a_bug_then_reopen: open -> not_a_bug with a comment');
select is((select status from public.findings where id = 'e1111111-0000-0000-0000-000000000005'),
  'not_a_bug', 'f_not_a_bug_then_reopen: status is not_a_bug');
select lives_ok($$ select public.set_finding_status('e1111111-0000-0000-0000-000000000005', 'open', 'Actually it is a bug') $$,
  'f_not_a_bug_then_reopen: not_a_bug -> open with a comment');
select is((select status from public.findings where id = 'e1111111-0000-0000-0000-000000000005'),
  'open', 'f_not_a_bug_then_reopen: status is open again');
reset role;

-- f_anyone_edits_content + f_author_immutable + f_client_cannot_set_fixed_by (on open F2)
select pg_temp.login_as('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
select lives_ok($$ update public.findings set title = 'Edited by C' where id = 'e1111111-0000-0000-0000-000000000002' $$,
  'f_anyone_edits_content: c edits b''s finding');
select throws_ok($$ update public.findings set author_id = 'c1111111-1111-1111-1111-111111111111' where id = 'e1111111-0000-0000-0000-000000000002' $$,
  '42501', 'ownership cannot be changed', 'f_author_immutable: author_id cannot change');
select lives_ok($$ update public.findings set fixed_by = 'c1111111-1111-1111-1111-111111111111' where id = 'e1111111-0000-0000-0000-000000000002' $$,
  'f_client_cannot_set_fixed_by: the update runs');
select is((select fixed_by from public.findings where id = 'e1111111-0000-0000-0000-000000000002'),
  null, 'f_client_cannot_set_fixed_by: but fixed_by did not change');

-- f_insert_cannot_forge_fixed_by
select lives_ok($$ insert into public.findings (id, project_id, title, explanation, author_id, fixed_by)
                   values ('e1111111-0000-0000-0000-000000000009', 'd1111111-0000-0000-0000-000000000001', 'Forged', 'x',
                           'c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111') $$,
  'f_insert_cannot_forge_fixed_by: the insert runs');
select is((select fixed_by from public.findings where id = 'e1111111-0000-0000-0000-000000000009'),
  null, 'f_insert_cannot_forge_fixed_by: forged fixed_by was nulled');
reset role;

select * from finish();
rollback;
