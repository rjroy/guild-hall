---
title: "Commission: Spec: SDK tool availability enforcement"
date: 2026-03-11
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for fixing how Guild Hall controls which tools are available to worker sessions.\n\n## Problem\n\nWorkers declare `builtInTools` (e.g., `[\"Read\", \"Glob\", \"Grep\"]`) to restrict which tools they can use. This restriction is currently broken. Workers can access tools like Bash even when their whitelist doesn't include it.\n\n## Root Cause\n\nThe SDK runner (`daemon/lib/agent-sdk/sdk-runner.ts`, line 384-398) passes `allowedTools` and `permissionMode: \"dontAsk\"` but never sets the `tools` parameter.\n\nIn the Claude Agent SDK:\n- `allowedTools` controls which tools are **auto-approved without prompting** (permission layer)\n- `tools` controls which built-in tools **exist in the model's context** (availability layer)\n- `permissionMode: \"dontAsk\"` means \"deny if not pre-approved,\" but user-level settings can pre-approve tools (e.g., Bash patterns in `~/.claude/settings.json`), and `skipDangerousModePermissionPrompt: true` in user settings bypasses permission checks entirely\n\nSince Guild Hall never sets `tools`, the model gets all default Claude Code tools regardless of the worker's `builtInTools` declaration. The permission layer was supposed to enforce restrictions but is unreliable because it can be overridden by user settings loaded via `settingSources: [\"local\", \"project\", \"user\"]`.\n\n## SDK Type Reference\n\n```typescript\n// Controls what tools the model can see (availability)\ntools?: string[] | { type: 'preset'; preset: 'claude_code' };\n// string[] - Array of specific tool names (e.g., ['Bash', 'Read', 'Edit'])\n// [] (empty array) - Disable all built-in tools\n// { type: 'preset'; preset: 'claude_code' } - Use all default Claude Code tools\n\n// Controls which tools auto-approve without prompting (permission)\nallowedTools?: string[];\n\n// Controls which tools are removed even if otherwise allowed (permission)\ndisallowedTools?: string[];\n```\n\n## What the Spec Should Cover\n\n1. The correct use of the `tools` parameter to enforce tool availability at the model level\n2. How `tools` interacts with MCP server tools (MCP tools use `mcp__<server>__<tool>` naming)\n3. Whether `settingSources` should still include `\"user\"` (risk of leaking user permissions)\n4. Whether `allowedTools` is still needed alongside `tools` (for auto-approval within the available set)\n5. What changes are needed in the toolbox resolver's `ResolvedToolSet` type\n6. Test cases that verify a worker without Bash in `builtInTools` cannot access Bash\n\n## Files to Read\n\n- `daemon/lib/agent-sdk/sdk-runner.ts` - current implementation (lines 384-398 especially)\n- `daemon/lib/agent-sdk/toolbox-resolver.ts` - builds `allowedTools` from worker metadata\n- `lib/types.ts` - `SdkQueryOptions`, `ResolvedToolSet` types\n- `packages/guild-hall-manager/index.ts` - manager worker metadata (has only Read, Glob, Grep)\n- `packages/guild-hall-reviewer/index.ts` - reviewer worker metadata (has only Read, Glob, Grep)\n- `packages/guild-hall-developer/index.ts` - developer worker (has Read, Write, Edit, Bash, Glob, Grep)\n- `tests/daemon/sdk-runner.test.ts` - existing test expectations\n- `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` - SDK type definitions (search for `tools?`, `allowedTools`, `disallowedTools`, `permissionMode`)"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-11T00:44:55.137Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T00:44:55.140Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
