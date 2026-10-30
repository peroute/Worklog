# Worklog — Review Flow & Comments (design addendum)

**Date:** 2026-10-30
**Status:** Draft, awaiting approval
**Extends:** `docs/superpowers/specs/2026-10-29-worklog-design.md` (where this conflicts, this document wins)

## 1. Why

The lead reads findings and finished tasks and sometimes isn't satisfied. Today they can only close a finding or leave it open, and there's no way to say *what* is wrong, or to tell which finished work they've already reviewed. This adds:
- an explicit **review loop** for findings and tasks (send back → fix → approve),
- a **comment thread** on every finding and task (lead ↔ assignee back-and-forth),
- a **Review page** that works as an inbox: the lead sees what waits for them, members see what they must fix.

**Success:** every item is in exactly one person's court, and that person can see it on their Review page. Nothing finished goes unreviewed by the lead.

## 2. Lifecycles (decided by the user)

### Findings
```
Open ──┬──► Closed                         (lead approves)
       └──► Needs review ──► Fixed ──┬──► Closed          (lead approves)
            (lead + comment) (author) └──► Needs review    (lead sends back again)
Closed ──► Open                           (lead reopens; my call)
```

### Tasks
```
To do ◄──► Done ──┬──► Approved                        (lead approves)
 (assignee)       └──► Needs review ──► Fixed ──┬──► Approved
                       (lead + comment) (assignee)└──► Needs review
Approved ──► To do                        (lead reopens; my call)
```
- Assignee may undo **Done → To do** until the lead acts (my call: fixes accidental ticks).
- "Done" now means *finished, waiting for the lead*. "Approved" means *the lead reviewed it*.

### Who may change status (replaces spec §6 status rows)
| Transition | Who |
|---|---|
| Finding Open/Fixed → Closed, Open/Fixed → Needs review, Closed → Open | **Lead only** |
| Finding Needs review → Fixed | **Author only** (lead may too) |
| Task To do ↔ Done, Needs review → Fixed | **Assignee only** (lead may too) |
| Task Done/Fixed → Approved, Done/Fixed → Needs review, Approved → To do | **Lead only** |
| Anything else | Nobody (rejected) |

**Change from v1:** members can no longer close findings or toggle someone else's finding status (user confirmed). Content editing rules are unchanged (author/creator or lead).

Sending something to **Needs review requires a comment**. *(My call)* This is one Postgres function per kind, `send_back_finding(id, body)` / `send_back_task(id, body)`, which inserts the comment and changes the status in **one transaction**, so there's never a stray comment or a comment-less send-back from the app. It's plain SQL (portable to self-hosted Postgres/FastAPI) and runs as the caller, so RLS and the guards still apply.

### Edge cases *(all my calls)*
- **The lead's own work:** the lead may approve/close their own findings and tasks directly, and their own items are **not** listed in their "Waiting for you" inbox or badge (nobody else reviews the lead).
- **Task creator ≠ assignee:** a member who created a task for a teammate can still edit its content but **cannot change its status** (status follows the table above). The creator **can** comment on it.
- **Reassigning a task under review** keeps its status. It simply moves to the new assignee's court.
- **Approved work is frozen for members:** a Closed finding / Approved task can only be edited by the lead (the author must ask the lead to reopen).
- **New items always start at the beginning:** findings are created `open`, tasks `todo` (enforced by the DB).
- **Project list counts** (`project_summaries` view): "open findings" = every finding not Closed; "open tasks" = every task not Approved.

## 3. Colors (user requirement: colors follow the flow)

One rule: **the color says whose turn it is.**

| Color | Meaning | Finding status | Task status |
|---|---|---|---|
| gray | not started | — | To do |
| amber | waiting for the lead | Open | Done |
| violet | needs the assignee's fix | Needs review | Needs review |
| sky blue | fixed, back with the lead | Fixed | Fixed |
| green | approved / finished | Closed | Approved |
| red | overdue (edge + badge only, task To do past deadline) | — | To do (late) |

Applied consistently to: status badges, the left status edge on every row (Today, Project, Tasks, Review pages), the summary strip tiles, and the Review page section headers. New tokens in `src/index.css` for both light and Graphite dark: `review` (violet) and `fixed` (sky), each with text / soft / edge variants like the existing ones. Overdue red only applies to To do tasks.

## 4. Data model changes (new migration; earlier migrations untouched)

- `findings.status` check → `'open' | 'needs_review' | 'fixed' | 'closed'` (existing rows keep their values).
- `tasks.status` check → `'todo' | 'done' | 'needs_review' | 'fixed' | 'approved'` (existing `done` rows become "waiting for lead", which is correct).
- `tasks.done_at`: set when a task first becomes `done`, kept through review/approval, cleared only when it returns to `todo`. ("Completed that day" on Today = `done_at` on that day and status ≠ `todo`.)
- New table **`comments`**: `id`, `finding_id` (nullable, → findings on delete cascade), `task_id` (nullable, → tasks on delete cascade), check *exactly one of the two is set*, `author_id` (default `auth.uid()`), `body` text not null (non-blank), `created_at`. Plain text, rendered with line breaks, never HTML.
  - RLS: read = any logged-in member. Insert = as yourself, and only if you are the lead or the item's author (finding) / assignee or creator (task). No edit/delete in this version.
- Status transitions enforced in the database (update the existing guard triggers), per the table in §2. The UI only hides what the DB would refuse.

## 5. Screens

### Review page (`/review`, new nav item "Review" with a count badge)
- **Lead:** "Waiting for you": findings that are Open or Fixed, tasks that are Done or Fixed, grouped Findings / Tasks, oldest first. Each row: status badge + edge, project, title, person, latest comment preview, link to the item.
- **Member:** "Needs your fix": their own findings (author) and tasks (assignee) in Needs review, each with the latest lead comment. Below it, "Waiting for the lead": their items that are Open/Done/Fixed (read-only, so they can see where things stand).
- Empty state copy: lead "Nothing waiting for you."; member "Nothing to fix. 🎉"

### Finding page
- Comment thread under the explanation (oldest first; author avatar, name, time) + a reply box for whoever may comment.
- Action buttons depend on role and status: lead sees **Approve & close** / **Send back for review** (opens a required comment box) / **Reopen**; the author in Needs review sees **Mark fixed** (optional reply in the same box). The old "Mark closed / Reopen" toggle for everyone is removed.

### Task page (new: `/tasks/:id`)
- Tasks currently have no page of their own; the thread needs one. Shows title, project, assignee, deadline, explanation, status, the same action buttons (assignee: Mark done / Undo / Mark fixed; lead: Approve / Send back / Reopen), and the comment thread. Task rows link their title to it.
- TaskRow checkbox: only for To do ↔ Done by the assignee. In other states the row shows the status badge instead.

### Today page
- Person columns gain a **Needs review** group at the top (violet). Completed group = finished that day (Done/Fixed/Approved by `done_at`).
- Summary strip becomes four tiles: **Waiting for lead** (amber: open+fixed findings, done+fixed tasks; all, not just that day), **Needs review** (violet, all), **Overdue** (red), **Done today** (green, finished that day). 2×2 on phones, 4 across on desktop.

### Project & Tasks pages
- Status filters gain the new statuses; badges/edges use the new colors.

## 6. Non-goals
- Editing or deleting comments; @mentions; notifications/email; comment attachments.
- Review for projects.

## 7. Left to the builder
- Exact copy of buttons beyond the names above, timestamps format, thread styling.
- Whether "Send back" uses a modal or an inline box (must require a comment).
