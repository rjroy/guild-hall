---
title: "Commission: Specify Sandboxed Execution (Phase 1 + Phase 2)"
date: 2026-03-11
status: abandoned
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for sandboxed execution environments in Guild Hall. The brainstorm is at `.lore/brainstorm/sandboxed-execution.md` and the related (already implemented) tool availability enforcement spec is at `.lore/specs/workers/tool-availability-enforcement.md`. Read both thoroughly before starting.\n\n## What this spec covers\n\nTwo phases:\n\n**Phase 1: SDK sandbox for Bash-capable workers.** Add `SandboxSettings` to the SDK session options for workers that declare `Bash` in `builtInTools`. This restricts Bash filesystem access to the worktree, blocks network access to internal services, and prevents binding ports. The brainstorm Dimension 5 Phase 1 covers this well.\n\n**Phase 2: Worker-defined `canUseTool` rules.** This is the key design contribution. Worker packages should be able to declare rules that control how the `canUseTool` callback behaves for their tools. This enables fine-grained per-worker permissions beyond the binary \"has tool / doesn't have tool\" from TAE.\n\n## The `canUseTool` design requirement\n\nThe critical design problem: worker packages need to be able to define `canUseTool` behavior. Examples:\n\n- **Guild Master** currently has `builtInTools: [\"Read\", \"Glob\", \"Grep\"]` and no Bash. But it would be useful to give Guild Master Bash access restricted to ONLY `git status` and `git log`. The worker package should be able to declare: \"I have Bash, but only these specific commands are allowed.\"\n\n- **Octavia** currently has `builtInTools: [\"Read\", \"Glob\", \"Grep\", \"Write\", \"Edit\"]`. It would be useful to also allow `rm` but ONLY for `.lore/` paths. The worker package should be able to declare: \"I have Bash, but only `rm` on `.lore/**` paths.\"\n\n- **Thorne** (reviewer) has read-only tools. No `canUseTool` restrictions needed beyond what TAE already provides.\n\n- **Dalton/Sable** have full Bash. Phase 1's SDK sandbox restricts their Bash to the worktree. Phase 2 doesn't add further restrictions for them (they need full Bash within the sandbox).\n\nThe spec should define:\n1. How worker packages declare `canUseTool` rules in their `package.json` metadata\n2. How those rules are resolved during toolbox resolution\n3. How the rules feed into the SDK's `canUseTool` callback in `prepareSdkSession`\n4. The rule format (what patterns/matchers are supported for command matching and path matching)\n5. How `canUseTool` rules interact with Phase 1's SDK sandbox (defense in depth: sandbox restricts Bash filesystem access, `canUseTool` restricts which commands can run at all)\n\n## Constraints\n\n- The `canUseTool` callback is part of the Claude Agent SDK's Options type. Verify what arguments it receives by checking `.lore/research/claude-agent-sdk-sandboxing.md` and any SDK documentation. The spec must align with what the SDK actually provides.\n- Worker packages already declare `builtInTools`. The new rules should extend this, not replace it. TAE enforcement (the `tools` parameter) remains the first gate. `canUseTool` is the second gate for workers that need conditional access.\n- Keep Phase 1 and Phase 2 clearly separated. Phase 1 should be implementable without Phase 2. Phase 2 builds on Phase 1 but doesn't require changing Phase 1's implementation.\n\n## Output\n\nWrite the spec to `.lore/specs/infrastructure/sandboxed-execution.md`. Follow the format of existing specs (YAML frontmatter with req-prefix, numbered requirements, test cases, files to change, success criteria). The req-prefix should be `SBX`."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: claude-sonnet-4-6

activity_timeline:
  - timestamp: 2026-03-11T13:53:21.703Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T13:53:32.950Z
    event: status_abandoned
    reason: "Model name validation rejected \"claude-sonnet-4-6\". Valid names are: opus, sonnet, haiku. Re-creating with correct model name."
    from: "pending"
    to: "abandoned"
current_progress: ""
projectName: guild-hall
---
