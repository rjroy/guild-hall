---
title: "Commission: Add read-before-write guard to memory redesign spec"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Add a new requirement to `.lore/specs/infrastructure/memory-single-file-redesign.md`.\n\n**New requirement (REQ-MEM-27):** `edit_memory` must reject calls unless the current SDK session has called `read_memory` for the same scope since session start. The tool returns an error message like: \"Read memory before editing. Call read_memory with scope '{scope}' first.\"\n\nKey design points:\n- The guard is tracked **per-session**, not globally. Each SDK session gets its own toolbox instance, so a `Set<string>` of scopes that have been read is sufficient.\n- One session reading project memory does **not** authorize a different session to edit it. No cross-session coordination needed.\n- The `read_memory` handler populates the set when called. The `edit_memory` handler checks it before proceeding.\n- The deprecated `write_memory` alias (REQ-MEM backward compat, decision 6) is also subject to this guard.\n\nAdd REQ-MEM-27 to the Tool: `edit_memory` section. Also add a test case to the AI Validation section covering this guard (both the rejection case and the success-after-read case). Update the Success Criteria checklist to include this requirement."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/memory-single-file-redesign.md

activity_timeline:
  - timestamp: 2026-03-18T05:48:42.085Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T05:48:42.087Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T05:48:42.125Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T05:48:53.481Z
    event: progress_report
    reason: "Read the spec. Now adding REQ-MEM-27 (read-before-edit guard), a test case, and a success criteria entry."
  - timestamp: 2026-03-18T05:49:39.103Z
    event: result_submitted
    reason: "Added REQ-MEM-27 (read-before-edit guard) to the memory single-file redesign spec. Three changes made:\n\n1. **REQ-MEM-27** added to the `Tool: edit_memory` section (after REQ-MEM-12): defines the per-session read-before-edit guard, error message format, `Set<string>` tracking mechanism, session isolation, and coverage of the `write_memory` deprecated alias.\n\n2. **Two test cases** added to the AI Validation section: one for rejection (edit without prior read returns error, file untouched) and one for success-after-read (also verifies cross-scope isolation, reading global does not authorize editing project).\n\n3. **Success criteria entry** added: \"`edit_memory` rejects calls when `read_memory` has not been called for the same scope in the current session.\""
  - timestamp: 2026-03-18T05:49:44.127Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read the spec. Now adding REQ-MEM-27 (read-before-edit guard), a test case, and a success criteria entry."
projectName: guild-hall
---
Added REQ-MEM-27 (read-before-edit guard) to the memory single-file redesign spec. Three changes made:

1. **REQ-MEM-27** added to the `Tool: edit_memory` section (after REQ-MEM-12): defines the per-session read-before-edit guard, error message format, `Set<string>` tracking mechanism, session isolation, and coverage of the `write_memory` deprecated alias.

2. **Two test cases** added to the AI Validation section: one for rejection (edit without prior read returns error, file untouched) and one for success-after-read (also verifies cross-scope isolation, reading global does not authorize editing project).

3. **Success criteria entry** added: "`edit_memory` rejects calls when `read_memory` has not been called for the same scope in the current session."
