---
title: "Commission: Research: Code review craft knowledge"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the domain of code review practices. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- What to look for in reviews beyond \"does it work\" (design, naming, testability, error handling, security)\n- Severity calibration: how to distinguish critical findings from nits\n- How to present findings constructively (observation-based, not accusation-based)\n- Common anti-patterns in reviews (rubber-stamping, bikeshedding, gatekeeping)\n- Review checklists that actually improve quality vs. those that become checkbox exercises\n- How AI reviewers differ from human reviewers (what they catch well, what they miss)\n\nDraw on external best practices (Google's engineering practices, Microsoft's code review research, etc.), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is a worker about to conduct or respond to a code review.\n\nOutput to `.lore/research/compendium-code-review.md`."
dependencies: []
linked_artifacts:
  - .lore/research/compendium-code-review.md

activity_timeline:
  - timestamp: 2026-03-24T05:56:12.508Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:57:39.838Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T05:57:39.934Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T05:57:46.242Z
    event: progress_report
    reason: "Starting research on code review best practices. Gathering external sources from Google, Microsoft, and industry literature."
  - timestamp: 2026-03-24T05:58:52.897Z
    event: progress_report
    reason: "Collected sources from Google engineering practices, Microsoft research, AWS DevOps guidance, Dr. Michaela Greiler's research, and multiple articles on AI vs human review. Now synthesizing into research document."
  - timestamp: 2026-03-24T06:00:57.451Z
    event: result_submitted
    reason: "Research document produced at `.lore/research/compendium-code-review.md`. Covers seven sections drawn from nine external sources:\n\n1. **What to look for** — Eight review dimensions prioritized (design > functionality > complexity > error handling > tests > naming > security > docs), sourced from Google's engineering practices with Guild Hall context added.\n2. **Severity calibration** — Google's labeling scheme (unlabeled/Nit/Optional/FYI) plus calibration heuristics for critical vs. important vs. nit.\n3. **Constructive feedback** — Observation-based framing, explain reasoning, point out problems rather than dictating solutions. Microsoft's empirical finding that reviewer domain familiarity outweighs raw experience.\n4. **Anti-patterns** — Six documented patterns (rubber stamping, bikeshedding, gatekeeping, the gauntlet, large batch reviews, lack of follow-through) with sources.\n5. **Checklists** — When they improve quality (specific, short, updated from real findings) vs. when they become checkbox exercises (too long, too generic, never updated).\n6. **AI vs. human reviewers** — What AI catches (pattern-matching, consistency, coverage gaps), what it misses (business context, architecture, threat modeling, mentorship), and failure modes (volume flooding, generic noise, false confidence). Includes CodeRabbit's quantitative data (1.7x more issues in AI code).\n7. **Key takeaways** — Eight distillation-ready points for the compendium entry.\n\nAll claims are sourced. Confidence levels: Google and Microsoft findings are verified against published documents. CodeRabbit statistics are from their published 2025 report (vendor research, not peer-reviewed). AWS anti-patterns are from official documentation."
  - timestamp: 2026-03-24T06:01:01.794Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Collected sources from Google engineering practices, Microsoft research, AWS DevOps guidance, Dr. Michaela Greiler's research, and multiple articles on AI vs human review. Now synthesizing into research document."
projectName: guild-hall
---
Research document produced at `.lore/research/compendium-code-review.md`. Covers seven sections drawn from nine external sources:

1. **What to look for** — Eight review dimensions prioritized (design > functionality > complexity > error handling > tests > naming > security > docs), sourced from Google's engineering practices with Guild Hall context added.
2. **Severity calibration** — Google's labeling scheme (unlabeled/Nit/Optional/FYI) plus calibration heuristics for critical vs. important vs. nit.
3. **Constructive feedback** — Observation-based framing, explain reasoning, point out problems rather than dictating solutions. Microsoft's empirical finding that reviewer domain familiarity outweighs raw experience.
4. **Anti-patterns** — Six documented patterns (rubber stamping, bikeshedding, gatekeeping, the gauntlet, large batch reviews, lack of follow-through) with sources.
5. **Checklists** — When they improve quality (specific, short, updated from real findings) vs. when they become checkbox exercises (too long, too generic, never updated).
6. **AI vs. human reviewers** — What AI catches (pattern-matching, consistency, coverage gaps), what it misses (business context, architecture, threat modeling, mentorship), and failure modes (volume flooding, generic noise, false confidence). Includes CodeRabbit's quantitative data (1.7x more issues in AI code).
7. **Key takeaways** — Eight distillation-ready points for the compendium entry.

All claims are sourced. Confidence levels: Google and Microsoft findings are verified against published documents. CodeRabbit statistics are from their published 2025 report (vendor research, not peer-reviewed). AWS anti-patterns are from official documentation.
