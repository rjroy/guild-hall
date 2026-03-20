---
title: "Commission: Expand brainstorm: decisions surface — explore alternatives"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Brainstorm Expansion: Decisions Surface\n\nRead `.lore/brainstorm/decisions-surface.md`. The user likes the problem identification but isn't sure the proposed solution is the right one. Expand the brainstorm in place (update the file) to explore more \"what ifs.\"\n\n### What to Explore\n\nThe current proposal is: persist decisions to commission artifacts, add REST endpoints, show in UI. That's one approach. What are the others?\n\nThink about:\n\n**1. Is `record_decision` even the right tool?**\n- Workers call it voluntarily. Do they call it enough? Too much? Is the data quality consistent?\n- What if the real problem isn't surfacing decisions but getting workers to record better ones?\n- What if instead of (or in addition to) voluntary recording, we extracted decisions from the transcript/output after the fact? (Similar to how the memory triage brainstorm proposes LLM extraction.)\n\n**2. Where should decisions live?**\n- The proposal says persist to the commission artifact body. But decisions span commissions — a decision in Phase 1 constrains Phase 2. Should decisions be their own artifacts? A project-level decisions log?\n- What if decisions were memory entries instead of artifact sections? They'd then be available to future workers automatically via memory injection.\n- What if decisions flowed into the briefing? The briefing generator could surface recent decisions so the Guild Master has context.\n- What about a dedicated `.lore/decisions/` directory with one file per decision? Like issues but for reasoning.\n\n**3. What's the real user need?**\n- Is the user trying to audit worker reasoning after the fact? (Then artifact persistence is key.)\n- Is the user trying to ensure continuity across commissions? (Then memory or briefing injection is key.)\n- Is the user trying to catch bad decisions before they propagate? (Then real-time surfacing during active sessions is key.)\n- Are these different features or the same feature with different surfaces?\n\n**4. The cleanup problem is real but the solution space is wider.**\n- The brainstorm correctly identifies that state cleanup destroys decisions. But the fix could be: don't delete them (archive instead), persist to artifact, persist to memory, or extract before cleanup.\n- What are the tradeoffs of each?\n\n**5. What if decisions were events?**\n- The event router exists. What if `record_decision` emitted an event? Then triggered commissions (see `.lore/brainstorm/triggered-commissions.md` if it exists) could react to decisions. A decision about architecture could auto-trigger a review.\n\n**6. Scale and noise.**\n- If every commission records 3-5 decisions, and there are 80+ commissions in a batch, that's 240-400 decisions. How does any surface handle that volume without becoming noise?\n- Do decisions need importance/category/scope metadata to be filterable?\n\n### Format\n\nUpdate the existing file. Keep the original evidence and proposal sections. Add a new `## Alternative Approaches` section (or similar) that explores these what-ifs. Don't pick a winner — lay out the design space so the user can decide direction."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/decisions-surface.md

activity_timeline:
  - timestamp: 2026-03-20T21:32:54.245Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T21:32:54.247Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T21:32:54.291Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T21:34:16.152Z
    event: progress_report
    reason: "Read the existing decisions-surface brainstorm, the triggered-commissions and commission-outcomes-to-memory brainstorms for cross-references, verified the record_decision implementation and state cleanup behavior. Now drafting the expanded what-if exploration."
  - timestamp: 2026-03-20T21:36:35.235Z
    event: result_submitted
    reason: "Expanded `.lore/brainstorm/decisions-surface.md` with a new \"Alternative Approaches\" section exploring the full design space. The expansion covers seven areas: (1) whether `record_decision` is the right input mechanism, including voluntary improvement vs. LLM extraction; (2) five storage options with tradeoffs (artifact body, project memory, `.lore/decisions/` directory, briefing injection, and a combined approach); (3) three distinct user needs (audit, continuity, real-time intervention) and how each maps to different solution shapes; (4) four approaches to the state cleanup problem; (5) decisions as EventBus events with connections to the triggered-commissions brainstorm; (6) scale and noise concerns with filtering metadata dimensions; and (7) a summary table mapping approaches to needs, scope, and dependencies, with three natural groupings (minimum viable, continuity-focused, full observability). All technical claims verified against the codebase. Original sections preserved intact."
  - timestamp: 2026-03-20T21:36:40.901Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read the existing decisions-surface brainstorm, the triggered-commissions and commission-outcomes-to-memory brainstorms for cross-references, verified the record_decision implementation and state cleanup behavior. Now drafting the expanded what-if exploration."
projectName: guild-hall
---
Expanded `.lore/brainstorm/decisions-surface.md` with a new "Alternative Approaches" section exploring the full design space. The expansion covers seven areas: (1) whether `record_decision` is the right input mechanism, including voluntary improvement vs. LLM extraction; (2) five storage options with tradeoffs (artifact body, project memory, `.lore/decisions/` directory, briefing injection, and a combined approach); (3) three distinct user needs (audit, continuity, real-time intervention) and how each maps to different solution shapes; (4) four approaches to the state cleanup problem; (5) decisions as EventBus events with connections to the triggered-commissions brainstorm; (6) scale and noise concerns with filtering metadata dimensions; and (7) a summary table mapping approaches to needs, scope, and dependencies, with three natural groupings (minimum viable, continuity-focused, full observability). All technical claims verified against the codebase. Original sections preserved intact.
