-- Screenshot storage (spec §8). Private bucket; files at findings/<finding_id>/<uuid>.<ext>.
-- Server-side limits back up the client-side compression: images only, max 2 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finding-images', 'finding-images', false, 2097152, array['image/webp', 'image/jpeg', 'image/png']);

-- Folder layout: (storage.foldername(name))[1] = 'findings', [2] = finding id as text.
-- Comparing as text (not ::uuid) so a malformed path is simply denied instead of erroring.

create policy "team can view finding images" on storage.objects
  for select to authenticated
  using (bucket_id = 'finding-images');

create policy "author or lead can upload finding images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'finding-images'
    and (storage.foldername(name))[1] = 'findings'
    and exists (
      select 1 from public.findings f
      where f.id::text = (storage.foldername(name))[2]
        and (f.author_id = auth.uid() or public.is_lead())
    )
  );

-- Delete: author or lead while the finding exists; anyone on the team once it is gone.
-- The app deletes DB rows first (where permissions are enforced), then the files —
-- so by then the files are orphans and this policy lets the cleanup through.
create policy "author, lead, or orphan cleanup can delete finding images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'finding-images'
    and (
      public.is_lead()
      or exists (
        select 1 from public.findings f
        where f.id::text = (storage.foldername(name))[2] and f.author_id = auth.uid()
      )
      or not exists (
        select 1 from public.findings f
        where f.id::text = (storage.foldername(name))[2]
      )
    )
  );
