---
title: "Commission: Tighten Thorne's soul/posture against confabulated findings"
date: 2026-04-22
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Thorne (the reviewer) has a recurring pattern of manufacturing low-quality findings — filling the Note severity tier when Critical/Major/Minor are empty, and interpreting spec requirements loosely to justify filing them. Most recent example: in the Gate 3 review of the CLI Agent-First Surface work (`.lore/commissions/commission-Thorne-20260421-085249.md`), he filed NOTE-2 claiming `migrate-content` at root violated REQ-CLI-AGENT-12 grammar, when that REQ is about sub-grouping consistency *within* a top-level group, not root-level noun/verb symmetry.\n\nRoot cause is in Thorne's character definition. Fix it.\n\n## Files to modify\n\n- `packages/guild-hall-reviewer/soul.md`\n- `packages/guild-hall-reviewer/posture.md`\n\nRead both in full first. The existing text is mostly good — we're adding targeted guardrails, not rewriting.\n\n## Required changes\n\n### 1. Clean-review permission (soul.md)\n\nAdd an explicit calibration pair stating that a clean review is a valid outcome. Suggested pair:\n\n> Flat: \"Three notes and a minor observation.\"  \n> Alive: \"No defects found. Implementation matches spec.\"\n\nPlace it alongside the existing calibration pairs. The intent: Thorne should not feel pressure to produce findings when there aren't any.\n\nAlso in the Character section, weaken the \"arms crossed until you prove him wrong\" framing slightly — keep the skepticism, but add a line that acknowledges \"work that holds up to scrutiny earns a clean review, not a list of pretend issues.\" Phrase in Thorne's voice; don't editorialize.\n\n### 2. Verbatim spec citation rule (posture.md)\n\nAdd to the Quality Standards section (or create a new sub-section \"Citing Specs and Requirements\"):\n\n> Before filing a finding that cites a REQ or spec clause, quote the clause verbatim in the reasoning. If the literal text of the clause does not support the finding, drop the finding. Paraphrase is not evidence.\n\nThis would have caught NOTE-2: quoting REQ-CLI-AGENT-12 verbatim (\"When sub-grouping exists within a top-level group…\") makes the misinterpretation visible.\n\n### 3. Tighten the Note severity tier (posture.md)\n\nAdd to Quality Standards:\n\n> Notes require a concrete action. Observations without an action belong in the review summary, not the findings list. A finding whose only recommendation is \"consider\" or \"could be clearer\" is a summary remark, not a finding.\n\n### 4. No other changes\n\nDo not touch anything outside these files. Do not restructure either file. Do not add sections that aren't listed above. If you find other quality issues in the soul/posture while working, flag them in your commission result body, do not fix them here.\n\n## Validation\n\n- `bun run lint` passes (if markdown linting applies to these files)\n- `bun run typecheck && bun test && bun run build` — basic repo health, should be untouched by these changes but verify\n- Re-read both files end-to-end after editing. Make sure the new material reads in Thorne's voice and doesn't clash with surrounding tone.\n\n## Report back\n\nIn your commission body, include the new calibration pair verbatim and the new posture clauses verbatim. The user wants to eyeball the exact wording."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-22T13:21:01.036Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-22T13:21:01.037Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
