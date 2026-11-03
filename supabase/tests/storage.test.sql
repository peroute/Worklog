-- Storage tests (pgTAP): the screenshot bucket is private and uploads need an existing finding folder.
-- Deletes are covered by the integration tests (Supabase blocks direct SQL deletes on
-- storage.objects; they must go through the Storage API).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}');

insert into public.projects (id, name, created_by) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pgtap: Mobile App QA', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into public.findings (id, project_id, title, explanation, author_id) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Hedi finding', 'x', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- 1-2: bucket exists and is private
select is((select count(*)::int from storage.buckets where id = 'finding-images'), 1,
          'finding-images bucket exists');
select is((select public from storage.buckets where id = 'finding-images'), false,
          'finding-images bucket is private');

select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
-- 3: existing finding folder → allowed
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('finding-images', 'findings/ffffffff-ffff-ffff-ffff-ffffffffffff/a.webp') $$,
                'can upload into an existing finding''s folder');
-- 4: folder of a finding that does not exist → denied
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('finding-images', 'findings/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/a.webp') $$,
                 '42501', null, 'cannot upload into a folder with no finding behind it');
reset role;

select * from finish();
rollback;
