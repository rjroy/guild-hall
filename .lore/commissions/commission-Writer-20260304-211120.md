---
title: "Commission: Plan: Worker Posture to Markdown"
date: 2026-03-05
status: dispatched
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Create an implementation plan for the issue at `.lore/issues/worker-posture-to-markdown.md`.\n\n## Important: No User Interaction\n\nYou will NOT have access to the user during this commission. Answer all questions yourself with your best recommendations. Do not use AskUserQuestion. Make reasonable decisions and document your rationale.\n\n## Task\n\nUse the `/lore-development:prep-plan` skill to build an implementation plan for moving worker posture prompts from `package.json` strings to standalone markdown files.\n\n## Context\n\nCurrently, worker posture text (the system prompt defining behavior, principles, workflow) is stored as a JSON string in each worker's `package.json` under `guildHall.posture`. This uses `\\n` escapes, has no syntax highlighting, and mixes content with config.\n\nThe fix: add a `posture.md` file to each worker package directory. Update the worker/package loader in the daemon to read the markdown file instead of the JSON field. Remove the `guildHall.posture` field from `package.json`.\n\nAffected workers: `guild-hall-developer`, `guild-hall-researcher`, `guild-hall-reviewer`, `guild-hall-test-engineer`, `guild-hall-writer`. Also check the Guild Master (manager worker) which may have its posture defined differently.\n\n## Guidance\n\nWhen the prep-plan skill asks you questions or presents choices:\n- The markdown file should be named `posture.md` in the worker package root\n- The loader should look for `posture.md` first, fall back to `guildHall.posture` in `package.json` for backward compatibility during migration, then remove the fallback in a subsequent cleanup\n- Keep the plan simple: extract posture text, create markdown files, update loader, update tests\n- Check the actual package loader code in the daemon to understand the current resolution flow before planning changes\n- Consider both local dev packages (`packages/`) and installed packages (`~/.guild-hall/packages/`)\n\nWrite the plan to `.lore/plans/worker-posture-to-markdown.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-05T05:11:20.112Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-05T05:11:20.113Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
