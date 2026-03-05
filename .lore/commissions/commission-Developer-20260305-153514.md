---
title: "Commission: Implement: Worker Posture to Markdown"
date: 2026-03-05
status: dispatched
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "Implement the plan at `.lore/plans/worker-posture-to-markdown.md`. This moves worker posture prompts from JSON strings in `package.json` to standalone `posture.md` files.\n\n## Important: No User Interaction\n\nYou will NOT have access to the user during this commission. Make all decisions autonomously. Do not use AskUserQuestion.\n\n## Task\n\nRead the plan thoroughly first, then implement all steps. The work involves:\n\n1. Extracting posture text from each worker's `package.json` `guildHall.posture` field into a `posture.md` file in the same package directory\n2. Updating the package loader in the daemon to read `posture.md` instead of the JSON field\n3. Adding backward-compatible fallback to JSON for packages that haven't been migrated\n4. Removing the `guildHall.posture` field from each `package.json` after creating the markdown files\n5. Updating tests\n\nAffected workers: `guild-hall-developer`, `guild-hall-researcher`, `guild-hall-reviewer`, `guild-hall-test-engineer`, `guild-hall-writer`. Also check the Guild Master (manager worker) which may have its posture defined differently.\n\n## Verification\n\n- All existing tests must pass (`bun test`)\n- Typecheck must pass (`bun run typecheck`)\n- New tests must cover the markdown loading path and the JSON fallback\n\n## When Done\n\nAfter implementation is complete and verified, update the plan file at `.lore/plans/worker-posture-to-markdown.md`: change its frontmatter `status` to `implemented`. Also update the issue at `.lore/issues/worker-posture-to-markdown.md`: change its `status` to `closed` and add a Resolution section describing what was done."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-05T23:35:14.573Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-05T23:35:14.574Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
