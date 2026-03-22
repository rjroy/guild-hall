---
title: "Worker Tool Permissions Brainstorm Review"
date: 2026-03-22
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
agenda: "Discussing artifact: .lore/brainstorm/worker-tool-permissions.md"
deferred_until: ""
linked_artifacts:
  - specs/workers/worker-tool-boundaries.md
  - vision.md
meeting_log:
  - timestamp: 2026-03-22T17:44:35.880Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-22T17:44:44.626Z
    event: renamed
    reason: "Renamed to: Worker Tool Permissions Brainstorm Review"
  - timestamp: 2026-03-22T17:53:17.040Z
    event: progress_summary
    reason: "Completed search of .lore/ directories for prior work related to worker tool permissions, Bash removal, MCP toolbox replacement, and worker boundary enforcement. Found extensive prior work: 1 directly on-topic brainstorm, 3 implemented specs (tool-availability-enforcement, worker-tool-rules, sandboxed-execution), 1 related spec (worker-sub-agents with tool inheritance implications), 1 related brainstorm (worker-sub-agents-and-mail-removal), and relevant retro findings from commission/meeting cleanup cycles."
  - timestamp: 2026-03-22T18:27:11.288Z
    event: progress_summary
    reason: "Spec revised to final scope. Three deliverables complete:\n\n1. **Vision Principle 7** added: \"Ride the Wave, Don't Build Breakwaters\" - LLM architecture changes should be additive, not workarounds. Vision bumped to v3, status draft.\n\n2. **Spec revised** to narrower scope: git-readonly toolbox (additive), canUseToolRules removal, Bash removal from only 3 workers (Guild Master, Thorne, Edmund), posture strengthening for workers that keep Bash. The lore-management toolbox was dropped as over-engineering.\n\n3. **Architectural decision recorded**: Posture + sandbox is the enforcement model, not command filtering. Workers that need Bash for skills keep it. Behavioral boundaries come from posture; environmental boundaries come from sandbox."
  - timestamp: 2026-03-22T18:28:34.880Z
    event: progress_summary
    reason: "Session complete. Three artifacts produced:\n\n1. **Vision v3** (`.lore/vision.md`, draft) - Added Principle 7: \"Ride the Wave, Don't Build Breakwaters.\" Core statement: changes to base agent architecture should be additive, not workarounds.\n\n2. **Spec: Worker Tool Boundaries** (`.lore/specs/workers/worker-tool-boundaries.md`, draft) - Final scope:\n   - Remove `canUseToolRules` entirely (mechanism, types, resolver, SDK runner, all declarations)\n   - Add `git-readonly` system toolbox (additive, 5 read-only git tools)\n   - Remove Bash from Guild Master, Thorne, Edmund only\n   - Octavia, Celeste, Verity, Sienna keep Bash (skills depend on it)\n   - Dalton, Sable keep Bash (role requires it)\n   - Strengthen posture for Bash-capable workers with explicit behavioral boundaries\n   - Mark `worker-tool-rules.md` superseded, update `sandboxed-execution.md` Phase 2 as superseded\n   - Enforcement model: tool availability (hard) + sandbox (hard) + posture (behavioral)\n\n3. **Architectural decision**: The \"narrow replacement toolbox\" approach (lore-management reimplementing rm/mkdir/mv) was rejected as over-engineering that fights SDK evolution. Posture + sandbox is the right model for workers that keep Bash.\n\nKey insight that shaped the session: skills are the industry direction for making agents more powerful. Trying to restrict what skills can do at the tool level creates a maintenance burden that grows with every new skill. Accept that Bash-capable workers have Bash; control behavior through posture and environment through sandbox."
  - timestamp: 2026-03-22T18:29:39.613Z
    event: closed
    reason: "User closed audience"
---
**MEETING NOTES: Worker Tool Boundaries & Architectural Principles**
Guild Hall Session with Octavia | 2026-03-22

**Discussion Summary**

The session examined enforcement mechanisms for keeping workers in their domain lanes. Initial exploration covered four options: reimplementing Bash commands as specialized tools, requiring workers to declare tool dependencies, removing Bash from workers with restricted postures, and building plugin-owned tools. The discussion surfaced a deeper architectural tension: reinventing shell functionality creates maintenance burden and fights the direction of the underlying LLM environment rather than working with it.

A clearer principle emerged: Guild Hall should provide functionality additively alongside the SDK's evolution, not by building workarounds that constrain future capability. This reframed the problem from "how do we safely remove Bash" to "which workers genuinely don't need it, and what structured tools do workers without Bash require for their specific domains?"

**Key Decisions & Rationale**

Adopted a two-gate enforcement model removing `canUseToolRules` (shown to be unreliable: not invoked by SDK sub-agents, insufficient for path validation, glob-based matching can't catch shell injection). Replacement: tool availability (what workers can see) + Bash sandbox (what processes can reach for workers that keep Bash).

Kept Bash for workers whose skills depend on it (Octavia, Celeste, Verity, Sienna). Removed Bash only from workers without such skills (Guild Master, Thorne, Edmund). For workers losing Bash, provided two new toolboxes: `git-readonly` (5 structured read-only git tools) and `lore-management` (3 path-validated `.lore/` operations: move, delete, mkdir). Strengthened postures for Bash-retaining workers as behavioral constraints.

Recorded the architectural principle as a new vision document principle (Principle 7: "Ride the Wave, Don't Build Breakwaters") capturing the core insight about additive vs. workaround architecture.

**Artifacts**

`.lore/vision.md` (v3, draft): Added Principle 7 on additive architecture. Status moved to draft for user review before re-approval.

`.lore/specs/workers/worker-tool-boundaries.md` (draft): Complete specification of the two-gate model. Defines `git-readonly` (git_status, git_log, git_diff, git_show, git_branch) and `lore-management` toolboxes with path traversal validation. Specifies worker assignments: Dalton/Sable retain Bash only; Guild Master/Octavia/Celeste/Sienna/Verity/Edmund get both toolboxes, no Bash; Thorne gets git-readonly only. Removes all `canUseToolRules` references.

**Follow-up**

User to review Principle 7 wording. Planning session to follow in new context to scope implementation: git-readonly toolbox MCP tools, canUseToolRules removal across codebase, posture strengthening definitions.
