---
title: "Commission: Research triage: claude-agent-sdk-sandboxing"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/claude-agent-sdk-sandboxing.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/claude-agent-sdk-sandboxing.md

  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/specs/workers/worker-tool-rules.md
  - daemon/lib/agent-sdk/sdk-runner.ts
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/specs/workers/worker-tool-rules.md
  - daemon/lib/agent-sdk/sdk-runner.ts
activity_timeline:
  - timestamp: 2026-03-14T21:40:57.875Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:43:31.831Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:43:31.865Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:43:39.030Z
    event: progress_report
    reason: "Reading the research document and gathering implementation context."
  - timestamp: 2026-03-14T21:44:22.463Z
    event: progress_report
    reason: "Analysis complete. Writing classification and reasoning."
  - timestamp: 2026-03-14T21:44:51.734Z
    event: result_submitted
    reason: "## Classification: PAST\n\nThis research was thoroughly consumed. The codebase absorbed what it needed, and the remaining content doesn't warrant preservation as a reference document.\n\n---\n\n### 1. Was this research used?\n\nYes, extensively. Nearly every section of the research directly informed the sandboxed execution spec (`.lore/specs/infrastructure/sandboxed-execution.md`) and the implementation in `daemon/lib/agent-sdk/sdk-runner.ts`.\n\n**Specific concepts absorbed:**\n\n| Research content | Where it landed |\n|-----------------|-----------------|\n| `SandboxSettings` type definition (Section 2) | Reproduced verbatim in `SdkQueryOptions.sandbox` at `sdk-runner.ts:56-73` |\n| `canUseTool` callback signature (Section 2) | Implemented at `sdk-runner.ts:74-82` and `buildCanUseTool()` at lines 286-322 |\n| The tool coverage gap: sandbox covers only Bash, not Read/Write/Edit (Section 3, Section 5) | Became the \"enforcement chain\" three-gate model in the spec (Gates 1-3) |\n| Recommended settings: `autoAllowBashIfSandboxed`, `allowUnsandboxedCommands: false`, `network.allowLocalBinding: false` (Section 4, Pattern A) | Exact settings used at `sdk-runner.ts:479-487`, cited as REQ-SBX-3 |\n| Linux prerequisites: bubblewrap and socat (Section 5) | Captured in REQ-SBX-9 |\n| Integration point analysis in \"Relevance to Guild Hall\" (Section 6) | All six predicted integration points were realized |\n| `PermissionResult` with `interrupt: false` on denial | Implemented at `sdk-runner.ts:312-316`, required by REQ-SBX-16 |\n\nThe worker tool rules spec (`.lore/specs/workers/worker-tool-rules.md`) also builds on the research's framing of `canUseTool` as an \"intent filter\" layered over the OS sandbox.\n\n**Options the research presented that were consciously declined:**\n\n| Research option | Decision | Spec citation |\n|----------------|----------|---------------|\n| `excludedCommands` for Docker | Not used. \"No Bash commands are globally exempted.\" | REQ-SBX-4 |\n| `allowUnixSockets` for daemon socket | Not used. EventBus is in-process. | REQ-SBX-5 |\n| `enableWeakerNestedSandbox` | Deferred. \"Must be evaluated separately.\" | REQ-SBX-6 |\n\nThese aren't disagreements with the research. The research presented options; the spec selected from them. The research was doing its job.\n\n---\n\n### 2. Is there still something to learn from it?\n\nThe unused portions are:\n\n- **Container isolation patterns** (Docker, gVisor, Firecracker) from Sections 1, 4, and 5\n- **Cloud sandbox providers** (Modal, Cloudflare, E2B, Fly, Vercel) from Section 1\n- **Settings-file-based filesystem path restrictions** from Section 2\n- **Defense-in-depth production deployment** (Pattern D) from Section 4\n- **Multi-tenant patterns** (Pattern E) from Section 4\n\nThese are generic deployment architecture patterns, not Guild-Hall-specific insights. Guild Hall's architecture is local-first: daemon on a Unix socket, file-based state, no multi-tenancy. The CLI rewrite plan (`.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md`) doesn't change this. If Guild Hall ever moves toward cloud hosting or containerized sessions, the research needed at that point would be against the SDK version available then, not the version documented on 2026-03-10. API surfaces change; the specific type definitions and configuration patterns in this document will age out.\n\nThe one insight with residual value is the tool coverage gap analysis (Section 3's table of what's sandboxed vs. what isn't). But that understanding is already embedded in the spec's three-gate model and the implementation. The research document isn't needed to preserve it.\n\n---\n\n### 3. Is the research invalid given our current direction?\n\nNo. Nothing in the research contradicts the current implementation or specs. The research presented a menu of options. The spec and implementation selected from that menu. Options that weren't selected (container isolation, cloud providers, `excludedCommands`) weren't rejected as wrong; they were scoped out as unnecessary for the current architecture. The research's assumptions about Guild Hall's session model (\"runs SDK sessions as daemon subprocesses\") remain accurate.\n\n---\n\n### Reasoning for PAST\n\nThe research fulfilled its purpose completely. It informed a spec that is now `status: implemented` with 24 requirements satisfied. The implementation in `sdk-runner.ts` reflects the research's API surface, recommended settings, and integration analysis. The remaining content (container patterns, cloud providers) is generic knowledge that doesn't need a project research document to preserve. If container isolation becomes relevant, fresh research against the current SDK version would be more valuable than this snapshot."
  - timestamp: 2026-03-14T21:44:56.747Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Writing classification and reasoning."
projectName: guild-hall
---
## Classification: PAST

This research was thoroughly consumed. The codebase absorbed what it needed, and the remaining content doesn't warrant preservation as a reference document.

---

### 1. Was this research used?

Yes, extensively. Nearly every section of the research directly informed the sandboxed execution spec (`.lore/specs/infrastructure/sandboxed-execution.md`) and the implementation in `daemon/lib/agent-sdk/sdk-runner.ts`.

**Specific concepts absorbed:**

| Research content | Where it landed |
|-----------------|-----------------|
| `SandboxSettings` type definition (Section 2) | Reproduced verbatim in `SdkQueryOptions.sandbox` at `sdk-runner.ts:56-73` |
| `canUseTool` callback signature (Section 2) | Implemented at `sdk-runner.ts:74-82` and `buildCanUseTool()` at lines 286-322 |
| The tool coverage gap: sandbox covers only Bash, not Read/Write/Edit (Section 3, Section 5) | Became the "enforcement chain" three-gate model in the spec (Gates 1-3) |
| Recommended settings: `autoAllowBashIfSandboxed`, `allowUnsandboxedCommands: false`, `network.allowLocalBinding: false` (Section 4, Pattern A) | Exact settings used at `sdk-runner.ts:479-487`, cited as REQ-SBX-3 |
| Linux prerequisites: bubblewrap and socat (Section 5) | Captured in REQ-SBX-9 |
| Integration point analysis in "Relevance to Guild Hall" (Section 6) | All six predicted integration points were realized |
| `PermissionResult` with `interrupt: false` on denial | Implemented at `sdk-runner.ts:312-316`, required by REQ-SBX-16 |

The worker tool rules spec (`.lore/specs/workers/worker-tool-rules.md`) also builds on the research's framing of `canUseTool` as an "intent filter" layered over the OS sandbox.

**Options the research presented that were consciously declined:**

| Research option | Decision | Spec citation |
|----------------|----------|---------------|
| `excludedCommands` for Docker | Not used. "No Bash commands are globally exempted." | REQ-SBX-4 |
| `allowUnixSockets` for daemon socket | Not used. EventBus is in-process. | REQ-SBX-5 |
| `enableWeakerNestedSandbox` | Deferred. "Must be evaluated separately." | REQ-SBX-6 |

These aren't disagreements with the research. The research presented options; the spec selected from them. The research was doing its job.

---

### 2. Is there still something to learn from it?

The unused portions are:

- **Container isolation patterns** (Docker, gVisor, Firecracker) from Sections 1, 4, and 5
- **Cloud sandbox providers** (Modal, Cloudflare, E2B, Fly, Vercel) from Section 1
- **Settings-file-based filesystem path restrictions** from Section 2
- **Defense-in-depth production deployment** (Pattern D) from Section 4
- **Multi-tenant patterns** (Pattern E) from Section 4

These are generic deployment architecture patterns, not Guild-Hall-specific insights. Guild Hall's architecture is local-first: daemon on a Unix socket, file-based state, no multi-tenancy. The CLI rewrite plan (`.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md`) doesn't change this. If Guild Hall ever moves toward cloud hosting or containerized sessions, the research needed at that point would be against the SDK version available then, not the version documented on 2026-03-10. API surfaces change; the specific type definitions and configuration patterns in this document will age out.

The one insight with residual value is the tool coverage gap analysis (Section 3's table of what's sandboxed vs. what isn't). But that understanding is already embedded in the spec's three-gate model and the implementation. The research document isn't needed to preserve it.

---

### 3. Is the research invalid given our current direction?

No. Nothing in the research contradicts the current implementation or specs. The research presented a menu of options. The spec and implementation selected from that menu. Options that weren't selected (container isolation, cloud providers, `excludedCommands`) weren't rejected as wrong; they were scoped out as unnecessary for the current architecture. The research's assumptions about Guild Hall's session model ("runs SDK sessions as daemon subprocesses") remain accurate.

---

### Reasoning for PAST

The research fulfilled its purpose completely. It informed a spec that is now `status: implemented` with 24 requirements satisfied. The implementation in `sdk-runner.ts` reflects the research's API surface, recommended settings, and integration analysis. The remaining content (container patterns, cloud providers) is generic knowledge that doesn't need a project research document to preserve. If container isolation becomes relevant, fresh research against the current SDK version would be more valuable than this snapshot.
