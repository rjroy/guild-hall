---
title: "Commission: Research: TypeScript practices craft knowledge"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research established TypeScript practices and community conventions. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- Type system patterns that prevent bugs (discriminated unions, branded types, exhaustive checks, `satisfies`)\n- Common pitfalls (type assertions hiding errors, `any` leaking, enum issues, incorrect generic constraints)\n- Community conventions that improve readability (union types over enums, `unknown` over `any`, explicit return types on public APIs)\n- Testing patterns specific to TypeScript (type-level tests, dependency injection over module mocking)\n- Bun-specific considerations (bun test quirks, module resolution, `mock.module()` avoidance)\n- When strict mode catches real bugs vs. when it's ceremony\n\nDraw on external best practices (TypeScript handbook, community style guides like Google's, established OSS patterns), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is a worker writing or reviewing TypeScript code.\n\nOutput to `.lore/research/compendium-typescript-practices.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T05:56:21.339Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:58:30.340Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
