-- Storage tests (pgTAP): the screenshot bucket is private and uploads follow finding ownership.
-- Deletes are covered by the integration tests (Supabase blocks direct SQL deletes on
-- storage.objects; they must go through the Storage API).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

create function pg_temp.login_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
                    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lead@pgtap.local', '{"display_name":"Lead"}'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'hedi@pgtap.local', '{"display_name":"Hedi"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'khaushik@pgtap.local', '{"display_name":"Khaushik"}');
update public.profiles set role = 'lead' where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

insert into public.projects (id, name, created_by) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'pgtap: Mobile App QA', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.findings (id, project_id, title, explanation, author_id) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Khaushik finding', 'x', 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'Hedi finding', 'x', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- 1-2: bucket exists and is private
select is((select count(*)::int from storage.buckets where id = 'finding-images'), 1,
          'finding-images bucket exists');
select is((select public from storage.buckets where id = 'finding-images'), false,
          'finding-images bucket is private');

-- 3: own finding folder → allowed
select pg_temp.login_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('finding-images', 'findings/ffffffff-ffff-ffff-ffff-ffffffffffff/a.webp') $$,
                'member can upload into their own finding''s folder');
-- 4: someone else's finding folder → denied
select throws_ok($$ insert into storage.objects (bucket_id, name)
                    values ('finding-images', 'findings/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/a.webp') $$,
                 '42501', null, 'member cannot upload into someone else''s finding folder');
reset role;

-- 5: lead may upload into anyone's finding folder
select pg_temp.login_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name)
                   values ('finding-images', 'findings/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee/b.webp') $$,
                'lead can upload into any finding''s folder');
reset role;

select * from finish();
rollback;
