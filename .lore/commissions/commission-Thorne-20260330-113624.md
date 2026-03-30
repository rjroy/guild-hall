---
title: "Commission: Review: Quick-add issues against spec"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the quick-add issues implementation against the spec at `.lore/specs/ui/quick-add-issues.md` and the plan at `.lore/plans/ui/quick-add-issues.md`.\n\nThis is Phase 8 from the plan. Dalton built phases 1-7 in the preceding commission.\n\nCheck:\n1. **Spec compliance** — Verify every REQ (QAI-1 through QAI-22) is satisfied. Flag any gaps.\n2. **File content correctness** — Read written issue files in tests. Verify YAML frontmatter format (`title`, `date`, `status: open`), quoted titles, body separation.\n3. **Commit message format** — Verify `\"Add issue: <slug>\"` pattern.\n4. **Error states** — Empty title returns 400. Unknown project returns 404. Commit failure is non-fatal (still 201). Title over 200 chars returns 400.\n5. **Slug generation** — All three spec examples pass. Conflict resolution appends `-2`, `-3`, etc.\n6. **Component behavior** — Form expands inline (not modal). Submit disabled during request. Form collapses on success with timed confirmation. Stays open on error.\n7. **No router.refresh()** after creation (REQ-QAI-20 explicit).\n8. **No SSE event** emitted (spec constraint).\n9. **CLI stdin** — `-` as body positional reads from stdin. Document any divergence from `--body -` named flag form.\n10. **Test coverage** — Unit tests for `slugify`, `resolveSlug`. Route tests for all error and success paths. Component tests documented if JSDOM absent.\n\nWrite findings to `.lore/reviews/` as usual."
dependencies:
  - commission-Dalton-20260330-113608
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-30T18:36:24.348Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T18:36:24.350Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-30T18:41:19.141Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-30T18:41:19.144Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
