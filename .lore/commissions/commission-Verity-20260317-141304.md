---
title: "Commission: Research: Claude Code hooks for artifact provenance stamping"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research how Claude Code hooks could be used to implement artifact provenance tracking (Proposal 4 from `.lore/brainstorm/whats-next-2026-03-17.md`).\n\nThe problem: When workers create or edit artifacts in `.lore/`, we want to stamp frontmatter with `created_by` (worker name) and `commission_id`. But workers use Claude Code's built-in Edit and Write tools, which Guild Hall doesn't control — they're SDK-provided tools, not custom toolbox tools.\n\nClaude Code has a hooks system that fires on tool use events. Research:\n\n1. **Hook capabilities.** What hook events exist? Can hooks fire before/after Write and Edit tool calls? Can they inspect the file path and content being written?\n2. **Frontmatter injection.** Could a hook intercept a Write/Edit to a `.lore/` path and inject or update frontmatter fields before the write completes? Or would it need to run after and modify the file?\n3. **Context availability.** Hooks need to know the worker name and commission ID. How would this context be passed? Environment variables? A context file in the worktree?\n4. **Alternative approaches.** If hooks can't do this cleanly, what else could? A post-write file watcher? A custom Write wrapper tool that replaces the SDK's built-in? Toolbox instructions that tell the worker to include provenance?\n5. **Limitations and gotchas.** What are the known constraints of the hooks system? Performance impact? Failure modes?\n\nCheck `.lore/research/` for any existing Claude Code hooks documentation. Search the web for current Claude Code hooks documentation. Ground findings in actual API surface, not speculation."
dependencies: []
linked_artifacts:
  - .lore/research/claude-code-hooks-provenance.md

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
  - timestamp: 2026-03-17T21:36:50.999Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T21:36:59.155Z
    event: progress_report
    reason: "Starting research on Claude Code hooks for artifact provenance tracking. Checking existing .lore/research/ for cached docs, then gathering current hook documentation."
  - timestamp: 2026-03-17T21:39:08.185Z
    event: progress_report
    reason: "Gathered all primary sources. Have: (1) Full Claude Code CLI hooks reference, (2) Full Agent SDK hooks guide with TypeScript API, (3) Existing SDK ref research in repo, (4) Guild Hall's current sdk-runner.ts showing SdkQueryOptions without hooks field. Now synthesizing findings into research document."
  - timestamp: 2026-03-17T21:40:57.215Z
    event: progress_report
    reason: "Research document written to .lore/research/claude-code-hooks-provenance.md. Committing and submitting result."
  - timestamp: 2026-03-17T21:41:22.503Z
    event: result_submitted
    reason: "Research complete. Created `.lore/research/claude-code-hooks-provenance.md` covering all five research questions.\n\n**Key findings:**\n\n1. **Hook capabilities:** PreToolUse and PostToolUse both fire on Write and Edit tool calls. PreToolUse receives `tool_input` with `file_path` and `content` (Write) or `old_string`/`new_string` (Edit). PreToolUse can modify input via `updatedInput`; PostToolUse fires after execution and can only inject context.\n\n2. **Frontmatter injection:** PreToolUse works cleanly for Write (full content available, can inject frontmatter before write). Edit is harder because only the diff is available, not the full file. PostToolUse works identically for both: read file from disk after write, parse frontmatter, add provenance fields, write back.\n\n3. **Context availability:** Guild Hall's `prepareSdkSession` already has `workerName` and `commissionId`. SDK callback hooks can close over these values. Environment variables work for shell command hooks. The `SdkQueryOptions` type needs a `hooks` field added (small change).\n\n4. **Five implementation options presented** with tradeoffs: (1) PostToolUse SDK callback (simplest, recommended starting point), (2) PreToolUse for Write + PostToolUse for Edit (avoids double-write for new files), (3) Plugin shell hooks (decoupled but more overhead), (4) Toolbox instructions only (zero cost, unreliable), (5) Custom Write wrapper tool (aggressive, replaces built-in tools).\n\n5. **Key gotchas:** Matchers filter by tool name only (file path checked inside callback). `updatedInput` requires `permissionDecision: \"allow\"`. gray-matter `stringify()` reformats YAML (use splice approach). Edit tool's partial input makes PreToolUse frontmatter injection complex."
  - timestamp: 2026-03-17T21:41:25.809Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research document written to .lore/research/claude-code-hooks-provenance.md. Committing and submitting result."
projectName: guild-hall
---
Research complete. Created `.lore/research/claude-code-hooks-provenance.md` covering all five research questions.

**Key findings:**

1. **Hook capabilities:** PreToolUse and PostToolUse both fire on Write and Edit tool calls. PreToolUse receives `tool_input` with `file_path` and `content` (Write) or `old_string`/`new_string` (Edit). PreToolUse can modify input via `updatedInput`; PostToolUse fires after execution and can only inject context.

2. **Frontmatter injection:** PreToolUse works cleanly for Write (full content available, can inject frontmatter before write). Edit is harder because only the diff is available, not the full file. PostToolUse works identically for both: read file from disk after write, parse frontmatter, add provenance fields, write back.

3. **Context availability:** Guild Hall's `prepareSdkSession` already has `workerName` and `commissionId`. SDK callback hooks can close over these values. Environment variables work for shell command hooks. The `SdkQueryOptions` type needs a `hooks` field added (small change).

4. **Five implementation options presented** with tradeoffs: (1) PostToolUse SDK callback (simplest, recommended starting point), (2) PreToolUse for Write + PostToolUse for Edit (avoids double-write for new files), (3) Plugin shell hooks (decoupled but more overhead), (4) Toolbox instructions only (zero cost, unreliable), (5) Custom Write wrapper tool (aggressive, replaces built-in tools).

5. **Key gotchas:** Matchers filter by tool name only (file path checked inside callback). `updatedInput` requires `permissionDecision: "allow"`. gray-matter `stringify()` reformats YAML (use splice approach). Edit tool's partial input makes PreToolUse frontmatter injection complex.
