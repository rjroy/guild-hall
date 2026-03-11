---
title: "Commission: Spec: Personal Assistant Worker MVP"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an MVP spec for a Personal Assistant Worker (the \"Steward\") for Guild Hall.\n\n**Key constraint: MVP means what we can do TODAY with existing infrastructure.** No new system features. No scheduled commissions (not built yet). No calendar toolbox (not built yet). No notification channel. No user-level commissions. Just a new worker package that uses what already exists.\n\n**What already exists and is fair game:**\n- The mail reader toolbox (`guild-hall-email` package) gives read-only Fastmail access via JMAP. Any worker can declare it as a domain toolbox.\n- Worker-to-worker mail (`send_mail` tool) lets workers communicate. The Steward could send mail to the Guild Master to flag urgent items.\n- Worker memory (global/project/worker scope) persists across sessions.\n- Commissions and meetings work as normal. The user can commission the Steward manually for now.\n- The existing worker package structure (`packages/guild-hall-<name>/`) with identity, posture, checkout scope, domain toolbox declarations.\n\n**What the spec should define:**\n1. Worker identity: The \"Steward\" (Guild Steward). Fantasy guild aesthetic. Manages the household, handles correspondence, prepares context for the guild's work.\n2. Package structure: `packages/guild-hall-steward/`\n3. Domain toolboxes: `guild-hall-email` (the existing mail reader)\n4. Checkout scope: sparse (like Verity the Researcher). The Steward reads project artifacts for context but doesn't write code.\n5. Core capabilities as manually-commissioned tasks:\n   - **Inbox triage**: Scan recent emails, categorize by urgency/topic, produce a summary\n   - **Meeting prep**: Given a meeting topic or attendee, pull relevant email threads and summarize\n   - **Email research**: Deep-dive into a specific email thread or topic across the inbox\n6. Posture: Advisory only. Observes but never acts on the user's behalf. Read-only email access.\n7. Memory conventions: What the Steward persists across sessions (contacts context, user preferences for triage criteria, active thread tracking)\n8. Relationship to Guild Master: When the Steward finds something urgent, it can send worker mail to the Guild Master. The Guild Master decides whether to escalate.\n\n**What to explicitly defer (mention but scope out):**\n- Scheduled commissions (proactive behavior, morning digest)\n- Calendar toolbox\n- Email write/send capability\n- Cross-project commission concept\n- Notification/push mechanisms\n- Dual worker+toolbox package shape\n\n**Reference material:**\n- Brainstorm: `.lore/brainstorm/personal-assistant-worker.md` (the full brainstorm, lots of good ideas to reference)\n- Mail reader toolbox spec: `.lore/specs/workers/guild-hall-mail-reader-toolbox.md`\n- Worker spec: `.lore/specs/workers/guild-hall-workers.md`\n- Worker roster: `.lore/specs/workers/guild-hall-worker-roster.md`\n- Worker communication: `.lore/specs/workers/worker-communication.md`\n\nOutput the spec to `.lore/specs/workers/guild-hall-steward-worker.md` following the project's spec conventions (frontmatter, REQ- prefix, etc.)."
dependencies: []
linked_artifacts:
  - .lore/specs/workers/guild-hall-steward-worker.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-10T08:08:00.105Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T08:08:00.106Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T08:08:00.139Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T08:08:07.171Z
    event: progress_report
    reason: "Starting work: reading reference materials before drafting the Steward spec."
  - timestamp: 2026-03-10T08:10:38.354Z
    event: progress_report
    reason: "Reference material read. Writing the Steward spec now."
  - timestamp: 2026-03-10T08:14:45.749Z
    event: result_submitted
    reason: "Wrote the MVP spec for the Guild Hall Steward Worker at `.lore/specs/workers/guild-hall-steward-worker.md`.\n\nThe spec defines:\n- **Package structure**: `packages/guild-hall-steward/` with 4 files (package.json, soul.md, posture.md, index.ts), matching the established worker package pattern.\n- **Worker identity**: Edmund (Guild Steward), sparse checkout, `guild-hall-email` domain toolbox, no web tools in the MVP.\n- **Soul and posture content**: Character grounded in the household steward role (reads correspondence, organizes, advises without acting), with calibration pairs targeting the specific failure modes of an inbox assistant (vague summaries, false urgency, unrequested padding).\n- **Three core capabilities** as manually-commissioned tasks: inbox triage (categorized by urgency with Urgent / Action needed / FYI / Active threads / Quiet), meeting prep (context + open items + recommended reading), and email research (full synthesis with timeline and participants).\n- **Advisory posture**: Read-only enforced at the toolbox level (REQ-EMT-6), reinforced in posture. The Steward observes and surfaces; all action belongs to the user.\n- **Memory conventions**: Three structured worker-scoped files — `contacts.md`, `preferences.md` (user-configured triage criteria), and `active-threads.md` — with additive update semantics and overflow detection at ~50 rows.\n- **Guild Master escalation** via `send_mail`: conservative criteria (deadline pressure, commission blocker, urgent contact) to keep escalation meaningful. The Guild Master decides what to do with the information.\n- **Deferred scope** explicitly named: scheduled commissions, calendar toolbox, email write/send, cross-project commissions, notification mechanisms, and dual worker+toolbox package shape.\n\nAll 20 REQ-STW requirements are internally consistent, and all 27 external REQ cross-references were verified against the source specs before writing."
  - timestamp: 2026-03-10T08:14:52.930Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Reference material read. Writing the Steward spec now."
projectName: guild-hall
---
Wrote the MVP spec for the Guild Hall Steward Worker at `.lore/specs/workers/guild-hall-steward-worker.md`.

The spec defines:
- **Package structure**: `packages/guild-hall-steward/` with 4 files (package.json, soul.md, posture.md, index.ts), matching the established worker package pattern.
- **Worker identity**: Edmund (Guild Steward), sparse checkout, `guild-hall-email` domain toolbox, no web tools in the MVP.
- **Soul and posture content**: Character grounded in the household steward role (reads correspondence, organizes, advises without acting), with calibration pairs targeting the specific failure modes of an inbox assistant (vague summaries, false urgency, unrequested padding).
- **Three core capabilities** as manually-commissioned tasks: inbox triage (categorized by urgency with Urgent / Action needed / FYI / Active threads / Quiet), meeting prep (context + open items + recommended reading), and email research (full synthesis with timeline and participants).
- **Advisory posture**: Read-only enforced at the toolbox level (REQ-EMT-6), reinforced in posture. The Steward observes and surfaces; all action belongs to the user.
- **Memory conventions**: Three structured worker-scoped files — `contacts.md`, `preferences.md` (user-configured triage criteria), and `active-threads.md` — with additive update semantics and overflow detection at ~50 rows.
- **Guild Master escalation** via `send_mail`: conservative criteria (deadline pressure, commission blocker, urgent contact) to keep escalation meaningful. The Guild Master decides what to do with the information.
- **Deferred scope** explicitly named: scheduled commissions, calendar toolbox, email write/send, cross-project commissions, notification mechanisms, and dual worker+toolbox package shape.

All 20 REQ-STW requirements are internally consistent, and all 27 external REQ cross-references were verified against the source specs before writing.
