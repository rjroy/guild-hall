---
title: "Commission: Research: Claude Code hooks for artifact provenance stamping"
date: 2026-03-17
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how Claude Code hooks could be used to implement artifact provenance tracking (Proposal 4 from `.lore/brainstorm/whats-next-2026-03-17.md`).\n\nThe problem: When workers create or edit artifacts in `.lore/`, we want to stamp frontmatter with `created_by` (worker name) and `commission_id`. But workers use Claude Code's built-in Edit and Write tools, which Guild Hall doesn't control — they're SDK-provided tools, not custom toolbox tools.\n\nClaude Code has a hooks system that fires on tool use events. Research:\n\n1. **Hook capabilities.** What hook events exist? Can hooks fire before/after Write and Edit tool calls? Can they inspect the file path and content being written?\n2. **Frontmatter injection.** Could a hook intercept a Write/Edit to a `.lore/` path and inject or update frontmatter fields before the write completes? Or would it need to run after and modify the file?\n3. **Context availability.** Hooks need to know the worker name and commission ID. How would this context be passed? Environment variables? A context file in the worktree?\n4. **Alternative approaches.** If hooks can't do this cleanly, what else could? A post-write file watcher? A custom Write wrapper tool that replaces the SDK's built-in? Toolbox instructions that tell the worker to include provenance?\n5. **Limitations and gotchas.** What are the known constraints of the hooks system? Performance impact? Failure modes?\n\nCheck `.lore/research/` for any existing Claude Code hooks documentation. Search the web for current Claude Code hooks documentation. Ground findings in actual API surface, not speculation."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-17T21:13:04.737Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T21:15:13.113Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T21:15:49.655Z
    event: status_failed
    reason: "Session error: Claude Code returned an error result: API Error: 500 {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"Internal server error\"},\"request_id\":\"req_011CZ9LzNFpFEhQTu3UbV9An\"}"
  - timestamp: 2026-03-17T21:20:55.645Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-17T21:20:55.647Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T21:24:54.754Z
    event: status_failed
    reason: "Session error: Claude Code returned an error result: API Error: 529 {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded. https://docs.claude.com/en/api/errors\"},\"request_id\":\"req_011CZ9MhkzSFGpbPrtKrfxZz\"}"
  - timestamp: 2026-03-17T21:36:50.917Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-17T21:36:50.919Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
