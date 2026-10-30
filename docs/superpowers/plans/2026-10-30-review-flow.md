# Review Flow & Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead ↔ assignee review loop for findings and tasks, comment threads, a Review inbox page, and status colors that say whose turn it is.

**Architecture:** One new SQL migration redefines statuses, adds `comments`, rewrites the two guard triggers as explicit transition tables, and adds two transactional `send_back_*` functions. The data layer gains comments + send-back + `getTask`; pure domain functions decide allowed actions and inbox contents; UI reuses them.

**Tech Stack:** as v1 (React, TanStack Query, Supabase, pgTAP, Vitest).

**Spec:** `docs/superpowers/specs/2026-10-30-review-flow-design.md` (extends `2026-10-29-worklog-design.md`)

## Global Constraints

- Hedi commits; no agent commits. Explain as you go.
- Finding statuses: `open | needs_review | fixed | closed`. Task statuses: `todo | done | needs_review | fixed | approved`.
- Transitions exactly per spec §2 table + §2 edge cases; enforced in DB guards; UI only hides.
- Color rule: gray=todo, amber=waiting for lead (finding open, task done), violet=needs_review, sky=fixed, green=closed/approved, red=overdue (todo past deadline). Tokens `review` + `fixed` (text/soft/edge) in light and Graphite.
- Comments: plain text, `whitespace-pre-wrap`, never HTML; insert = lead, finding author, task assignee or creator.
- Send back = `send_back_finding(p_id uuid, p_body text)` / `send_back_task(p_id uuid, p_body text)`, one transaction, blank body rejected.
- Supabase only via `src/data/**` (import fence).

## Review Focus

1. **Member bypassing the UI** tries to close/approve, or to set a teammate's status → DB rejects (pgTAP).
2. **Send back with an empty/blank comment** → rejected; no status change (pgTAP).
3. **Lead's own items** never appear in the lead's inbox or badge count (unit test on `reviewQueues`).
4. **Member edits approved work** (closed finding text) → DB rejects; lead can (pgTAP).
5. **Existing `done` tasks after migration** show as amber "Done" waiting for the lead, and Today's Completed still uses `done_at` (unit test on `bucketTasks`).

---

### Task R1: Database — statuses, comments, transitions, send-back

**Files:** Create `supabase/migrations/20261030000001_review_flow.sql`, `supabase/tests/review.test.sql`; Modify `supabase/tests/permissions.test.sql`, `supabase/tests/schema.test.sql` (only where v1 rules changed).

**Produces:** statuses above; table `comments(id, finding_id, task_id, author_id default auth.uid(), body, created_at)` with `num_nonnulls(finding_id, task_id) = 1` and non-blank body; functions `send_back_finding`, `send_back_task`; `set_done_at` (set on first `done`, cleared only on `todo`); inserts must start at `open`/`todo`; `project_summaries` open_findings = status ≠ closed, open_tasks = status ≠ approved.

- [ ] Step 1: pgTAP `review.test.sql` (fixtures lead/hedi/khaushik @pgtap.local). Assert:
  - hedi `update findings set status='closed'` on own open finding → throws 42501.
  - khaushik sets status on hedi's finding → throws 42501.
  - lead closes hedi's open finding → ok; lead reopens → ok.
  - `send_back_finding(f, '   ')` as lead → throws; status unchanged.
  - `send_back_finding(f, 'Need logs')` as lead → status `needs_review`, 1 comment by lead.
  - hedi (author) `needs_review → fixed` → ok; hedi `fixed → closed` → throws.
  - hedi edits title of a closed finding → throws; lead → ok.
  - hedi inserts finding with status `closed` → throws.
  - tasks: assignee `todo→done→todo→done` ok; khaushik (creator, not assignee) sets status → throws; lead `send_back_task` → needs_review; assignee → fixed; assignee → approved throws; lead → approved ok; `done_at` still set after approval.
  - lead approves own task (assigned to lead) `todo→done→approved` → ok.
  - comments: khaushik comments on hedi's finding → throws; hedi comments on own → ok; task creator comments → ok; blank body → throws.
  - `project_summaries` counts needs_review finding as open and done task as open.
- [ ] Step 2: update `permissions.test.sql` rows that encoded v1 rules (member closing others' finding, assignee/creator task status) to the new expectations.
- [ ] Step 3: `npx supabase test db` → FAIL. Write migration. `npx supabase db reset && npx supabase test db` → PASS.

### Task R2: Data layer

**Files:** Modify `src/data/types.ts`, `mappers.ts`, `findings.ts`, `tasks.ts`; Create `src/data/comments.ts`; Test `tests/integration/review.test.ts`.

**Produces:**
- `FindingStatus = 'open'|'needs_review'|'fixed'|'closed'`, `TaskStatus = 'todo'|'done'|'needs_review'|'fixed'|'approved'`.
- `interface Comment { id; findingId: string|null; taskId: string|null; authorId; body; createdAt }`
- `comments.ts`: `listComments(target: { findingId: string } | { taskId: string }): Promise<Comment[]>` (oldest first), `listLatestComments(target: { findingIds?: string[]; taskIds?: string[] }): Promise<Record<string, Comment>>` (keyed by item id), `addComment(target, body: string): Promise<Comment>`.
- `findings.sendBackFinding(id, body): Promise<void>`, `tasks.sendBackTask(id, body): Promise<void>` (call the SQL functions via `.rpc`), `tasks.getTask(id): Promise<Task>`.
- `setFindingStatus` / `setTaskStatus` accept the new statuses.

- [ ] Step 1: integration tests: lead sends back hedi's finding with comment → `listComments` returns it, status needs_review; hedi `addComment` reply + `setFindingStatus('fixed')`; lead `setFindingStatus('closed')`; hedi `setFindingStatus('closed')` rejects with `DataError`; `sendBackTask` + `getTask` status; blank body rejects; `listLatestComments` returns newest per item.
- [ ] Step 2: run → FAIL; implement → PASS; existing integration tests still pass.

### Task R3: Domain logic

**Files:** Modify `src/domain/permissions.ts`, `bucketTasks.ts`, `daySummary.ts`; Create `src/domain/review.ts`; tests beside each.

**Produces:**
- `findingActions(me: Profile, f: Finding): ('close'|'sendBack'|'reopen'|'markFixed')[]`
- `taskActions(me: Profile, t: Task): ('markDone'|'undoDone'|'markFixed'|'approve'|'sendBack'|'reopen')[]`
- `canComment(me, item: { kind: 'finding'; authorId } | { kind: 'task'; assignedTo; createdBy }): boolean`
- `canEditContent(me, ownerId, frozen?: boolean)` — frozen (closed/approved) → lead only.
- `bucketTasks` adds `needsReview: Task[]` (status needs_review, assignee); `completed` = status ≠ todo with `done_at` on viewed day (excluding needs_review); open buckets only `todo`.
- `daySummary(tasks, allFindings, viewedDate)` → `{ waitingForLead, needsReview, overdue, done }` where waitingForLead/needsReview count all items (findings open|fixed + tasks done|fixed; needs_review both), done = tasks finished that day. (`useToday` now loads all findings; the page filters the day's own list by `findingDate`.)
- `reviewQueues(me, findings, tasks)` → lead: `{ waiting: { findings, tasks } }` (open|fixed findings, done|fixed tasks, excluding the lead's own); member: `{ toFix: { findings, tasks }, waitingOnLead: { findings, tasks } }`; `reviewBadgeCount(me, findings, tasks): number`.

- [ ] Step 1: tests for each (incl. Review Focus 3 and 5). Step 2: FAIL → implement → PASS.

### Task R4: Colors and badges

**Files:** Modify `src/index.css`, `src/components/ui.ts`, `src/components/StatusBadge.tsx`; Test `src/components/StatusBadge.test.tsx`.

**Produces:** tokens `--review*` (violet) and `--fixed*` (sky) light + dark; `edge.review`, `edge.fixed`, `edge.waiting` (amber); `statusEdge(status, overdue?)` helper; badge labels: Open, Needs review, Fixed, Closed, To do, Done, Approved.
- [ ] Test: each status renders its label; `statusEdge('needs_review')` = violet edge class; `statusEdge('done')` = amber; `statusEdge('approved')` = green; `statusEdge('todo', true)` = red.

### Task R5: Comment thread + finding page actions

**Files:** Create `src/features/comments/CommentThread.tsx`, `src/features/comments/queries.ts`, `src/features/review/SendBackDialog.tsx`; Modify `src/features/findings/FindingDetailPage.tsx`, `src/features/findings/queries.ts`; Tests `CommentThread.test.tsx`, update `FindingDetailPage.test.tsx`.

**Produces:** `<CommentThread target canComment />` (list + reply box, "Add comment"); `<SendBackDialog open itemTitle onSubmit(body) onCancel />` (textarea required, "Send back"); hooks `useComments(target)`, `useAddComment()`, `useSendBackFinding()`; finding page buttons per `findingActions`: "Approve & close", "Send back for review", "Reopen", "Mark fixed".
- [ ] Tests: lead on open finding sees Approve & close + Send back; Send back with empty text disabled, with text calls `sendBackFinding(id, text)`; author on needs_review sees Mark fixed and no Approve; member on others' finding sees no status buttons; thread shows comments with line breaks and literal HTML; non-commenter has no reply box.

### Task R6: Task page + TaskRow

**Files:** Create `src/features/tasks/TaskDetailPage.tsx`; Modify `TaskRow.tsx`, `src/features/tasks/queries.ts` (`useTask(id)`, `useSendBackTask()`), `src/AppRoutes.tsx` (`tasks/:id`); Tests `TaskDetailPage.test.tsx`, update `TaskRow.test.tsx`.
- [ ] Tests: TaskRow title links to `/tasks/:id`; checkbox only for assignee in todo/done; a needs_review task shows a violet "Needs review" badge and no checkbox; task page shows actions per `taskActions` and the thread.

### Task R7: Review page + nav badge

**Files:** Create `src/features/review/ReviewPage.tsx`, `src/features/review/queries.ts` (`useReviewData()` → findings, tasks, profiles, projects, latest comments); Modify `AppLayout.tsx` (nav "Review" + count), `AppRoutes.tsx` (`review`); Test `ReviewPage.test.tsx`.
- [ ] Tests: lead sees "Waiting for you" with others' open/fixed findings and done/fixed tasks, not own; member sees "Needs your fix" with latest lead comment preview and "Waiting for the lead"; empty states "Nothing waiting for you." / "Nothing to fix. 🎉"; nav shows count.

### Task R8: Today, Project, Tasks pages

**Files:** Modify `PersonColumn.tsx`, `TodayPage.tsx`, `ProjectPage.tsx`, `TasksPage.tsx`, related tests.
- [ ] Tests: Today strip has 4 tiles (Waiting for lead, Needs review, Overdue, Done today) with counts from `daySummary`; person column shows a "Needs review" group first; project status filters include the new statuses; finding rows use `statusEdge`.
- [ ] Finally: full unit + integration + pgTAP, lint, build; reseed; screenshots light/dark desktop/phone of Review (lead + member), finding with thread, task page, Today.
