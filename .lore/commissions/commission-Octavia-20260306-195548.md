---
title: "Commission: Spec: Worker-to-Worker Communication"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for worker-to-worker communication based on the brainstorm at `.lore/brainstorm/worker-communication.md`.\n\nThe brainstorm establishes the core architecture: sleeping commissions (a new commission lifecycle state), mail (a new context type), and the full flow where a commission worker sends mail to another worker, sleeps, and wakes when the reply arrives.\n\n**What the spec needs to cover:**\n\n1. **Sleeping commission state** — New state in the commission lifecycle (`in_progress -> sleeping`, `sleeping -> in_progress`, `sleeping -> cancelled`, `sleeping -> abandoned`). Sleeping means: SDK session drained (no token cost), worktree preserved, session ID saved for resume. Commissions can sleep multiple times.\n\n2. **Mail context type** — A third context type alongside \"commission\" and \"meeting\". The mail reader runs in the sender's worktree with a fresh Claude session, the reader's own posture and tools, and a mail-specific toolbox. Mail is single-turn: read message, do work, reply, done.\n\n3. **Mail toolbox** — At minimum a \"reply\" tool. Resolve the open questions: what other mail-specific tools (if any), whether the reader can see the commission artifact, and whether the reply tool enforces structure.\n\n4. **The full send-mail-sleep-wake flow** — End-to-end lifecycle from the commission worker calling \"send mail\" through to waking with the reply. Include the daemon's role in orchestrating transitions.\n\n5. **Mail storage in `.lore/`** — Resolve the storage shape question from the brainstorm. Pick a structure that's browsable after the commission completes and easy for the mail reader to find its message.\n\n6. **Wake-up prompt content** — What gets injected when the commission resumes: the reply, worktree changes summary, or both.\n\n7. **Resource model** — Whether sleeping commissions count against caps, timeout policy, and what happens if a sleeping commission is cancelled while its mail reader is running.\n\n**Reference these existing specs:**\n- `.lore/specs/guild-hall-workers.md` — Worker activation, posture, tools\n- `.lore/specs/guild-hall-system.md` — System architecture, commission lifecycle\n- `.lore/specs/guild-hall-commissions.md` — Commission states, lifecycle, artifact format\n\n**Decisions already made (from brainstorm, do not revisit):**\n- Mail is a context type, not a variant of commission\n- Sleeping is a proper state, not a flag\n- Mail is single-turn; commissions sleep multiple times for multiple consultations\n- Guild Master doesn't see mail\n- Mail storage is project lore (`.lore/`)\n- No shared mechanism with AskUserQuestion\n- Sleep model chosen over fire-and-forget\n\nResolve the open questions in the brainstorm. Make decisions and document the rationale. The spec should follow the format used by existing specs in `.lore/specs/`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T03:55:48.568Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T03:55:48.572Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
