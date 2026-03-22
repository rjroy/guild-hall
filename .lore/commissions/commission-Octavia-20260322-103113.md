---
title: "Commission: Brainstorm: Worker tool permissions without Bash"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm approaches to worker tool permissions in Guild Hall. The core problem:\n\n**Context:** The Claude Agent SDK provides Bash as a built-in tool. Bash is a \"god tool\" — it contains every command-line tool inside it. Giving a worker Bash means giving them unrestricted access to the entire system. The `canUseTool` callback in the SDK is supposed to allow filtering, but it's not reliably called, so we can't depend on it for enforcement.\n\n**Current pain:** Workers are supposed to stay in their lanes (Guild Master coordinates but doesn't edit files, Octavia manages .lore but doesn't touch code, Thorne reviews but alters nothing). But Bash breaks all of these constraints.\n\n**The reframe:** Instead of filtering Bash, remove it entirely from workers and replace it with custom, narrow tools that provide only what each worker genuinely needs.\n\n**Brainstorm these questions:**\n\n1. **Per-worker tool inventory:** For each worker in the roster, what does it actually use Bash for today? What custom tools would replace those uses? Be specific — name the tools, their parameters, and their boundaries.\n\n2. **Guild Master specifically:** Only needs git commands for PR creation and coordination (`git status`, `git log`, `git diff`, `git branch`). What does a `git-readonly` toolbox look like?\n\n3. **Octavia specifically:** Needs to manage files in `.lore/` (create, move, rename, delete markdown files). What does a `lore-management` toolbox look like?\n\n4. **Thorne (reviewer):** Currently has Bash for running tests and linters during review. How do we give read-only execution without shell access?\n\n5. **Dalton (developer):** This is the hard case. Dalton genuinely needs broad filesystem and build tool access. Does Dalton keep Bash? Or is there a set of development tools (run-tests, run-build, run-lint, file-operations) that covers the real needs?\n\n6. **The escape hatch question:** Is there ever a legitimate need for unrestricted shell access? If so, which workers get it and how do we accept that risk?\n\n7. **Implementation approach:** These custom tools would be MCP tools served through the toolbox system. What's the implementation lift? Are we building dozens of narrow tools, or a few parameterized ones?\n\n8. **What we lose:** What capabilities break if Bash disappears? Be honest about the tradeoffs.\n\nWrite this as a brainstorm artifact in `.lore/brainstorm/`. Think broadly, consider alternatives, and flag tradeoffs. This is exploration, not a decision."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
