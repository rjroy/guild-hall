---
title: "Commission: Close Issue: Frontmatter Content Inversion"
date: 2026-03-05
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Update the issue at `.lore/issues/frontmatter-content-inversion.md` to reflect the current state of the fix.\n\n## Context\n\nThis issue covers two things: commission `result_summary` and meeting `notes_summary` both stored in YAML frontmatter instead of the markdown body.\n\n**Commission side: RESOLVED.** PR #67 (commit `1d5df14`) migrated commission `result_summary` from frontmatter to the markdown body. New commission artifacts now store results in the body. You can verify this by reading recent commission artifacts in `.lore/commissions/` — the newer ones (from 20260304-21xxxx timestamps) have result text in the body, not in `result_summary` frontmatter.\n\n**Meeting side: STILL OPEN.** Meeting `notes_summary` is still stored in frontmatter. This half has not been addressed.\n\n## What to Do\n\n1. Read the current issue file at `.lore/issues/frontmatter-content-inversion.md`\n2. Verify the commission fix by reading a recent commission artifact (e.g., `.lore/commissions/commission-Writer-20260304-210737.md`) and confirming the result is in the body\n3. Update the issue body to add a \"Partial Resolution\" section documenting:\n   - Commission `result_summary` migrated to body in PR #67\n   - Meeting `notes_summary` remains in frontmatter (still open)\n4. Keep `status: open` since the meeting side is unresolved\n5. Update the title or add a note making clear this now only applies to meetings\n\nDo not use AskUserQuestion. Make all decisions autonomously."
dependencies: []
linked_artifacts:
  - .lore/issues/frontmatter-content-inversion.md

activity_timeline:
  - timestamp: 2026-03-05T06:45:26.592Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-05T06:45:26.593Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-05T06:45:26.623Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-05T06:45:34.932Z
    event: progress_report
    reason: "Reading the current issue file and verifying the commission fix by checking a recent commission artifact."
  - timestamp: 2026-03-05T06:45:46.933Z
    event: progress_report
    reason: "Commission fix verified. Updating the issue to document partial resolution and narrow scope to meetings."
  - timestamp: 2026-03-05T06:46:41.734Z
    event: result_submitted
    reason: "Updated `.lore/issues/frontmatter-content-inversion.md` to reflect partial resolution. Changes: (1) Narrowed title from \"Meeting and commission artifacts\" to \"Meeting artifacts store notes_summary in frontmatter instead of body\". (2) Removed commission references from tags and modules lists. (3) Trimmed \"What Happened\" section to focus on meetings only. (4) Added \"Partial Resolution\" section documenting that commission `result_summary` was migrated to body in PR #67 (commit `1d5df14`), and that meeting `notes_summary` remains in frontmatter. (5) Updated \"Fix Direction\" to cover only the remaining meeting-side code paths. (6) Kept `status: open` since the meeting side is unresolved. Verified the commission fix by reading `commission-Writer-20260304-210737.md`, which confirms result text is in the markdown body with no `result_summary` frontmatter field."
  - timestamp: 2026-03-05T06:46:47.138Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-05T06:46:47.350Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Commission fix verified. Updating the issue to document partial resolution and narrow scope to meetings."
projectName: guild-hall
---
Updated `.lore/issues/frontmatter-content-inversion.md` to reflect partial resolution. Changes: (1) Narrowed title from "Meeting and commission artifacts" to "Meeting artifacts store notes_summary in frontmatter instead of body". (2) Removed commission references from tags and modules lists. (3) Trimmed "What Happened" section to focus on meetings only. (4) Added "Partial Resolution" section documenting that commission `result_summary` was migrated to body in PR #67 (commit `1d5df14`), and that meeting `notes_summary` remains in frontmatter. (5) Updated "Fix Direction" to cover only the remaining meeting-side code paths. (6) Kept `status: open` since the meeting side is unresolved. Verified the commission fix by reading `commission-Writer-20260304-210737.md`, which confirms result text is in the markdown body with no `result_summary` frontmatter field.
