---
title: "Commission: Close Issue: Frontmatter Content Inversion"
date: 2026-03-05
status: dispatched
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Update the issue at `.lore/issues/frontmatter-content-inversion.md` to reflect the current state of the fix.\n\n## Context\n\nThis issue covers two things: commission `result_summary` and meeting `notes_summary` both stored in YAML frontmatter instead of the markdown body.\n\n**Commission side: RESOLVED.** PR #67 (commit `1d5df14`) migrated commission `result_summary` from frontmatter to the markdown body. New commission artifacts now store results in the body. You can verify this by reading recent commission artifacts in `.lore/commissions/` — the newer ones (from 20260304-21xxxx timestamps) have result text in the body, not in `result_summary` frontmatter.\n\n**Meeting side: STILL OPEN.** Meeting `notes_summary` is still stored in frontmatter. This half has not been addressed.\n\n## What to Do\n\n1. Read the current issue file at `.lore/issues/frontmatter-content-inversion.md`\n2. Verify the commission fix by reading a recent commission artifact (e.g., `.lore/commissions/commission-Writer-20260304-210737.md`) and confirming the result is in the body\n3. Update the issue body to add a \"Partial Resolution\" section documenting:\n   - Commission `result_summary` migrated to body in PR #67\n   - Meeting `notes_summary` remains in frontmatter (still open)\n4. Keep `status: open` since the meeting side is unresolved\n5. Update the title or add a note making clear this now only applies to meetings\n\nDo not use AskUserQuestion. Make all decisions autonomously."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-05T06:45:26.592Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-05T06:45:26.593Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
