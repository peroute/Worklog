# Worklog — UX audit

**Date:** 2026-11-02
**Method:** code read of every screen against `docs/superpowers/specs/2026-10-29-worklog-design.md`. Not a live click-through — visual polish/spacing unverified.
**Line numbers** are as of 2026-11-02 and will drift; search for the quoted code if a line has moved.

---

## Start here — if you only do five

- [ ] **1a** Rename status labels (display only)
- [ ] **1b** Make the Today tiles and the Review badge use the same count
- [ ] **1c** Tasks page: fix the default filter + keep filters in the URL
- [ ] **1e** Add "Save & resubmit" when editing sent-back work
- [ ] **3a** Add search

1a–1e are each under an hour. 3a is the only real feature. Do 1a first — every other item uses its vocabulary.

---

## 1. Clarity (fix first)

- [ ] **1a. "Needs review" means the opposite of what it says**
**Problem:** `needs_review` means "the lead reviewed it and sent it back to you," but reads as "waiting for review." Today shows "Waiting for lead" and "Needs review" tiles side by side — they read as the same thing. The lead's button says "Send back for review" even though the receiver must *fix*, not review. "Done" (still waiting for lead) and "Approved" (actually finished) both sound finished.

**Where:**
- `src/components/StatusBadge.tsx:5-17` — label map
- `src/features/findings/FindingDetailPage.tsx:104` — "Send back for review"
- `src/features/tasks/TaskDetailPage.tsx:97` — "Send back for review"
- `src/features/review/SendBackDialog.tsx:41` — dialog title
- `src/features/tasks/TasksPage.tsx:68-73`, `src/features/projects/ProjectPage.tsx:131-135` — filter options
- `src/features/today/TodayPage.tsx:95-100` — tile labels
- `src/features/today/PersonColumn.tsx` — "Needs review" group heading

**Fix:** change user-facing labels only; keep the DB enum.

| DB value | Current | Proposed |
|---|---|---|
| `done` / `open` | Done / Open | Submitted |
| `needs_review` | Needs review | Changes requested |
| `fixed` | Fixed | Resubmitted |
| `approved` / `closed` | Approved / Closed | Approved |

Button → "Request changes". Tradeoff: labels-only is ~20 lines and no migration, but code and UI use different words. Renaming the enum too keeps them aligned at the cost of a migration + RLS/test updates. Recommended: labels now, enum never (or later).

- [ ] **1b. Today tiles disagree with the Review badge and ignore the viewed date**
**Problem:**
- "Waiting for lead" counts the lead's own work; the Review page/badge excludes it → lead sees tile 5, badge 3.
- Waiting / Needs review / Overdue are all-time counts sitting under a date heading; browsing past days doesn't change them, so they look broken.
- Tiles look clickable but aren't.

**Where:**
- `src/domain/daySummary.ts:18-20` — counts all open/fixed/done items
- `src/domain/review.ts:23-26` — excludes `f.authorId !== me.id` / `t.assignedTo !== me.id`
- `src/features/today/TodayPage.tsx:95-113` — tile rendering

**Fix:** derive the tile and the badge from the same function (`reviewQueues`); label all-time tiles ("Team-wide · all days"); make each tile a link to Review or a pre-filtered Tasks view.

- [ ] **1c. Tasks page hides work people still have to do**
**Problem:** default filter "To do" hides `needs_review` tasks — the most urgent ones for the assignee. Filters live in component state, so opening a task and pressing Back resets them. No "Assigned to me" shortcut; no deadline sort.

**Where:**
- `src/features/tasks/TasksPage.tsx:21-23` — `useState(...)` filters, default `'todo'`
- `src/features/today/TodayPage.tsx` — `?date=` URL pattern to copy

**Fix:** default to an "Open" option (`todo` + `needs_review`); move assignee/status/project into `useSearchParams`; add an "Assigned to me" quick filter; sort by deadline (nulls last).

- [ ] **1d. Saving a task drops you somewhere unexpected**
**Problem:** "+ Assign task" from Today → save → lands on `/tasks`, not back on Today.

**Where:** `src/features/tasks/TaskForm.tsx:98`

**Fix:** return to where the user came from (`navigate(-1)` or a `from` in location state), or open the new task's page.

- [ ] **1e. Fixing sent-back work takes two separate steps**
**Problem:** sent-back item → Edit → Save → must *separately* click "Mark fixed." Forget it and the lead never sees the item again.

**Where:**
- `src/features/findings/FindingForm.tsx:92` — post-save navigate
- `src/features/findings/FindingDetailPage.tsx:109` — separate "Mark fixed"
- `src/features/tasks/TaskForm.tsx` / `src/features/tasks/TaskDetailPage.tsx:24` — same for tasks

**Fix:** when status is `needs_review`, the edit form shows a primary **"Save & resubmit"** (saves, then sets status `fixed`) next to plain "Save".

---

## 2. Consistency & polish

- [ ] **2a. Delete lives in inconsistent places**
**Problem:** every task row (including dense Today columns) shows Edit + Delete; the task detail page has no Delete. Findings are the reverse.

**Where:**
- `src/features/tasks/TaskRow.tsx:116` — row-level Delete
- `src/features/tasks/TaskDetailPage.tsx` — no Delete
- `src/features/findings/FindingDetailPage.tsx:127` — Delete on detail (the right place)

**Fix:** remove Edit/Delete from `TaskRow`; add Delete to the task detail page.

- [ ] **2b. Dialogs and lightbox ignore the keyboard**
**Problem:** no Escape to close, no click-outside, no focus trap. Lightbox has no prev/next and uses the accent color as its backdrop.

**Where:**
- `src/components/ConfirmDialog.tsx:32`
- `src/features/review/SendBackDialog.tsx:35`
- `src/features/findings/FindingDetailPage.tsx:161-178` — lightbox (`bg-accent/90` at :165)

**Fix:** switch to the native `<dialog>` element + `showModal()` (gives Escape, focus trap, `::backdrop` for free). Lightbox: ←/→ keys + buttons, neutral `bg-black/90` backdrop.

- [ ] **2c. Hardcoded colors break dark mode**
**Where:**
- `src/features/projects/ProjectForm.tsx:62` — `bg-red-50 text-red-700`
- `src/features/findings/ScreenshotInput.tsx:98` — `text-red-600`
- `src/features/tasks/AttachmentInput.tsx:126` — `text-red-600`
- `src/features/projects/DeleteProjectDialog.tsx:43` — `text-red-600`
- `src/features/findings/FindingDetailPage.tsx:175` — `bg-white text-zinc-900`

**Fix:** use theme tokens (`bg-overdue-soft text-overdue`, `bg-surface text-fg`), or just `<ErrorState>`.

- [ ] **2d. Task page is missing context**
**Problem:** findings can link to a task, but the task page never lists them. No "created by / when" or "finished on."

**Where:** `src/features/tasks/TaskDetailPage.tsx`

**Fix:** add a "Linked findings" section (`useFindings` filtered by `taskId`) and a meta line with creator, created date, `doneAt`.

- [ ] **2e. Linked task on a finding isn't clickable**
**Where:** `src/features/findings/FindingDetailPage.tsx:84`

**Fix:** wrap the `Task: …` tag in `<Link to={`/tasks/${linkedTask.id}`}>`.

- [ ] **2f. Dates have no year**
**Problem:** "Thu, Oct 29" becomes ambiguous once history crosses New Year.

**Where:** `src/lib/dates.ts:15-19` — `headingFormat`

**Fix:** add `year: 'numeric'` when the date's year ≠ current team-tz year.

- [ ] **2g. Empty column copy is wrong on past days**
**Where:** `src/features/today/PersonColumn.tsx:52` — "Nothing logged yet."

**Fix:** `isToday ? 'Nothing logged yet.' : 'Nothing logged this day.'`

- [ ] **2h. Disabled checkboxes look broken**
**Problem:** on someone else's task, a greyed checkbox reads as a broken control.

**Where:** `src/features/tasks/TaskRow.tsx:57`

**Fix:** render the checkbox only when `canToggle`; otherwise show the status badge.

- [ ] **2i. Log-finding form buries its main input**
**Problem:** screenshots (the main reason people open the form) sit at the bottom; a page-wide paste has no visible confirmation when the drop zone is off-screen. Project resets every time.

**Where:**
- `src/features/findings/FindingForm.tsx:172` — screenshots section
- `src/features/findings/FindingForm.tsx:146` — title input (no `autoFocus`)
- `src/features/tasks/TaskForm.tsx:141` — same for tasks

**Fix:** title first with `autoFocus`; move screenshots up (or show a "Screenshot added" toast on paste); remember the last project in `localStorage`.

- [ ] **2j. Long forms can be lost**
**Problem:** no warning before leaving a form with unsaved changes.

**Where:** `src/features/findings/FindingForm.tsx`, `src/features/tasks/TaskForm.tsx`

**Fix:** React Router's `useBlocker` when the form is dirty, plus a `beforeunload` listener for tab close.

---

## 3. Additions (priority order)

- [ ] **3a. Search**
The original pain was "the Sheet is hard to navigate," and there's no search. One box searching finding titles + explanations across projects. Postgres full-text search (`to_tsvector` + GIN index) fits the free tier; expose it via a function in `src/data/findings.ts`.

- [ ] **3b. Approve / request changes directly from the Review list**
**Where:** `src/features/review/ReviewPage.tsx` — rows are links only.

Lead currently does open → Approve → Back per item. Put the buttons on each row, plus a "waiting N days" age.

- [ ] **3c. Toasts after actions (with Undo)**
Approve / send back / delete give no feedback beyond the badge changing. A toast with Undo also makes one-click delete safe.

- [ ] **3d. Activity history per item**
Status changes leave no record of who approved what and when. Add a `status_events` table (trigger on status change) and a timeline on detail pages.

- [ ] **3e. "Forgot password" on login**
**Where:** `src/features/auth/LoginPage.tsx`. Supabase provides `resetPasswordForEmail` for free.

- [ ] **3f. Comment improvements**
**Where:** `src/features/comments/CommentThread.tsx:68`. Ctrl+Enter to send; edit/delete your own comments.

- [ ] **3g. Week view or export**
Lets the lead report what the team did over several days, not one.

- [ ] **3h. Notifications (later)**
A v1 non-goal, but the review loop depends on people noticing. Cheapest first step: a "new since your last visit" dot.
