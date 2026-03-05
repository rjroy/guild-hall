---
title: "Commission: Plan: Worker Posture to Markdown"
date: 2026-03-05
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Create an implementation plan for the issue at `.lore/issues/worker-posture-to-markdown.md`.\n\n## Important: No User Interaction\n\nYou will NOT have access to the user during this commission. Answer all questions yourself with your best recommendations. Do not use AskUserQuestion. Make reasonable decisions and document your rationale.\n\n## Task\n\nUse the `/lore-development:prep-plan` skill to build an implementation plan for moving worker posture prompts from `package.json` strings to standalone markdown files.\n\n## Context\n\nCurrently, worker posture text (the system prompt defining behavior, principles, workflow) is stored as a JSON string in each worker's `package.json` under `guildHall.posture`. This uses `\\n` escapes, has no syntax highlighting, and mixes content with config.\n\nThe fix: add a `posture.md` file to each worker package directory. Update the worker/package loader in the daemon to read the markdown file instead of the JSON field. Remove the `guildHall.posture` field from `package.json`.\n\nAffected workers: `guild-hall-developer`, `guild-hall-researcher`, `guild-hall-reviewer`, `guild-hall-test-engineer`, `guild-hall-writer`. Also check the Guild Master (manager worker) which may have its posture defined differently.\n\n## Guidance\n\nWhen the prep-plan skill asks you questions or presents choices:\n- The markdown file should be named `posture.md` in the worker package root\n- The loader should look for `posture.md` first, fall back to `guildHall.posture` in `package.json` for backward compatibility during migration, then remove the fallback in a subsequent cleanup\n- Keep the plan simple: extract posture text, create markdown files, update loader, update tests\n- Check the actual package loader code in the daemon to understand the current resolution flow before planning changes\n- Consider both local dev packages (`packages/`) and installed packages (`~/.guild-hall/packages/`)\n\nWrite the plan to `.lore/plans/worker-posture-to-markdown.md`."
dependencies: []
linked_artifacts:
  - .lore/issues/worker-posture-to-markdown.md

  - .lore/issues/package-distribution-model.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-worker-roster.md
  - .lore/specs/guild-hall-system.md
  - .lore/brainstorm/worker-roster-generic-workers.md
  - .lore/reference/workers-toolbox.md
  - .lore/research/typescript-plugin-systems.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/in-process-commissions.md
  - .lore/issues/package-distribution-model.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-worker-roster.md
  - .lore/specs/guild-hall-system.md
  - .lore/brainstorm/worker-roster-generic-workers.md
  - .lore/reference/workers-toolbox.md
  - .lore/research/typescript-plugin-systems.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/in-process-commissions.md
activity_timeline:
  - timestamp: 2026-03-05T05:11:20.112Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-05T05:11:20.113Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-05T05:11:20.145Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-05T05:11:28.274Z
    event: progress_report
    reason: "Starting implementation plan for worker-posture-to-markdown. Invoking prep-plan skill to build the plan."
  - timestamp: 2026-03-05T05:13:16.297Z
    event: result_submitted
    reason: "Completed search of `.lore/` for prior work related to worker posture, worker packages, package loading, and worker configuration. Found 12 directly relevant documents across specs, issues, brainstorms, reference, research, and retros. Full report follows."
  - timestamp: 2026-03-05T05:14:12.510Z
    event: progress_report
    reason: "Research complete. Reading key source files (packages.ts, types.ts, manager-worker.ts, test files) to confirm implementation details before drafting the plan."
  - timestamp: 2026-03-05T05:15:57.411Z
    event: progress_report
    reason: "Context gathering complete. I've read all source files, understood the full posture flow (discovery → schema → ActivationContext → system prompt), and identified the key touchpoints. Now surfacing gaps and making decisions before drafting the plan."
  - timestamp: 2026-03-05T05:17:30.652Z
    event: progress_report
    reason: "Plan drafted and saved to .lore/plans/worker-posture-to-markdown.md. Running fresh-eyes plan review to catch gaps."
  - timestamp: 2026-03-05T05:19:49.363Z
    event: progress_report
    reason: "Fresh-eyes review complete. Found three issues: two missing test files (worker-roster.test.ts, worker-role-smoke.test.ts), ambiguous worker detection heuristic, and underspecified validation checklist. Updating the plan to address all three."
  - timestamp: 2026-03-05T05:21:12.497Z
    event: question
    reason: "When packages are installed to ~/.guild-hall/packages/, does the install process copy all files from the package directory (including posture.md), or just package.json? If it only copies package.json, installed packages will always rely on the JSON fallback for posture. The install mechanism should be checked before removing the fallback in a future cleanup."
  - timestamp: 2026-03-05T05:21:12.498Z
    event: question
    reason: "When packages are installed to ~/.guild-hall/packages/, does the install process copy all files from the package directory (including posture.md), or just package.json? If it only copies package.json, installed packages will always rely on the JSON fallback for posture. The install mechanism should be checked before removing the fallback in a future cleanup."
  - timestamp: 2026-03-05T05:21:33.399Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fresh-eyes review complete. Found three issues: two missing test files (worker-roster.test.ts, worker-role-smoke.test.ts), ambiguous worker detection heuristic, and underspecified validation checklist. Updating the plan to address all three."
projectName: guild-hall
---
Completed search of `.lore/` for prior work related to worker posture, worker packages, package loading, and worker configuration. Found 12 directly relevant documents across specs, issues, brainstorms, reference, research, and retros. Full report follows.
