-- Task attachments: screenshots + common documents on a task (the "assignment brief").
-- Same shape as finding screenshots (row in a table + file in a private bucket), but:
--   * keeps the original file name / type / size, because these are shown and downloaded;
--   * allows common document types, up to 10 MB each, max 10 per task;
--   * edit rights follow the task: the lead, or the creator until the task is approved.
-- Files live at tasks/<task_id>/<uuid>.<ext> in the 'task-attachments' bucket.

-- ─── Who may change a task's attachments? ────────────────────────────────────
-- Mirrors tasks_guard's content rule. Takes text so storage policies can pass a folder name;
-- a malformed id simply matches no task (denied) instead of raising a cast error.
create function public.can_edit_task_content(p_task_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id::text = p_task_id
      and (public.is_lead() or (t.created_by = auth.uid() and t.status <> 'approved'))
  );
$$;

revoke execute on function public.can_edit_task_content(text) from anon;

-- ─── Table ───────────────────────────────────────────────────────────────────
create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  -- Path inside the bucket. Never a URL: URLs are signed on demand and expire.
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 255),
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes between 0 and 10485760),
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create index task_attachments_task_id_idx on public.task_attachments (task_id, position);

-- Server-side cap, so the 10-file limit can't be bypassed by calling the API directly.
create function public.task_attachments_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.task_attachments where task_id = new.task_id) >= 10 then
    raise exception 'a task can have at most 10 attachments' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger task_attachments_limit
  before insert on public.task_attachments
  for each row execute function public.task_attachments_limit();

-- ─── Row level security ──────────────────────────────────────────────────────
revoke all on public.task_attachments from anon;
alter table public.task_attachments enable row level security;

create policy "team can read task attachments" on public.task_attachments
  for select to authenticated using (true);
create policy "task editors can add attachments" on public.task_attachments
  for insert to authenticated with check (public.can_edit_task_content(task_id::text));
create policy "task editors can remove attachments" on public.task_attachments
  for delete to authenticated using (public.can_edit_task_content(task_id::text));

-- ─── Storage bucket ──────────────────────────────────────────────────────────
-- The type allowlist is checked against the Content-Type the client sends, so it's a
-- guard rail, not proof of what's inside. That's why the app downloads documents
-- (Content-Disposition: attachment) instead of opening them in the page.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-attachments', 'task-attachments', false, 10485760,
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip'
  ]
);

-- (storage.foldername(name))[1] = 'tasks', [2] = task id as text.
create policy "team can view task attachments" on storage.objects
  for select to authenticated
  using (bucket_id = 'task-attachments');

create policy "task editors can upload task attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-attachments'
    and (storage.foldername(name))[1] = 'tasks'
    and public.can_edit_task_content((storage.foldername(name))[2])
  );

-- Same "rows first, then files" order as finding screenshots: once the task is gone
-- (task delete, or project delete cascading to it), its leftover files are orphans
-- anyone on the team may clean up.
create policy "task editors or orphan cleanup can delete task attachments" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-attachments'
    and (
      public.can_edit_task_content((storage.foldername(name))[2])
      or not exists (
        select 1 from public.tasks t where t.id::text = (storage.foldername(name))[2]
      )
    )
  );
