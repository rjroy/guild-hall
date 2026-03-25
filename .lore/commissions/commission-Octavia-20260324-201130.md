---
title: "Commission: Brainstorm: Expand Guild Campaigns proposal (artifact purpose and usage)"
date: 2026-03-25
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Expand on Proposal 1 (Guild Campaigns) from `.lore/brainstorm/guild-hall-future-vision.md`. The user feels the proposal is half-baked. The core question: **what is the purpose of campaign artifact files, and how would they be used?**\n\nThe current proposal describes four components (Goal, Living Plan, Waves, Milestones) and a campaign artifact that tracks goal/status/waves/commissions/milestones. But it doesn't dig into the \"why\" and \"how\" of these files as working documents.\n\nWrite your brainstorm to `.lore/brainstorm/guild-campaigns-artifact-design.md`.\n\nQuestions to explore:\n\n1. **What problem do campaign artifacts solve that commission artifacts don't?** Commissions already have artifacts with timelines, progress, and results. What does a campaign-level artifact add? What context gets lost between commission waves today that campaign artifacts would preserve?\n\n2. **Who reads campaign artifacts, and when?** The Guild Master between waves? The user at milestones? Workers during commissions within a wave? Each reader has different needs. What does each reader need from the artifact?\n\n3. **What goes into the Living Plan?** The proposal says the Guild Master updates it between waves. What does an update look like? Is it a rewrite? An append? A diff from the previous version? How does it stay \"living\" without becoming a dumping ground?\n\n4. **How do campaign artifacts interact with existing artifacts?** Specs, plans, retros, and commission artifacts already exist. Does the campaign artifact reference them? Supersede them? How does a reader navigate from a campaign to its constituent work and back?\n\n5. **What does the milestone checkpoint look like concretely?** The user reviews and approves. Reviews what, exactly? A diff of the plan? A summary of wave results? A proposed next wave? What artifact is the user reading when they decide whether to continue?\n\n6. **What happens when a campaign's goal changes?** The proposal says the user can \"adjust the goal.\" Does the old goal get recorded? Is there a history of goal evolution? How does the plan adapt?\n\n7. **How does the Guild Master use campaign context during wave planning?** Today the Guild Master plans commissions from specs and user direction. With campaigns, it would also have the campaign history. How does that change what it dispatches? What decisions does it make differently?\n\nGround your exploration in the current system's real gaps. The user's observation is that artifact files add \"a way of carrying and managing context long term.\" Push on that: what context, carried where, managed how, and consumed by whom?\n\nRead the existing proposal thoroughly, and also read `.lore/vision.md` for the principles the expansion should align with. Reference concrete examples from how the guild has been used (the worker-sub-agents 31-commission batch, the event router mid-batch rewrite) to illustrate what campaigns would have changed."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/guild-campaigns-artifact-design.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-25T03:11:30.157Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T03:11:30.158Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T03:11:30.201Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-25T03:11:36.556Z
    event: progress_report
    reason: "Reading existing brainstorm and vision documents before drafting the campaign artifact design brainstorm."
  - timestamp: 2026-03-25T03:12:55.901Z
    event: progress_report
    reason: "Read both documents. Now drafting the campaign artifact design brainstorm. The core gap I'm mapping: commission artifacts capture \"what happened\" within a bounded deliverable; nothing captures \"why we're doing this,\" \"what we learned between waves,\" or \"how the plan has evolved.\" The brainstorm will cover seven questions with concrete examples from the worker-sub-agents batch and event router rewrite."
  - timestamp: 2026-03-25T03:15:51.709Z
    event: result_submitted
    reason: "Wrote `.lore/brainstorm/guild-campaigns-artifact-design.md` — a deep exploration of campaign artifact design covering all seven questions.\n\nKey findings:\n\n**The core gap named precisely**: Commission artifacts carry *completion context* (what was done). Campaigns need *strategic context* (why we're doing this, what we've learned across waves, how the plan has evolved). That context is what gets manually reconstructed each wave today.\n\n**Three distinct readers with different needs**:\n- Guild Master between waves: needs the living plan + wave summaries + decision log (compact orientation, not archaeology)\n- User at milestones: reads a prepared milestone checkpoint document (a prose briefing, not a status dump), makes a go/no-go call on the proposed next wave\n- Workers within a wave: receive campaign context block in their commission prompt, not the full artifact\n\n**Living Plan mechanics**: Two-section model — `Current Plan` is rewritten clean each update (reflects current best understanding); `Plan History` is append-only with delta + reason. Avoids both the \"clean rewrite loses history\" and \"append-only becomes a dump\" failure modes.\n\n**Campaign artifact vs. milestone document are different files**. The campaign artifact is the running record (always accumulating). The milestone checkpoint is a prepared briefing for a specific decision moment. Conflating them serves neither reader well.\n\n**Concrete structure for milestones**: Goal progress (genuine assessment, not activity count), what changed since last checkpoint, proposed next wave (specific commissions to specific workers), decision points requiring user input, three choices: continue/adjust/pause.\n\n**Goal evolution**: Four types — refinement, pivot, expansion, scope reduction — each requires an entry in the goal history with a named reason. This is what distinguishes deliberate evolution from silent drift.\n\n**Real examples grounded**: Worker-sub-agents 31-commission batch (synthesis evaporated each wave, no record of wave structure rationale), event router mid-batch rewrite (decision reasoning lived in a meeting, not an artifact — the revised plan would have recorded the causal chain).\n\n**Seven open questions** flagged for spec: file structure (one file vs. directory), milestone triggers, wave granularity for iterative mid-wave dispatch, campaign registration model, commission-campaign binding (who sets the `campaign` field), and abandonment state."
  - timestamp: 2026-03-25T03:16:00.295Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read both documents. Now drafting the campaign artifact design brainstorm. The core gap I'm mapping: commission artifacts capture \"what happened\" within a bounded deliverable; nothing captures \"why we're doing this,\" \"what we learned between waves,\" or \"how the plan has evolved.\" The brainstorm will cover seven questions with concrete examples from the worker-sub-agents batch and event router rewrite."
projectName: guild-hall
---
Wrote `.lore/brainstorm/guild-campaigns-artifact-design.md` — a deep exploration of campaign artifact design covering all seven questions.

Key findings:

**The core gap named precisely**: Commission artifacts carry *completion context* (what was done). Campaigns need *strategic context* (why we're doing this, what we've learned across waves, how the plan has evolved). That context is what gets manually reconstructed each wave today.

**Three distinct readers with different needs**:
- Guild Master between waves: needs the living plan + wave summaries + decision log (compact orientation, not archaeology)
- User at milestones: reads a prepared milestone checkpoint document (a prose briefing, not a status dump), makes a go/no-go call on the proposed next wave
- Workers within a wave: receive campaign context block in their commission prompt, not the full artifact

**Living Plan mechanics**: Two-section model — `Current Plan` is rewritten clean each update (reflects current best understanding); `Plan History` is append-only with delta + reason. Avoids both the "clean rewrite loses history" and "append-only becomes a dump" failure modes.

**Campaign artifact vs. milestone document are different files**. The campaign artifact is the running record (always accumulating). The milestone checkpoint is a prepared briefing for a specific decision moment. Conflating them serves neither reader well.

**Concrete structure for milestones**: Goal progress (genuine assessment, not activity count), what changed since last checkpoint, proposed next wave (specific commissions to specific workers), decision points requiring user input, three choices: continue/adjust/pause.

**Goal evolution**: Four types — refinement, pivot, expansion, scope reduction — each requires an entry in the goal history with a named reason. This is what distinguishes deliberate evolution from silent drift.

**Real examples grounded**: Worker-sub-agents 31-commission batch (synthesis evaporated each wave, no record of wave structure rationale), event router mid-batch rewrite (decision reasoning lived in a meeting, not an artifact — the revised plan would have recorded the causal chain).

**Seven open questions** flagged for spec: file structure (one file vs. directory), milestone triggers, wave granularity for iterative mid-wave dispatch, campaign registration model, commission-campaign binding (who sets the `campaign` field), and abandonment state.
