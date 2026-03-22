---
title: "Commission: Brainstorm: Worker tool permissions without Bash"
date: 2026-03-22
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm approaches to worker tool permissions in Guild Hall. The core problem:\n\n**Context:** The Claude Agent SDK provides Bash as a built-in tool. Bash is a \"god tool\" — it contains every command-line tool inside it. Giving a worker Bash means giving them unrestricted access to the entire system. The `canUseTool` callback in the SDK is supposed to allow filtering, but it's not reliably called, so we can't depend on it for enforcement.\n\n**Current pain:** Workers are supposed to stay in their lanes (Guild Master coordinates but doesn't edit files, Octavia manages .lore but doesn't touch code, Thorne reviews but alters nothing). But Bash breaks all of these constraints.\n\n**The reframe:** Instead of filtering Bash, remove it entirely from workers and replace it with custom, narrow tools that provide only what each worker genuinely needs.\n\n**Brainstorm these questions:**\n\n1. **Per-worker tool inventory:** For each worker in the roster, what does it actually use Bash for today? What custom tools would replace those uses? Be specific — name the tools, their parameters, and their boundaries.\n\n2. **Guild Master specifically:** Only needs git commands for PR creation and coordination (`git status`, `git log`, `git diff`, `git branch`). What does a `git-readonly` toolbox look like?\n\n3. **Octavia specifically:** Needs to manage files in `.lore/` (create, move, rename, delete markdown files). What does a `lore-management` toolbox look like?\n\n4. **Thorne (reviewer):** Currently has Bash for running tests and linters during review. How do we give read-only execution without shell access?\n\n5. **Dalton (developer):** This is the hard case. Dalton genuinely needs broad filesystem and build tool access. Does Dalton keep Bash? Or is there a set of development tools (run-tests, run-build, run-lint, file-operations) that covers the real needs?\n\n6. **The escape hatch question:** Is there ever a legitimate need for unrestricted shell access? If so, which workers get it and how do we accept that risk?\n\n7. **Implementation approach:** These custom tools would be MCP tools served through the toolbox system. What's the implementation lift? Are we building dozens of narrow tools, or a few parameterized ones?\n\n8. **What we lose:** What capabilities break if Bash disappears? Be honest about the tradeoffs.\n\nWrite this as a brainstorm artifact in `.lore/brainstorm/`. Think broadly, consider alternatives, and flag tradeoffs. This is exploration, not a decision."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/worker-tool-permissions.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-22T17:31:13.400Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T17:31:13.405Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T17:31:13.453Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T17:31:22.085Z
    event: progress_report
    reason: "Starting brainstorm on worker tool permissions. Reading existing brainstorm artifacts and worker packages to understand current state before writing."
  - timestamp: 2026-03-22T17:32:46.910Z
    event: progress_report
    reason: "Read all worker packages and key daemon infrastructure. Have a clear picture of current state. Writing the brainstorm artifact now."
  - timestamp: 2026-03-22T17:35:30.603Z
    event: result_submitted
    reason: "Brainstorm written to `.lore/brainstorm/worker-tool-permissions.md`.\n\nThe document works through all eight questions in the commission brief, grounded in the actual current state of the codebase (worker package.json files, sdk-runner.ts, the commented-out sandbox, the canUseTool implementation). Key findings:\n\n- **Most workers use Bash as transport**, not for shell access. Guild Master, Thorne, Verity, Celeste, Edmund, and Octavia are all calling CLI commands or doing file operations that map cleanly to narrow MCP tools.\n- **The real hard cases are Dalton and Sable**, who need execution capability during development and testing. The argument for Dalton keeping Bash is strong; the sandbox (once fixed) is the right boundary, not tool removal.\n- **Four concrete toolboxes** are sketched: `git-readonly` (Guild Master), `lore-management` (Octavia), `guild-hall-query` (replaces CLI transport for all workers), and `test-runner` (Sable).\n- **Four open questions** are flagged as pre-decision blockers: why canUseTool is unreliable specifically, whether sandbox commit failures are fixable, where guild-hall-query lives architecturally, and whether skills have hidden Bash dependencies.\n- **Clearest immediate win**: remove Bash from Octavia and replace with a path-validated `lore-management` toolbox. Low risk, well-defined operations, provides an implementation template for the others."
  - timestamp: 2026-03-22T17:35:41.706Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read all worker packages and key daemon infrastructure. Have a clear picture of current state. Writing the brainstorm artifact now."
projectName: guild-hall
---
Brainstorm written to `.lore/brainstorm/worker-tool-permissions.md`.

The document works through all eight questions in the commission brief, grounded in the actual current state of the codebase (worker package.json files, sdk-runner.ts, the commented-out sandbox, the canUseTool implementation). Key findings:

- **Most workers use Bash as transport**, not for shell access. Guild Master, Thorne, Verity, Celeste, Edmund, and Octavia are all calling CLI commands or doing file operations that map cleanly to narrow MCP tools.
- **The real hard cases are Dalton and Sable**, who need execution capability during development and testing. The argument for Dalton keeping Bash is strong; the sandbox (once fixed) is the right boundary, not tool removal.
- **Four concrete toolboxes** are sketched: `git-readonly` (Guild Master), `lore-management` (Octavia), `guild-hall-query` (replaces CLI transport for all workers), and `test-runner` (Sable).
- **Four open questions** are flagged as pre-decision blockers: why canUseTool is unreliable specifically, whether sandbox commit failures are fixable, where guild-hall-query lives architecturally, and whether skills have hidden Bash dependencies.
- **Clearest immediate win**: remove Bash from Octavia and replace with a path-validated `lore-management` toolbox. Low risk, well-defined operations, provides an implementation template for the others.
