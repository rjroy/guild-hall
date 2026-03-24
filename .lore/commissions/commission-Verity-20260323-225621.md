---
title: "Commission: Research: TypeScript practices craft knowledge"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research established TypeScript practices and community conventions. This research will be distilled into a compendium reference entry for Guild Hall workers.\n\nFocus areas:\n- Type system patterns that prevent bugs (discriminated unions, branded types, exhaustive checks, `satisfies`)\n- Common pitfalls (type assertions hiding errors, `any` leaking, enum issues, incorrect generic constraints)\n- Community conventions that improve readability (union types over enums, `unknown` over `any`, explicit return types on public APIs)\n- Testing patterns specific to TypeScript (type-level tests, dependency injection over module mocking)\n- Bun-specific considerations (bun test quirks, module resolution, `mock.module()` avoidance)\n- When strict mode catches real bugs vs. when it's ceremony\n\nDraw on external best practices (TypeScript handbook, community style guides like Google's, established OSS patterns), not just Guild Hall's local patterns. Include sources and citations where available.\n\nProduce a research document suitable for distillation into a 500-1000 word reference entry. Focus on actionable guidance. The audience is a worker writing or reviewing TypeScript code.\n\nOutput to `.lore/research/compendium-typescript-practices.md`."
dependencies: []
linked_artifacts:
  - .lore/research/compendium-typescript-practices.md

activity_timeline:
  - timestamp: 2026-03-24T05:56:21.339Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:58:30.340Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T05:58:30.436Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T05:58:37.569Z
    event: progress_report
    reason: "Starting research. Checking existing .lore/research/ for prior work, then gathering external sources on TypeScript practices."
  - timestamp: 2026-03-24T05:59:35.788Z
    event: progress_report
    reason: "External research gathered. Sources: TypeScript handbook (narrowing, discriminated unions), Google TypeScript style guide, community articles on branded types, satisfies operator, strict mode, type-level testing tools. Now synthesizing into research document."
  - timestamp: 2026-03-24T06:01:17.258Z
    event: result_submitted
    reason: "Research document written to `.lore/research/compendium-typescript-practices.md`.\n\nCovers six sections drawn from external sources (TypeScript handbook, Google TypeScript style guide, community articles, Bun docs, GitHub issues):\n\n1. **Type system patterns** — discriminated unions, exhaustive `never` checks, branded types, `satisfies` operator. Each with code examples and when-to-use guidance.\n2. **Common pitfalls** — type assertions hiding errors, `any` leaking, enum sharp edges, incorrect generic constraints. Sourced primarily from Google's style guide.\n3. **Community conventions** — unions over enums, `unknown` over `any`, explicit return types on public APIs, interfaces vs type aliases, mapped/conditional type restraint.\n4. **Strict mode analysis** — table ranking each strict flag by bug-catching value vs ceremony. `strictNullChecks` and `noImplicitAny` are non-negotiable; `noUncheckedIndexedAccess` is high value but high friction.\n5. **Testing patterns** — DI over module mocking, type-level testing tools (`expect-type`, `tsd`, `@ts-expect-error`), Bun-specific constraints (`mock.module()` avoidance, `spyOn` usage).\n6. **Additional conventions** — `@ts-expect-error` over `@ts-ignore`, wrapper type avoidance, mutable export restrictions.\n\nIncludes confidence assessment table distinguishing verified claims from inferred community consensus. All major claims cite their source."
  - timestamp: 2026-03-24T06:01:21.349Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "External research gathered. Sources: TypeScript handbook (narrowing, discriminated unions), Google TypeScript style guide, community articles on branded types, satisfies operator, strict mode, type-level testing tools. Now synthesizing into research document."
projectName: guild-hall
---
Research document written to `.lore/research/compendium-typescript-practices.md`.

Covers six sections drawn from external sources (TypeScript handbook, Google TypeScript style guide, community articles, Bun docs, GitHub issues):

1. **Type system patterns** — discriminated unions, exhaustive `never` checks, branded types, `satisfies` operator. Each with code examples and when-to-use guidance.
2. **Common pitfalls** — type assertions hiding errors, `any` leaking, enum sharp edges, incorrect generic constraints. Sourced primarily from Google's style guide.
3. **Community conventions** — unions over enums, `unknown` over `any`, explicit return types on public APIs, interfaces vs type aliases, mapped/conditional type restraint.
4. **Strict mode analysis** — table ranking each strict flag by bug-catching value vs ceremony. `strictNullChecks` and `noImplicitAny` are non-negotiable; `noUncheckedIndexedAccess` is high value but high friction.
5. **Testing patterns** — DI over module mocking, type-level testing tools (`expect-type`, `tsd`, `@ts-expect-error`), Bun-specific constraints (`mock.module()` avoidance, `spyOn` usage).
6. **Additional conventions** — `@ts-expect-error` over `@ts-ignore`, wrapper type avoidance, mutable export restrictions.

Includes confidence assessment table distinguishing verified claims from inferred community consensus. All major claims cite their source.
