-- Flat-team NEW markers tests (pgTAP): item_reads, mark_seen(), unseen_items().
-- now() is frozen inside a transaction, so timestamps are set explicitly by the admin.
-- Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Is the item in my unseen list?
create function pg_temp.is_new(t text, i uuid) returns boolean language sql as $$
  select exists (select 1 from public.unseen_items() u where u.item_type = t and u.item_id = i);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5555555-5555-5555-5555-555555555555', 'ra@pgtap.local', '{"display_name":"A"}'),
  ('b5555555-5555-5555-5555-555555555555', 'rb@pgtap.local', '{"display_name":"B"}');

insert into public.projects (id, name, created_by) values
  ('d5555555-0000-0000-0000-000000000001', 'pgtap reads p1', 'a5555555-5555-5555-5555-555555555555');

-- t1 own: A created it, A commented, nobody else touched it, never opened.
-- t2 comment / t3 status: A created, A opened an hour ago, B acted afterwards.
-- t4 never: B created, A never opened.  t5: like t4 but soft-deleted.
insert into public.tasks (id, project_id, title, assigned_to, created_by) values
  ('f5555555-0000-0000-0000-000000000001', 'd5555555-0000-0000-0000-000000000001', 'own',
   'a5555555-5555-5555-5555-555555555555', 'a5555555-5555-5555-5555-555555555555'),
  ('f5555555-0000-0000-0000-000000000002', 'd5555555-0000-0000-0000-000000000001', 'comment',
   'a5555555-5555-5555-5555-555555555555', 'a5555555-5555-5555-5555-555555555555'),
  ('f5555555-0000-0000-0000-000000000003', 'd5555555-0000-0000-0000-000000000001', 'status',
   'a5555555-5555-5555-5555-555555555555', 'a5555555-5555-5555-5555-555555555555'),
  ('f5555555-0000-0000-0000-000000000004', 'd5555555-0000-0000-0000-000000000001', 'never',
   'b5555555-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555'),
  ('f5555555-0000-0000-0000-000000000005', 'd5555555-0000-0000-0000-000000000001', 'deleted',
   'b5555555-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555');
insert into public.findings (id, project_id, title, explanation, author_id) values
  ('e5555555-0000-0000-0000-000000000001', 'd5555555-0000-0000-0000-000000000001', 'F never', 'x',
   'b5555555-5555-5555-5555-555555555555');

-- Attribute the "created" rows to the right people and age them (admin can write activity).
update public.activity set created_at = now() - interval '2 hours',
  actor_id = 'a5555555-5555-5555-5555-555555555555'
  where task_id in ('f5555555-0000-0000-0000-000000000001', 'f5555555-0000-0000-0000-000000000002',
                    'f5555555-0000-0000-0000-000000000003');
update public.activity set created_at = now() - interval '2 hours',
  actor_id = 'b5555555-5555-5555-5555-555555555555'
  where task_id in ('f5555555-0000-0000-0000-000000000004', 'f5555555-0000-0000-0000-000000000005')
     or finding_id = 'e5555555-0000-0000-0000-000000000001';

-- A opened t2 and t3 an hour ago.
insert into public.item_reads (user_id, item_type, item_id, last_seen_at) values
  ('a5555555-5555-5555-5555-555555555555', 'task', 'f5555555-0000-0000-0000-000000000002', now() - interval '1 hour'),
  ('a5555555-5555-5555-5555-555555555555', 'task', 'f5555555-0000-0000-0000-000000000003', now() - interval '1 hour');

-- A's own comment on t1; B's comment on t2; B's status change on t3.
insert into public.comments (task_id, author_id, body, created_at) values
  ('f5555555-0000-0000-0000-000000000001', 'a5555555-5555-5555-5555-555555555555', 'mine', now()),
  ('f5555555-0000-0000-0000-000000000002', 'b5555555-5555-5555-5555-555555555555', 'theirs', now());
insert into public.activity (task_id, actor_id, action, details, created_at) values
  ('f5555555-0000-0000-0000-000000000003', 'b5555555-5555-5555-5555-555555555555', 'status_changed',
   '{"from":"todo","to":"in_progress"}', now());
-- B's read row, to prove A can't see it.
insert into public.item_reads (user_id, item_type, item_id, last_seen_at) values
  ('b5555555-5555-5555-5555-555555555555', 'task', 'f5555555-0000-0000-0000-000000000004', now());

-- Extra fixtures: t6 lives in a soft-deleted project (B created); t7 gets an admin (null actor) change
-- after A opened it; f2 is A's finding that B commented on.
insert into public.projects (id, name, created_by, deleted_at) values
  ('d5555555-0000-0000-0000-000000000002', 'pgtap reads gone', 'b5555555-5555-5555-5555-555555555555', now());
insert into public.tasks (id, project_id, title, assigned_to, created_by) values
  ('f5555555-0000-0000-0000-000000000006', 'd5555555-0000-0000-0000-000000000002', 'in dead project',
   'b5555555-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555'),
  ('f5555555-0000-0000-0000-000000000007', 'd5555555-0000-0000-0000-000000000001', 'admin touched',
   'a5555555-5555-5555-5555-555555555555', 'a5555555-5555-5555-5555-555555555555');
insert into public.findings (id, project_id, title, explanation, author_id) values
  ('e5555555-0000-0000-0000-000000000002', 'd5555555-0000-0000-0000-000000000001', 'F mine', 'x',
   'a5555555-5555-5555-5555-555555555555');
update public.activity set created_at = now() - interval '2 hours'
  where task_id in ('f5555555-0000-0000-0000-000000000006', 'f5555555-0000-0000-0000-000000000007')
     or finding_id = 'e5555555-0000-0000-0000-000000000002';
update public.activity set actor_id = 'b5555555-5555-5555-5555-555555555555'
  where task_id = 'f5555555-0000-0000-0000-000000000006';
update public.activity set actor_id = 'a5555555-5555-5555-5555-555555555555'
  where task_id = 'f5555555-0000-0000-0000-000000000007'
     or finding_id = 'e5555555-0000-0000-0000-000000000002';
insert into public.item_reads (user_id, item_type, item_id, last_seen_at) values
  ('a5555555-5555-5555-5555-555555555555', 'task', 'f5555555-0000-0000-0000-000000000007', now() - interval '1 hour'),
  ('a5555555-5555-5555-5555-555555555555', 'finding', 'e5555555-0000-0000-0000-000000000002', now() - interval '1 hour');
insert into public.activity (task_id, actor_id, action, details, created_at) values
  ('f5555555-0000-0000-0000-000000000007', null, 'edited', '{}', now());
insert into public.comments (finding_id, author_id, body, created_at) values
  ('e5555555-0000-0000-0000-000000000002', 'b5555555-5555-5555-5555-555555555555', 'on your finding', now());

-- Soft-delete t5 (admin).
update public.tasks set deleted_at = now() where id = 'f5555555-0000-0000-0000-000000000005';

select pg_temp.login_as('a5555555-5555-5555-5555-555555555555');
set local role authenticated;

select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000001'), false,
  'own_actions_not_new: my own item and comment do not light up');
select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000002'), true,
  'others_comment_is_new: B commented after I last looked');
select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000003'), true,
  'others_status_change_is_new: B changed the status after I last looked');
select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000004'), true,
  'never_opened_created_by_other_is_new: task');
select is(pg_temp.is_new('finding', 'e5555555-0000-0000-0000-000000000001'), true,
  'never_opened_created_by_other_is_new: finding');
select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000005'), false,
  'deleted_items_excluded: a soft-deleted item is never NEW');

-- mark_seen clears, and is an upsert.
select lives_ok($$select public.mark_seen('task', 'f5555555-0000-0000-0000-000000000002')$$, 'mark_seen runs');
select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000002'), false,
  'mark_seen_clears: opened item is no longer NEW');
select lives_ok($$select public.mark_seen('task', 'f5555555-0000-0000-0000-000000000002')$$,
  'mark_seen_clears: calling it again is an upsert, not a conflict');
select is((select count(*) from public.item_reads
           where item_id = 'f5555555-0000-0000-0000-000000000002'), 1::bigint,
  'mark_seen_clears: still one row');
select throws_ok($$select public.mark_seen('project', 'f5555555-0000-0000-0000-000000000002')$$,
  '23514', null, 'mark_seen refuses an invalid type');

-- Privacy of read rows.
select is((select count(*) from public.item_reads where user_id = 'b5555555-5555-5555-5555-555555555555'),
  0::bigint, 'cannot_read_others_reads: B''s rows are invisible to A');
select throws_ok($$insert into public.item_reads (user_id, item_type, item_id, last_seen_at)
  values ('b5555555-5555-5555-5555-555555555555', 'task', 'f5555555-0000-0000-0000-000000000001', now())$$,
  '42501', null, 'cannot_read_others_reads: A cannot write a row for B');
select throws_ok($$delete from public.item_reads$$, '42501', null,
  'item_reads: no delete privilege');

select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000006'), false,
  'deleted_items_excluded: an item under a soft-deleted project is never NEW');
select is(pg_temp.is_new('task', 'f5555555-0000-0000-0000-000000000007'), true,
  'admin_change_is_new: a null-actor (admin) change counts as someone else');
select is(pg_temp.is_new('finding', 'e5555555-0000-0000-0000-000000000002'), true,
  'others_comment_is_new: B commented on my finding');

-- mark_seen ignores ids that match no item.
select lives_ok($$select public.mark_seen('task', '99999999-9999-9999-9999-999999999999')$$,
  'mark_seen: unknown id does not error');
select is((select count(*) from public.item_reads where item_id = '99999999-9999-9999-9999-999999999999'),
  0::bigint, 'mark_seen: unknown id leaves no junk row');

-- A cannot touch B's read row.
create function pg_temp.update_b_reads() returns bigint language plpgsql as $$
declare n bigint;
begin
  update public.item_reads set last_seen_at = now() where user_id = 'b5555555-5555-5555-5555-555555555555';
  get diagnostics n = row_count;
  return n;
end;
$$;
select is(pg_temp.update_b_reads(), 0::bigint, 'cannot_read_others_reads: A updating B''s row affects 0 rows');

-- Comment timestamps are server-controlled.
insert into public.comments (id, task_id, body, created_at)
  values ('c5555555-0000-0000-0000-000000000001', 'f5555555-0000-0000-0000-000000000001', 'forged', '2099-01-01');
select is((select created_at from public.comments where id = 'c5555555-0000-0000-0000-000000000001'), now(),
  'comment_created_at_forced: a forged future created_at on insert is replaced by now()');
update public.comments set created_at = '2099-01-01' where id = 'c5555555-0000-0000-0000-000000000001';
select is((select created_at from public.comments where id = 'c5555555-0000-0000-0000-000000000001'), now(),
  'comment_created_at_forced: updating created_at is ignored');

reset role;
select is(has_function_privilege('anon', 'public.unseen_items()', 'execute'), false,
  'anon cannot run unseen_items');

select * from finish();
rollback;
