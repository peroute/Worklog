# Worklog — Design

**Date:** 2026-10-29
**Status:** Draft, awaiting approval

## 1. Why this exists

A small team (team lead + two members, Hedi and Khaushik) currently tracks daily findings in Google Sheets. Findings are things like "tested the app, found X, here's a screenshot as proof" or research notes. Everything lives in one long document, so it becomes hard to navigate and grows unwieldy fast. The team lead has no clear view of what each person did on a given day, and no structured way to assign daily work.

Worklog replaces the Sheet with a small web app where:
- each finding is its own entry (explanation + screenshots), filed under a project and a day, by person;
- the team lead (and members) can see at a glance what was found today, per person;
- tasks can be created, assigned, and marked done.

**Success looks like:** the lead opens the app in the morning, sees today's (or yesterday's) work per person in one screen, and can drill into any project to see its findings grouped by day, with open/closed status — without scrolling a giant document.

## 2. Goals

- Log findings with an explanation and one or more screenshots, per project, per day, attributed to the logged-in user.
- "Today first" home screen: one column per team member showing that day's tasks and findings.
- Project pages: findings grouped by day, plus the project's tasks.
- Tasks: create, assign, optional deadline, mark done.
- Findings: open/closed status, toggled by any team member.
- Login required for everything; role-based permissions (lead vs member).
- Runs entirely on free tiers: Vercel (frontend) + Supabase (DB, auth, storage).
- **Built so migration off Supabase cloud is cheap** in two directions (see §9).

## 3. Non-goals (v1)

- Importing existing Google Sheets history — starting fresh; the Sheet stays as an archive.
- In-app user invite/removal — accounts are created manually in the Supabase dashboard.
- Notifications (email, push), comments, realtime live updates.
- Rich text / markdown in explanations — plain text with line breaks.
- Mobile app. (Responsive web is fine; desktop-first.)
- Extra finding fields (severity, category, etc.) — the field list in §5 is complete for now.

## 4. Anti-goals (would make this a failure even if it "works")

- Any data or screenshot readable by someone who isn't logged in.
- Anyone able to self-register an account.
- Supabase calls scattered through UI components, making migration a rewrite.
- Exceeding free-tier storage because full-size screenshots were uploaded uncompressed.
- Ending up as cluttered and hard to scan as the Sheet it replaces.

## 5. Data model

All tables are plain Postgres in the `public` schema. Nothing Supabase-specific beyond `auth.users` (for identity) and Storage (for files).

**profiles**
- `id` uuid, PK, references `auth.users(id)` on delete cascade
- `display_name` text, not null (e.g. "Hedi", "Khaushik")
- `role` text, not null, check in (`'lead'`, `'member'`), default `'member'`
- `created_at` timestamptz default now()

**projects**
- `id` uuid PK
- `name` text not null, unique
- `description` text, nullable
- `created_by` uuid → profiles
- `created_at` timestamptz

**tasks**
- `id` uuid PK
- `project_id` uuid → projects, **on delete cascade**
- `title` text not null
- `explanation` text, nullable (plain text, line breaks preserved)
- `assigned_to` uuid → profiles, not null
- `deadline` date, nullable
- `status` text check in (`'todo'`, `'done'`), default `'todo'`
- `done_at` timestamptz, nullable (set when marked done, cleared if reopened)
- `created_by` uuid → profiles
- `created_at` timestamptz

**findings**
- `id` uuid PK
- `project_id` uuid → projects, **on delete cascade**
- `task_id` uuid → tasks, nullable, **on delete set null** (link is optional)
- `title` text not null
- `explanation` text not null (plain text)
- `finding_date` date not null, default = today in team timezone (editable, so a finding can be logged the next morning against yesterday)
- `status` text check in (`'open'`, `'closed'`), default `'open'`
- `author_id` uuid → profiles, not null (set from the logged-in user, never chosen manually)
- `created_at`, `updated_at` timestamptz

**finding_images**
- `id` uuid PK
- `finding_id` uuid → findings, **on delete cascade**
- `storage_path` text not null — path inside the bucket, e.g. `findings/<finding_id>/<uuid>.webp`
- `position` int (display order)
- `created_at` timestamptz

**Team timezone:** America/Chicago (Texas). "Today" everywhere in the UI means today in that timezone. *(Builder's call to keep it as a single constant.)*

## 6. Permissions

"Everyone" means **logged-in team members only**. Unauthenticated users see only the login page and cannot read anything via the API.

| Action | Lead | Member |
|---|---|---|
| View all projects, tasks, findings, screenshots | ✅ | ✅ |
| Create projects | ✅ | ✅ |
| Edit projects (name/description) | ✅ | ✅ *(my call — not discussed; low risk)* |
| **Delete projects** | ✅ | ❌ |
| Create and assign tasks (to anyone) | ✅ | ✅ |
| Edit/delete own tasks (created_by = me) | ✅ | ✅ |
| **Edit/delete someone else's tasks** | ✅ | ❌ |
| Mark a task done/undone | ✅ any | ✅ tasks assigned to me |
| Log findings + screenshots | ✅ | ✅ |
| Edit/delete own findings (and their images) | ✅ | ✅ |
| **Edit/delete someone else's findings** | ✅ | ❌ |
| Toggle any finding open/closed | ✅ | ✅ |

Notes:
- "Mark own task done" — "own" means **assigned to me**. Marking done is a status change, distinct from editing the task's content.
- Toggling a finding's status is allowed on *anyone's* finding, but editing its title/explanation/images is author-or-lead only. Enforcement must allow a member to update only the `status` column on others' findings.
- **Enforcement lives in the database** via Row Level Security policies, using a helper `is_lead()` SQL function that reads `profiles.role`. The UI hides disallowed actions, but the DB is the source of truth.
- Public sign-up is **disabled** in Supabase Auth settings. Accounts (3) are created manually in the dashboard; a `profiles` row is created by a trigger on `auth.users` insert, and the lead's role is set manually.
- Deleting a project is destructive (cascades to its tasks, findings, and images) and requires a confirmation dialog that states counts ("This deletes 12 findings and 4 tasks").

## 7. Screens

### 7.1 Login
Email + password. No sign-up link. "Forgot password" is optional for v1 *(builder's call; Supabase cloud provides it free)*.

### 7.2 Today (home) — chosen layout: "Today first"
- Header: date (default today) with prev/next day arrows and a date picker, so the lead can review any day.
- One column per team member with role `member` (currently Hedi, Khaushik). The lead gets a third column only when they have findings that day **or** any task assigned to them that is not done *(my call)*.
- Each column shows:
  - **Tasks** for that person, in groups:
    - **Due / overdue:** not done, deadline ≤ the viewed day (overdue highlighted).
    - **Upcoming:** not done, deadline after the viewed day.
    - **No deadline:** not done, no deadline.
    - **Completed:** `done_at` falls on the viewed day.
    - Count shown as "done today X · open Y".
  - **Findings** logged with `finding_date` = that day, each as a compact row: project tag, title, open/closed badge, screenshot count. Click → finding detail.
- Below columns: compact project list with open-finding counts; click → project page.
- Primary actions: "+ Log finding", "+ Assign task".

*Past days (my call):* when browsing an earlier day, **findings** are exact (filtered by `finding_date`) and **completed tasks** use `done_at`. The open task groups reflect each task's **current** status, not a reconstruction of that day. No task history table in v1. Main purpose of past-day browsing is "what did they find / finish that day", which this answers exactly.

### 7.3 Projects list
All projects with name, description, open-finding count, open-task count. "+ New project".

### 7.4 Project page
- Name, description, edit button; delete (lead only).
- **Tasks** section: list with assignee, deadline, status; filter to-do/done.
- **Findings** section: grouped by `finding_date` descending (day headers), each row: author, title, status badge, screenshot count. Filters: person, open/closed.

### 7.5 Finding detail
Title, author, date, project, linked task (if any), status toggle, full explanation, screenshots gallery (click to enlarge). Edit/delete if permitted.

### 7.6 Finding form (create/edit)
Fields: project (required), linked task (optional, filtered to the chosen project), title, explanation, date (defaults to today), screenshots.
Screenshot input must support: **paste from clipboard (Ctrl+V)**, drag-and-drop, and file picker — paste matters because most proof is a fresh screenshot.

### 7.7 Task form (create/edit)
Project, title, assignee (dropdown of profiles), explanation, optional deadline.

### 7.8 Tasks view
All tasks across projects; filters: assignee, status, project. Overdue highlighted.

## 8. Screenshots & storage

- One **private** Supabase Storage bucket (`finding-images`). Images are served via **signed URLs** (short expiry, e.g. 1 hour), never public URLs.
- Storage policies: read for authenticated users; write/delete mirrors the finding's edit permission.
- **Compress in the browser before upload**: max dimension ~1920px, WebP (fallback JPEG), quality ~0.8. Target well under 500 KB per image. Free tier storage is ~1 GB.
- Limit ~10 images per finding *(my call)*.
- Deleting a finding or project must also delete its files from Storage (DB cascade alone doesn't remove files). Handle this in the data layer.
- File path convention `findings/<finding_id>/<uuid>.<ext>` keeps migration to disk/MinIO a straight copy.

## 9. Migration readiness (the "Option C" path)

Chosen strategy: start on Supabase cloud + Vercel. Later, move to an own server — first by **self-hosting Supabase (Option A)**, then optionally **replacing Supabase with FastAPI + Postgres (Option B)** piece by piece.

To keep both cheap, v1 must follow these rules:

1. **Data access layer.** All Supabase calls live in `src/data/` (e.g. `auth.ts`, `projects.ts`, `tasks.ts`, `findings.ts`, `images.ts`). UI components and hooks import functions from there and never import the Supabase client directly. Functions return plain typed objects, not Supabase response shapes.
2. **Configuration via env vars only** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Option A is then a config change.
3. **Plain Postgres schema** managed as SQL migration files in the repo (`supabase/migrations/`), not edited ad hoc in the dashboard. Permission logic is in SQL policies + `is_lead()`, readable enough to port to Python checks.
4. **No Supabase-only features** beyond Auth and Storage: no Edge Functions, no Realtime, no `pg_graphql`, no DB webhooks.
5. **Storage paths stored in the DB** (not full URLs), so the file backend can change.

Migration steps, for later reference:
- **Option A:** run official `supabase/docker` compose on the server (trim analytics/realtime/edge-functions/imgproxy to save RAM) → `pg_dump` cloud incl. `auth` schema → restore → copy bucket via `rclone` (S3-compatible) → update env vars → redeploy frontend. Users keep passwords.
- **Option B:** FastAPI + Postgres; port RLS rules to Python permission checks; implement auth verifying existing bcrypt hashes from `auth.users` (users keep passwords); serve images from disk or MinIO using the same `storage_path`; rewrite `src/data/*` to call the API. UI untouched.

## 10. Tech stack (my calls, using the user's existing skills)

- Vite + React + TypeScript + Tailwind CSS
- `@supabase/supabase-js`
- React Router for pages
- TanStack Query for data fetching/caching (keeps components simple and the data layer swappable)
- `browser-image-compression` (or equivalent) for client-side compression
- Hosting: Vercel Hobby (free). Supabase Free plan.

## 11. Constraints & known gotchas

- **All free.** Supabase free projects pause after ~1 week of inactivity (daily use avoids this; resume from dashboard if needed). ~500 MB DB, ~1 GB storage. Verify current limits at build time.
- Railway is not free and is not used.
- **Data sensitivity (confirmed by user):** personal/non-commercial use; screenshots will not contain student records. Supabase cloud + Vercel Hobby are acceptable.
- Supabase anon key is public by design; security relies entirely on RLS + storage policies + disabled sign-up. Every table must have RLS enabled.
- Users: Hedi, Khaushik (members), team lead (lead). The design must not hard-code names — columns come from `profiles`.

## 12. Left to the builder

- Visual styling and component library choice (keep it clean and scannable).
- Exact folder structure beyond `src/data/` and `supabase/migrations/`.
- Testing approach and depth.
- Whether to include "forgot password".
- Loading/empty/error states (must exist; design is builder's).
