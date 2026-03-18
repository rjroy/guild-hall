---
title: "Commission: Spec: Memory system single-file redesign"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for the memory system redesign based on the brainstorm at `.lore/brainstorm/memory-single-file-redesign.md`.\n\nThe brainstorm contains six proposals that form a coherent set. Read it thoroughly. The core decisions:\n\n1. **Single file per scope** — one markdown file per scope (global, project, worker) with `##` headers as section boundaries.\n2. **Section-level `edit_memory` tool** — replaces `write_memory` with upsert/append/delete operations on named sections.\n3. **Freeform section names** — not restricted to an enum, but guidance suggests standard sections.\n4. **Eliminate LLM-based compaction** — agents manage their own memory content. Budget warnings replace background compaction.\n5. **Updated `read_memory`** — returns whole file or specific section.\n6. **Section parser utility** — foundation for all section operations.\n\nThe brainstorm has six open questions that need decisions in the spec. Make decisions on each, documenting rationale.\n\nRelated documents:\n- `.lore/brainstorm/commission-outcomes-to-memory.md`\n- `.lore/research/agent-memory-systems.md`\n- Current implementation: `daemon/services/memory-injector.ts`, `daemon/services/memory-compaction.ts`, `daemon/services/base-toolbox.ts`\n\nOutput the spec at `.lore/specs/infrastructure/memory-single-file-redesign.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T05:37:02.106Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T05:37:02.108Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
