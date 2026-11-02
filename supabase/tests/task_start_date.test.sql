-- Task start day (pgTAP). Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
values ('51111111-1111-1111-1111-111111111111', 'start@pgtap.local', '{"display_name":"Start"}');

select has_column('public', 'tasks', 'start_date', 'tasks have a start_date column');

select lives_ok(
  $$ insert into public.tasks (title, assigned_to, created_by)
     values ('No start day', '51111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111') $$,
  'start_date is optional'
);

select lives_ok(
  $$ insert into public.tasks (title, assigned_to, created_by, start_date, deadline)
     values ('Same day', '51111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111',
             '2026-11-03', '2026-11-03') $$,
  'a deadline on the start day is allowed'
);

select throws_ok(
  $$ insert into public.tasks (title, assigned_to, created_by, start_date, deadline)
     values ('Backwards', '51111111-1111-1111-1111-111111111111', '51111111-1111-1111-1111-111111111111',
             '2026-11-03', '2026-11-02') $$,
  '23514',
  null,
  'a deadline before the start day is rejected'
);

select * from finish();
rollback;
