---
title: "Commission: Research: Commission prompt craft knowledge"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research what makes effective commission prompts for delegated AI work. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- What makes a good prompt for delegated work (clear scope, explicit constraints, success criteria, context pointers)\n- Common gaps that cause rework (missing constraints, assumed context, ambiguous scope boundaries, unspecified edge cases)\n- How prompt structure affects output quality (front-loading key information, naming files and line numbers, stating what NOT to do)\n- The difference between prompts for implementation, review, research, and documentation work\n- How to reference plans and specs effectively in prompts (pointer vs. summary, what to repeat vs. what to trust the worker to read)\n- Anti-patterns (over-specification that constrains good judgment, under-specification that requires guessing, mixing concerns in one prompt)\n\nDraw on external best practices (prompt engineering research, delegation literature, LLM usage studies), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is the Guild Master or a user writing commission prompts.\n\nOutput to `.lore/research/compendium-commission-prompts.md`."
dependencies: []
linked_artifacts:
  - .lore/research/compendium-commission-prompts.md

activity_timeline:
  - timestamp: 2026-03-24T05:56:40.157Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T06:01:01.846Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T06:01:01.939Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T06:01:09.442Z
    event: progress_report
    reason: "Starting research on effective commission prompts. Gathering internal patterns and external sources."
  - timestamp: 2026-03-24T06:01:51.866Z
    event: progress_report
    reason: "Internal patterns analyzed (4 commission types: implementation, review, research, brainstorm). Searching for deeper external sources now."
  - timestamp: 2026-03-24T06:02:18.432Z
    event: progress_report
    reason: "All sources gathered. Synthesizing findings into research document now."
  - timestamp: 2026-03-24T06:04:53.656Z
    event: result_submitted
    reason: "Research document written to `.lore/research/compendium-commission-prompts.md`.\n\nThe document covers:\n- **Five elements** of effective commission prompts (outcome, context pointers, constraints, verification criteria, output specification)\n- **Prompt structure effects** (front-loading, specificity over brevity, curse of instructions)\n- **Work-type-specific guidance** for implementation, review, research, and brainstorm/documentation prompts, each with primary failure modes and what to include/avoid\n- **Referencing plans and specs** (pointer vs summary vs hybrid, what to repeat vs trust)\n- **Five common gaps** that cause rework (missing integration context, assumed conventions, ambiguous scope, prompt-as-hope, missing verification)\n- **Four anti-patterns** (over-specification, under-specification, mixing concerns, conclusion forcing)\n- **15 distillation-ready principles** for the compendium entry\n\nSources: Anthropic's official docs, Augment Code, Cursor, Osmani, deliberate.codes, plus 85+ local commission artifacts and 30+ retros. Confidence assessments distinguish high-confidence claims (multiple independent sources) from medium-confidence claims (local observation with reasonable extrapolation)."
  - timestamp: 2026-03-24T06:04:56.990Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All sources gathered. Synthesizing findings into research document now."
projectName: guild-hall
---
Research document written to `.lore/research/compendium-commission-prompts.md`.

The document covers:
- **Five elements** of effective commission prompts (outcome, context pointers, constraints, verification criteria, output specification)
- **Prompt structure effects** (front-loading, specificity over brevity, curse of instructions)
- **Work-type-specific guidance** for implementation, review, research, and brainstorm/documentation prompts, each with primary failure modes and what to include/avoid
- **Referencing plans and specs** (pointer vs summary vs hybrid, what to repeat vs trust)
- **Five common gaps** that cause rework (missing integration context, assumed conventions, ambiguous scope, prompt-as-hope, missing verification)
- **Four anti-patterns** (over-specification, under-specification, mixing concerns, conclusion forcing)
- **15 distillation-ready principles** for the compendium entry

Sources: Anthropic's official docs, Augment Code, Cursor, Osmani, deliberate.codes, plus 85+ local commission artifacts and 30+ retros. Confidence assessments distinguish high-confidence claims (multiple independent sources) from medium-confidence claims (local observation with reasonable extrapolation).
