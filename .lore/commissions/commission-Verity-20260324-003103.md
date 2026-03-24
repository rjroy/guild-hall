---
title: "Commission: Research: TypeScript practices craft knowledge [recommission]"
date: 2026-03-24
status: pending
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research established TypeScript practices and community conventions. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- Type system patterns that prevent bugs (discriminated unions, branded types, exhaustive checks, `satisfies`)\n- Common pitfalls (type assertions hiding errors, `any` leaking, enum issues, incorrect generic constraints)\n- Community conventions that improve readability (union types over enums, `unknown` over `any`, explicit return types on public APIs)\n- Testing patterns specific to TypeScript (type-level tests, dependency injection over module mocking)\n- Bun-specific considerations (bun test quirks, module resolution, `mock.module()` avoidance)\n- When strict mode catches real bugs vs. when it's ceremony\n\nDraw on external best practices (TypeScript handbook, community style guides like Google's, established OSS patterns), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is a worker writing or reviewing TypeScript code.\n\nNOTE: A previous commission for this exact research completed. Check if `.lore/research/compendium-typescript-practices.md` already exists. If it does and the content is solid, you're done. If it doesn't exist or is incomplete, produce it fresh.\n\nOutput to `.lore/research/compendium-typescript-practices.md`."
dependencies:
  - commission-Octavia-20260324-003032
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T07:31:03.856Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T07:31:03.858Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-24T07:32:12.796Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
current_progress: ""
projectName: guild-hall
---
