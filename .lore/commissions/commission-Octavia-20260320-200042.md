---
title: "Commission: Documentation: Mail system removal (Phases 6-7)"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Execute Phases 6 and 7 of the mail system removal plan at `.lore/plans/workers/mail-system-removal.md`.\n\n**Phase 6: Update CLAUDE.md**\n- Remove \"worker-to-worker mail\" from \"What exists\"\n- Remove `mail/` from daemon services table\n- Remove the \"Worker mail\" Key Patterns paragraph\n- Remove `maxConcurrentMailReaders` from any config references\n- Read through the result for coherence\n\n**Phase 7a: Archive mail-specific lore**\nArchive these by changing status to `removed` and adding `removal_note: \"Mail system removed. See .lore/brainstorm/worker-sub-agents-and-mail-removal.md, Proposal 1.\"`:\n- `.lore/specs/workers/worker-communication.md`\n- `.lore/specs/workers/guild-hall-mail-reader-toolbox.md`\n- `.lore/plans/workers/worker-communication.md`\n- `.lore/plans/workers/guild-hall-mail-reader-toolbox.md`\n\n**Phase 7b: Surgical lore edits**\nThe plan lists 17 spec files and 8 plan files that reference mail in passing (sleeping in status lists, mail in context type lists, send_mail in tool lists, mail events). Edit each to remove the references. The edits are formulaic: find the mail reference, remove it, ensure surrounding text reads correctly.\n\nDon't forget `.lore/lore-config.md` (sleeping in custom_directories.commissions and prose).\n\n**Verification:** Grep for `sleeping`, `send_mail`, `mailFilePath`, `mailContext`, `MailOrchestrator`, `commission_mail_sent`, `mail_reply_received`, `maxConcurrentMailReaders` across all `.lore/` and `CLAUDE.md`. Remaining hits should only be in the brainstorm (historical record), archived files (status: removed), and CHANGELOG.md."
dependencies:
  - commission-Thorne-20260320-200033
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T03:00:42.479Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:00:42.480Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
