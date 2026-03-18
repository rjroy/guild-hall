---
title: "Commission: Spec: Memory system single-file redesign"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for the memory system redesign based on the brainstorm at `.lore/brainstorm/memory-single-file-redesign.md`.\n\nThe brainstorm contains six proposals that form a coherent set. Read it thoroughly. The core decisions:\n\n1. **Single file per scope** — one markdown file per scope (global, project, worker) with `##` headers as section boundaries.\n2. **Section-level `edit_memory` tool** — replaces `write_memory` with upsert/append/delete operations on named sections.\n3. **Freeform section names** — not restricted to an enum, but guidance suggests standard sections.\n4. **Eliminate LLM-based compaction** — agents manage their own memory content. Budget warnings replace background compaction.\n5. **Updated `read_memory`** — returns whole file or specific section.\n6. **Section parser utility** — foundation for all section operations.\n\nThe brainstorm has six open questions that need decisions in the spec. Make decisions on each, documenting rationale.\n\nRelated documents:\n- `.lore/brainstorm/commission-outcomes-to-memory.md`\n- `.lore/research/agent-memory-systems.md`\n- Current implementation: `daemon/services/memory-injector.ts`, `daemon/services/memory-compaction.ts`, `daemon/services/base-toolbox.ts`\n\nOutput the spec at `.lore/specs/infrastructure/memory-single-file-redesign.md`."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/memory-single-file-redesign.md

activity_timeline:
  - timestamp: 2026-03-18T05:37:02.106Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T05:37:02.108Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T05:37:02.147Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T05:37:08.700Z
    event: progress_report
    reason: "Reading brainstorm and related documents before drafting the spec."
  - timestamp: 2026-03-18T05:37:26.093Z
    event: progress_report
    reason: "All source material read. Verified current implementation against brainstorm claims. Now drafting the specification."
  - timestamp: 2026-03-18T05:41:57.824Z
    event: progress_report
    reason: "Spec drafted at .lore/specs/infrastructure/memory-single-file-redesign.md. Fresh-eyes review completed; three findings addressed (budget interaction clarity, migration edge cases, round-trip fidelity definition). Ready to submit."
  - timestamp: 2026-03-18T05:42:06.677Z
    event: result_submitted
    reason: "Wrote the memory system redesign specification at `.lore/specs/infrastructure/memory-single-file-redesign.md`. The spec covers all six brainstorm proposals (single file per scope, section-level edit_memory, freeform section names, compaction removal, updated read_memory, section parser) across 26 requirements (REQ-MEM-1 through REQ-MEM-26). All six open questions from the brainstorm are decided with rationale: auto-migration on first read, per-scope mutex for concurrency, cross-scope budget with priority-based section dropping, suggested (not enforced) section ordering, edit_memory append as the commission outcomes write mechanism, and write_memory kept as a deprecated alias for one release cycle. A fresh-context spec review identified three issues (budget interaction ambiguity, migration edge cases, round-trip fidelity definition) which were addressed in a follow-up edit pass."
  - timestamp: 2026-03-18T05:42:09.265Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec drafted at .lore/specs/infrastructure/memory-single-file-redesign.md. Fresh-eyes review completed; three findings addressed (budget interaction clarity, migration edge cases, round-trip fidelity definition). Ready to submit."
projectName: guild-hall
---
Wrote the memory system redesign specification at `.lore/specs/infrastructure/memory-single-file-redesign.md`. The spec covers all six brainstorm proposals (single file per scope, section-level edit_memory, freeform section names, compaction removal, updated read_memory, section parser) across 26 requirements (REQ-MEM-1 through REQ-MEM-26). All six open questions from the brainstorm are decided with rationale: auto-migration on first read, per-scope mutex for concurrency, cross-scope budget with priority-based section dropping, suggested (not enforced) section ordering, edit_memory append as the commission outcomes write mechanism, and write_memory kept as a deprecated alias for one release cycle. A fresh-context spec review identified three issues (budget interaction ambiguity, migration edge cases, round-trip fidelity definition) which were addressed in a follow-up edit pass.
