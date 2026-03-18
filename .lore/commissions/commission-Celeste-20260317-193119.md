---
title: "Commission: Brainstorm: Single-file memory with section-level editing"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Celeste
workerDisplayTitle: "Guild Visionary"
prompt: "Brainstorm improvements to Guild Hall's memory system. Use the `/lore-development:brainstorm` skill.\n\n**Current system:**\n- Three scopes: global, project, worker. This works well.\n- Each scope stores multiple files (one per memory entry) plus a MEMORY.md index.\n- Files have frontmatter (name, description, type) and content.\n- A compaction process summarizes old entries into `_compacted.md`.\n\n**User's observations and pain points:**\n- Multiple files per scope bloat quickly\n- Compaction produces odd results\n- The index file (MEMORY.md) is another thing to maintain\n\n**User's proposed direction:**\n- Single file per scope layer instead of many files\n- This means agents need an `edit_memory` operation (not `write_memory` which replaces the whole file)\n- Section-level editing seems like the right granularity for `edit_memory`\n- But how exactly would section-level editing work?\n\n**Questions to explore:**\n1. What would a single-file-per-scope memory look like structurally? (Sections by type? By topic? Flat list?)\n2. How would `edit_memory` work at section level? What identifies a section? Headers? Keys? Named anchors?\n3. What operations does section-level editing need? (Add section, update section, delete section, append to section?)\n4. How does this interact with the `DEFAULT_MEMORY_LIMIT` (16k chars)? Does compaction still make sense with a single file, or does the structure itself prevent bloat?\n5. What happens when an agent tries to edit a section that doesn't exist, or uses the wrong section name?\n6. How does read_memory change? Does it return the whole file, or can you read specific sections?\n7. What are the failure modes? Agent writes garbage to a section and corrupts the file? How do you recover?\n\nAlso consider:\n- The current memory types (user, feedback, project, reference) and whether they map to sections\n- How Claude Code's own auto-memory system works (single MEMORY.md file with an index pointing to individual files) and what we can learn from its strengths and weaknesses\n- Whether the current compaction approach (`_compacted.md`) is the right concept or if single-file structure makes it unnecessary\n\nSave to `.lore/brainstorm/memory-single-file-redesign.md`."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/memory-single-file-redesign.md

activity_timeline:
  - timestamp: 2026-03-18T02:31:19.421Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T02:31:19.423Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T02:31:19.461Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T02:31:31.157Z
    event: progress_report
    reason: "Starting brainstorm on memory system redesign. Gathering context: frontmatter schema, current memory implementation, vision, existing brainstorms."
  - timestamp: 2026-03-18T02:31:56.324Z
    event: progress_report
    reason: "Read memory system implementation: memory-injector.ts (read/inject), memory-compaction.ts (fire-and-forget LLM summarization), base-toolbox.ts (read_memory/write_memory tools). Now reading Claude Code's auto-memory system to compare approaches, then will draft brainstorm."
  - timestamp: 2026-03-18T02:32:22.276Z
    event: progress_report
    reason: "Context gathered. Writing brainstorm artifact with 6 proposals covering: single-file structure, edit_memory API design, section identification, compaction elimination, read_memory changes, and failure recovery. Aligning each against the approved vision."
  - timestamp: 2026-03-18T02:34:56.302Z
    event: result_submitted
    reason: "Brainstorm complete: `.lore/brainstorm/memory-single-file-redesign.md` with 6 proposals grounded in the current implementation.\n\n**Proposals:**\n1. **Single markdown file per scope** — replaces per-entry files with `global.md`, `projects/{name}.md`, `workers/{name}.md`\n2. **Section-level `edit_memory` tool** — upsert/append/delete operations on `##`-delimited sections\n3. **Freeform section names** — standard sections suggested (User, Feedback, Project, Reference) but not enforced, supporting domain independence\n4. **Eliminate LLM-based compaction** — budget warnings in tool responses let agents self-manage; removes the fire-and-forget SDK call and its quality gamble\n5. **`read_memory` with optional section parameter** — full file or single section reads\n6. **Section parser utility** — foundation for all section ops, with recovery via human editing (Principle 3)\n\nEach proposal includes evidence from the codebase (file paths, line numbers), vision alignment analysis (4-step), and scope estimate. Six open questions flagged: migration path, concurrent writes, budget allocation, section ordering, commission-outcomes interaction, and backward compatibility."
  - timestamp: 2026-03-18T02:35:02.811Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Context gathered. Writing brainstorm artifact with 6 proposals covering: single-file structure, edit_memory API design, section identification, compaction elimination, read_memory changes, and failure recovery. Aligning each against the approved vision."
projectName: guild-hall
---
Brainstorm complete: `.lore/brainstorm/memory-single-file-redesign.md` with 6 proposals grounded in the current implementation.

**Proposals:**
1. **Single markdown file per scope** — replaces per-entry files with `global.md`, `projects/{name}.md`, `workers/{name}.md`
2. **Section-level `edit_memory` tool** — upsert/append/delete operations on `##`-delimited sections
3. **Freeform section names** — standard sections suggested (User, Feedback, Project, Reference) but not enforced, supporting domain independence
4. **Eliminate LLM-based compaction** — budget warnings in tool responses let agents self-manage; removes the fire-and-forget SDK call and its quality gamble
5. **`read_memory` with optional section parameter** — full file or single section reads
6. **Section parser utility** — foundation for all section ops, with recovery via human editing (Principle 3)

Each proposal includes evidence from the codebase (file paths, line numbers), vision alignment analysis (4-step), and scope estimate. Six open questions flagged: migration path, concurrent writes, budget allocation, section ordering, commission-outcomes interaction, and backward compatibility.
