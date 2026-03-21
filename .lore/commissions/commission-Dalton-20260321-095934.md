---
title: "Commission: Meeting Layout Phase 2: Condensing header"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 of the meeting view layout spec at `.lore/specs/ui/meeting-view-layout.md`.\n\n**Scope:** REQ-MTG-LAYOUT-10 through REQ-MTG-LAYOUT-16 only.\n\n**Read first:**\n- The spec: `.lore/specs/ui/meeting-view-layout.md` (Phase 2 section, condensed layout diagrams, open questions resolved)\n- `web/components/meeting/MeetingHeader.tsx` and `.module.css`\n- `web/components/ui/WorkerPortrait.tsx` and `.module.css`\n- `web/app/projects/[name]/meetings/[id]/page.tsx` (to see how MeetingHeader is rendered)\n\n**What to do:**\n\n1. **Convert MeetingHeader to client component.** Add `\"use client\"`. Add `condensed` boolean state (default: `false`, meaning expanded). Add a toggle chevron button.\n\n2. **Two visual states:**\n   - **Expanded** (current layout): ornate border-image, large portrait, full breadcrumb, full agenda, model label. Chevron shows collapse icon.\n   - **Condensed** (48-56px bar): simple border (1px solid brass/bronze token), small avatar (`size=\"xs\"`), breadcrumb, agenda truncated to one line with ellipsis, model label. Chevron shows expand icon.\n\n3. **Animated transition:** Use `max-height` transition (200-300ms ease) since CSS can't transition `height: auto`. Set `max-height` large enough for expanded (e.g., 300px), transition to condensed height.\n\n4. **WorkerPortrait `size=\"xs\"` variant:** Add to `WorkerPortrait.tsx` and `.module.css`. 28px frame, ~20px inner. Existing sizes unaffected.\n\n5. **All information remains accessible.** Condensed truncates presentation, doesn't remove data. Expanding restores everything.\n\n**Do NOT touch:**\n- Phase 1 CSS changes (already done)\n- Responsive breakpoints or matchMedia (that's Phase 3)\n- The header starts expanded for now; Phase 3 changes the default on smaller viewports\n\n**Verify:**\n- Run `bun test` to confirm no regressions\n- Use a fresh-context sub-agent to verify against REQ-MTG-LAYOUT-10 through 16"
dependencies:
  - commission-Dalton-20260321-095918
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:59:34.000Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:59:34.002Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
