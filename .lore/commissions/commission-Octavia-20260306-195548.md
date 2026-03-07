---
title: "Commission: Spec: Worker-to-Worker Communication"
date: 2026-03-07
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for worker-to-worker communication based on the brainstorm at `.lore/brainstorm/worker-communication.md`.\n\nThe brainstorm establishes the core architecture: sleeping commissions (a new commission lifecycle state), mail (a new context type), and the full flow where a commission worker sends mail to another worker, sleeps, and wakes when the reply arrives.\n\n**What the spec needs to cover:**\n\n1. **Sleeping commission state** — New state in the commission lifecycle (`in_progress -> sleeping`, `sleeping -> in_progress`, `sleeping -> cancelled`, `sleeping -> abandoned`). Sleeping means: SDK session drained (no token cost), worktree preserved, session ID saved for resume. Commissions can sleep multiple times.\n\n2. **Mail context type** — A third context type alongside \"commission\" and \"meeting\". The mail reader runs in the sender's worktree with a fresh Claude session, the reader's own posture and tools, and a mail-specific toolbox. Mail is single-turn: read message, do work, reply, done.\n\n3. **Mail toolbox** — At minimum a \"reply\" tool. Resolve the open questions: what other mail-specific tools (if any), whether the reader can see the commission artifact, and whether the reply tool enforces structure.\n\n4. **The full send-mail-sleep-wake flow** — End-to-end lifecycle from the commission worker calling \"send mail\" through to waking with the reply. Include the daemon's role in orchestrating transitions.\n\n5. **Mail storage in `.lore/`** — Resolve the storage shape question from the brainstorm. Pick a structure that's browsable after the commission completes and easy for the mail reader to find its message.\n\n6. **Wake-up prompt content** — What gets injected when the commission resumes: the reply, worktree changes summary, or both.\n\n7. **Resource model** — Whether sleeping commissions count against caps, timeout policy, and what happens if a sleeping commission is cancelled while its mail reader is running.\n\n**Reference these existing specs:**\n- `.lore/specs/guild-hall-workers.md` — Worker activation, posture, tools\n- `.lore/specs/guild-hall-system.md` — System architecture, commission lifecycle\n- `.lore/specs/guild-hall-commissions.md` — Commission states, lifecycle, artifact format\n\n**Decisions already made (from brainstorm, do not revisit):**\n- Mail is a context type, not a variant of commission\n- Sleeping is a proper state, not a flag\n- Mail is single-turn; commissions sleep multiple times for multiple consultations\n- Guild Master doesn't see mail\n- Mail storage is project lore (`.lore/`)\n- No shared mechanism with AskUserQuestion\n- Sleep model chosen over fire-and-forget\n\nResolve the open questions in the brainstorm. Make decisions and document the rationale. The spec should follow the format used by existing specs in `.lore/specs/`."
dependencies: []
linked_artifacts:
  - .lore/specs/worker-communication.md

activity_timeline:
  - timestamp: 2026-03-07T03:55:48.568Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T03:55:48.572Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T03:55:48.606Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T03:55:55.535Z
    event: progress_report
    reason: "Starting context gathering: reading the brainstorm and all referenced specs before drafting."
  - timestamp: 2026-03-07T03:56:47.171Z
    event: progress_report
    reason: "Context gathering complete. Read the brainstorm, all three referenced specs, the commission orchestrator, SDK runner, lifecycle state machine, daemon types, and toolbox resolver. Now drafting the spec."
  - timestamp: 2026-03-07T04:04:48.354Z
    event: progress_report
    reason: "Spec drafted and numbered. Renumbered REQs to close the gap (1-28 sequential). Running final verification pass now."
  - timestamp: 2026-03-07T04:10:20.869Z
    event: result_submitted
    reason: "Wrote the Worker-to-Worker Communication spec at `.lore/specs/worker-communication.md` (REQ-MAIL-1 through REQ-MAIL-27).\n\nThe spec covers all seven areas from the commission:\n\n1. **Sleeping commission state** (REQ-MAIL-1 through REQ-MAIL-5): New `sleeping` status with transitions from/to `in_progress`, plus `cancelled`, `abandoned`, and `failed`. Session ID saved for resume. Complete state file schema with JSON example. Configurable 24-hour timeout.\n\n2. **Mail context type** (REQ-MAIL-6 through REQ-MAIL-8): Third context type alongside commission and meeting. Three type definitions gain the `\"mail\"` member. Reader gets fresh session, sender's worktree, own posture and tools. Single-session, reader's resource defaults.\n\n3. **Mail toolbox** (REQ-MAIL-9 through REQ-MAIL-12): One tool: `reply` with summary (required), details (optional), files_modified (optional). No commission artifact access for the reader. Reply is terminal (one call per session).\n\n4. **Full send-mail-sleep-wake flow** (REQ-MAIL-13 through REQ-MAIL-16): Three-phase flow. Phase 1: send_mail tool writes mail file, emits event, orchestrator aborts session and transitions to sleeping. Phase 2: daemon activates mail reader with mail-specific activation prompt. Phase 3: reader replies, daemon wakes commission with resume.\n\n5. **Mail storage** (REQ-MAIL-17 through REQ-MAIL-18): `.lore/mail/<commission-id>/<sequence>-to-<reader>.md`. YAML frontmatter artifact with status tracking (sent/replied). Merges to claude branch with the commission.\n\n6. **Wake-up prompt** (REQ-MAIL-19): Reply summary + file list + reader identity. Error variants for no-reply and reader-error cases.\n\n7. **Resource model** (REQ-MAIL-20 through REQ-MAIL-23): Sleeping commissions don't count against execution cap. Mail readers tracked independently. 24-hour timeout with clock reset on re-sleep. Cancel-while-sleeping aborts active reader. Recovery handles four scenarios (reader active/inactive x mail sent/replied).\n\n**Open questions resolved:**\n- Storage shape: `.lore/mail/<commission-id>/` (browsable, separates mail from commission artifacts)\n- Mail toolbox: reply only, no commission artifact access, lightly structured (summary + details)\n- Wake-up prompt: summary + file list (not diffs, not full details)\n- Resource model: sleeping doesn't count against cap, 24h timeout, cancel aborts reader, recovery re-activates or wakes based on mail file status\n- Null sessionId edge case: sleep fails if no session ID available (safety valve, not expected path)\n- Mutual exclusion: send_mail and submit_result share session-scoped flags in the commission toolbox\n- Abandon-while-sleeping: same procedure as cancel, different terminal state"
  - timestamp: 2026-03-07T04:10:31.532Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-07T04:10:31.748Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Spec drafted and numbered. Renumbered REQs to close the gap (1-28 sequential). Running final verification pass now."
projectName: guild-hall
---
Wrote the Worker-to-Worker Communication spec at `.lore/specs/worker-communication.md` (REQ-MAIL-1 through REQ-MAIL-27).

The spec covers all seven areas from the commission:

1. **Sleeping commission state** (REQ-MAIL-1 through REQ-MAIL-5): New `sleeping` status with transitions from/to `in_progress`, plus `cancelled`, `abandoned`, and `failed`. Session ID saved for resume. Complete state file schema with JSON example. Configurable 24-hour timeout.

2. **Mail context type** (REQ-MAIL-6 through REQ-MAIL-8): Third context type alongside commission and meeting. Three type definitions gain the `"mail"` member. Reader gets fresh session, sender's worktree, own posture and tools. Single-session, reader's resource defaults.

3. **Mail toolbox** (REQ-MAIL-9 through REQ-MAIL-12): One tool: `reply` with summary (required), details (optional), files_modified (optional). No commission artifact access for the reader. Reply is terminal (one call per session).

4. **Full send-mail-sleep-wake flow** (REQ-MAIL-13 through REQ-MAIL-16): Three-phase flow. Phase 1: send_mail tool writes mail file, emits event, orchestrator aborts session and transitions to sleeping. Phase 2: daemon activates mail reader with mail-specific activation prompt. Phase 3: reader replies, daemon wakes commission with resume.

5. **Mail storage** (REQ-MAIL-17 through REQ-MAIL-18): `.lore/mail/<commission-id>/<sequence>-to-<reader>.md`. YAML frontmatter artifact with status tracking (sent/replied). Merges to claude branch with the commission.

6. **Wake-up prompt** (REQ-MAIL-19): Reply summary + file list + reader identity. Error variants for no-reply and reader-error cases.

7. **Resource model** (REQ-MAIL-20 through REQ-MAIL-23): Sleeping commissions don't count against execution cap. Mail readers tracked independently. 24-hour timeout with clock reset on re-sleep. Cancel-while-sleeping aborts active reader. Recovery handles four scenarios (reader active/inactive x mail sent/replied).

**Open questions resolved:**
- Storage shape: `.lore/mail/<commission-id>/` (browsable, separates mail from commission artifacts)
- Mail toolbox: reply only, no commission artifact access, lightly structured (summary + details)
- Wake-up prompt: summary + file list (not diffs, not full details)
- Resource model: sleeping doesn't count against cap, 24h timeout, cancel aborts reader, recovery re-activates or wakes based on mail file status
- Null sessionId edge case: sleep fails if no session ID available (safety valve, not expected path)
- Mutual exclusion: send_mail and submit_result share session-scoped flags in the commission toolbox
- Abandon-while-sleeping: same procedure as cancel, different terminal state
