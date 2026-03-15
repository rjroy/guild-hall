---
title: "Commission: Update commission list filtering brainstorm"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Review and update `.lore/brainstorm/commission-list-filtering.md` to reflect recent changes to how artifact sorting works in the codebase.\n\nSteps:\n\n1. **Read the current brainstorm** at `.lore/brainstorm/commission-list-filtering.md` to understand the original design.\n\n2. **Investigate recent artifact sorting changes.** Check git history for recent commits that changed sorting behavior. Look at:\n   - `lib/artifacts.ts` or any artifact utility files\n   - Commission list components in `web/`\n   - Any sorting/filtering utilities\n   \n   Use `git log --oneline -20` and `git diff` against recent commits to understand what changed and when. Focus on changes made after the brainstorm was written (check the brainstorm's date).\n\n3. **Update the brainstorm.** Revise the document so its assumptions, design, and recommendations align with the current sorting implementation. Note what changed and why it matters for the filtering design. If any of the original options are now invalid or simplified by the sorting changes, say so.\n\nPreserve the brainstorm's original structure and voice. This is an update, not a rewrite."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/commission-list-filtering.md

activity_timeline:
  - timestamp: 2026-03-14T21:34:42.869Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:34:42.871Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:34:42.912Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:34:57.954Z
    event: progress_report
    reason: "Read the brainstorm (dated 2026-03-10). Now investigating sorting changes. The brainstorm references STATUS_GROUP from lib/commissions.ts. Found that lib/artifacts.ts delegates sorting to artifact-sorting.ts. Investigating both files and recent relevant commits."
  - timestamp: 2026-03-14T21:36:07.190Z
    event: progress_report
    reason: "Investigation complete. PR #103 (2026-03-11) introduced ARTIFACT_STATUS_GROUP with 5 groups, reorganized blocked/paused placement, and unified gem colors with sort priority. Commission STATUS_GROUP unchanged. Now updating the brainstorm to reflect these changes."
  - timestamp: 2026-03-14T21:37:06.576Z
    event: result_submitted
    reason: "Updated `.lore/brainstorm/commission-list-filtering.md` to reflect the artifact sorting changes from PR #103 (2026-03-11).\n\nKey changes:\n1. **Added \"Sorting context\" subsection** explaining that two status maps now coexist: the commission-specific `STATUS_GROUP` (4 groups, unchanged) and the new `ARTIFACT_STATUS_GROUP` (5 groups, from PR #103). Documents the practical implication: gem colors derive from the artifact map, but commission list order follows the commission map.\n2. **Sharpened the `blocked` default question.** PR #103 moved `blocked` into the same artifact group as `failed`/`cancelled`, which strengthens the case for defaulting it to \"on.\" Marked as TBD in the status table, reframed the open question with this new context.\n3. **Strengthened the compact gem option** in the checkbox layout question, since `statusToGem()` now covers all commission statuses correctly.\n4. **Added `artifact-sorting.md` spec** to the related documents list."
  - timestamp: 2026-03-14T21:37:13.481Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Investigation complete. PR #103 (2026-03-11) introduced ARTIFACT_STATUS_GROUP with 5 groups, reorganized blocked/paused placement, and unified gem colors with sort priority. Commission STATUS_GROUP unchanged. Now updating the brainstorm to reflect these changes."
projectName: guild-hall
---
Updated `.lore/brainstorm/commission-list-filtering.md` to reflect the artifact sorting changes from PR #103 (2026-03-11).

Key changes:
1. **Added "Sorting context" subsection** explaining that two status maps now coexist: the commission-specific `STATUS_GROUP` (4 groups, unchanged) and the new `ARTIFACT_STATUS_GROUP` (5 groups, from PR #103). Documents the practical implication: gem colors derive from the artifact map, but commission list order follows the commission map.
2. **Sharpened the `blocked` default question.** PR #103 moved `blocked` into the same artifact group as `failed`/`cancelled`, which strengthens the case for defaulting it to "on." Marked as TBD in the status table, reframed the open question with this new context.
3. **Strengthened the compact gem option** in the checkbox layout question, since `statusToGem()` now covers all commission statuses correctly.
4. **Added `artifact-sorting.md` spec** to the related documents list.
