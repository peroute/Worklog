# Worklog — project instructions

## UX audit checklist (`docs/ux-audit.md`)

When your work completes an item in `docs/ux-audit.md` (IDs like 1a, 2c, 3a):

- Tick its box (`- [ ]` → `- [x]`) in **both** places it appears: the "Start here" list at the top (if listed) and the item itself.
- If the fix differed from the proposed one, add one line under the item: `**Done:** <what was actually done>`.
- Partially done → leave it unticked and add `**Partial:** <what's left>`.
- Do this in the same change as the fix, not as a separate step — the user should never have to ask.
- Edit only the lines for your item(s). Parallel worktrees each edit this file, so touching other lines causes merge conflicts.
