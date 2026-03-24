---
title: "Commission: Research: Implementation craft knowledge"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the craft of implementation: working from a plan to produce code. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- Working from a plan effectively: when to follow it literally vs. when to deviate\n- Signals that a plan is wrong (friction, impedance mismatch, missing assumptions) and how to respond\n- Testing alongside implementation: TDD vs. test-after, when each works, why \"add tests later\" fails\n- Incremental verification: how to structure work so each step is testable before moving to the next\n- Common implementation failures (scope creep, premature abstraction, skipping edge cases, fighting the framework)\n- How AI implementers differ from human ones (tendency to over-generate, loss of context in long sessions, when to checkpoint)\n\nDraw on external best practices (software craftsmanship literature, XP practices, industry post-mortems), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is a worker about to start implementing from an approved plan.\n\nOutput to `.lore/research/compendium-implementation.md`."
dependencies: []
linked_artifacts:
  - .lore/research/compendium-implementation.md

activity_timeline:
  - timestamp: 2026-03-24T05:56:30.111Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T06:00:01.017Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T06:00:01.109Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T06:00:09.448Z
    event: progress_report
    reason: "Starting research on implementation craft. Checking existing .lore/research/ for related material, then gathering external sources."
  - timestamp: 2026-03-24T06:00:29.162Z
    event: progress_report
    reason: "Read existing compendium format and local retros. Now gathering external sources on implementation craft: plan adherence, testing strategies, incremental verification, common failures, and AI-specific patterns."
  - timestamp: 2026-03-24T06:01:36.420Z
    event: progress_report
    reason: "External research gathered. Have sources on: TDD evidence, AI failure patterns (Osmani 80% problem, CodeRabbit data, Stack Overflow), premature abstraction, incremental development (Beck/XP), context loss in AI sessions. Also reviewed 3 local retros for Guild Hall patterns. Now synthesizing into the research document."
  - timestamp: 2026-03-24T06:03:39.498Z
    event: result_submitted
    reason: "Research document produced at `.lore/research/compendium-implementation.md`.\n\nCovers all six focus areas with sourced evidence:\n- **Plan adherence:** Plan as hypothesis, friction signals, when/how to deviate (XP literature, 3 local retros)\n- **Testing alongside implementation:** TDD evidence (IBM/Microsoft 40-90% defect reduction, EASE 2014), when TDD vs test-after works, why \"add tests later\" fails mechanistically\n- **Incremental verification:** Phase boundaries, compile-test-commit rhythm, what breaks it (Beck small-steps, unified SDK runner retro)\n- **Common failures:** Scope creep (CodeRabbit 98% more PRs / 91% longer review), premature abstraction (van der Linden, Rule of Three), edge case skipping, framework fighting\n- **AI-specific patterns:** Over-generation, context loss, assumption propagation (Osmani 80% problem, Karpathy quote, CodeRabbit 1.7x bug rate, Stack Overflow analysis)\n\n10 sources cited with URLs. 10 distillation-ready principles in synthesis section. Confidence assessment for each major claim. Format matches existing compendium-spec-writing.md pattern."
  - timestamp: 2026-03-24T06:03:44.675Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "External research gathered. Have sources on: TDD evidence, AI failure patterns (Osmani 80% problem, CodeRabbit data, Stack Overflow), premature abstraction, incremental development (Beck/XP), context loss in AI sessions. Also reviewed 3 local retros for Guild Hall patterns. Now synthesizing into the research document."
projectName: guild-hall
---
Research document produced at `.lore/research/compendium-implementation.md`.

Covers all six focus areas with sourced evidence:
- **Plan adherence:** Plan as hypothesis, friction signals, when/how to deviate (XP literature, 3 local retros)
- **Testing alongside implementation:** TDD evidence (IBM/Microsoft 40-90% defect reduction, EASE 2014), when TDD vs test-after works, why "add tests later" fails mechanistically
- **Incremental verification:** Phase boundaries, compile-test-commit rhythm, what breaks it (Beck small-steps, unified SDK runner retro)
- **Common failures:** Scope creep (CodeRabbit 98% more PRs / 91% longer review), premature abstraction (van der Linden, Rule of Three), edge case skipping, framework fighting
- **AI-specific patterns:** Over-generation, context loss, assumption propagation (Osmani 80% problem, Karpathy quote, CodeRabbit 1.7x bug rate, Stack Overflow analysis)

10 sources cited with URLs. 10 distillation-ready principles in synthesis section. Confidence assessment for each major claim. Format matches existing compendium-spec-writing.md pattern.
