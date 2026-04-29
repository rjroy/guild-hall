---
title: Learned lessons index
status: active
---

# Learned

Hard-won lessons from working on Guild Hall, organized by abstraction depth. Each file is a single observation with a frontmatter tag set and a one-paragraph rule.

## Reading order

Drill from broad to specific. Each layer assumes the one above it.

1. **`principles/`** — Mindset and posture that applies to all work. Start here if you're new to the project or want the philosophical baseline. Three observations about root-cause discipline, verification habit, and audit posture.
2. **`process/`** — Workflow discipline for the spec → plan → commission → review loop. Start here when something about the agent workflow feels miscalibrated. Lessons about spec drift, plan hedging, dispatch coverage, and review routing.
3. **`practices/`** — Engineering tactics applied during implementation. Start here when you're about to refactor, write tests, or debug specific code. Includes refactoring discipline, test hygiene, and concrete code-level recipes.

A reader who only has time for one layer should read `principles/`. A reader debugging a workflow problem should jump to `process/`. A reader about to write code should skim `practices/`.

## Layer dependencies

- `practices/` tactics assume the `process/` workflow exists around them. A "refactor faithfully reproduces source error handling" lesson only matters if a refactor commission was dispatched.
- `process/` workflow assumes the `principles/` posture. The reason "WARN findings get dropped" is a problem at all is because principles say work shouldn't go dark.
- `principles/` stand alone. They apply outside Guild Hall.

When a future lesson lands, place it one layer above its highest dependency. A new "always grep before X" lesson is `principles/`. A new "commissions of type Y need artifact Z" lesson is `process/`. A new "when using library W, prefer pattern P" lesson is `practices/`.

## What each directory holds

### `principles/` — broad posture and verification habits

- **`workarounds-breed-workarounds.md`** — why root-cause fixes matter; obfuscation patterns that train contributors to avoid digging.
- **`sub-agent-claims-cross-referenced-with-grep.md`** — sub-agents reading commission text in isolation will misread closed findings as open; verify before publishing.
- **`mapping-tables-are-load-bearing-documentation.md`** — when a table says two inputs produce the same output, that's a duplication bug hiding in plain sight.

### `process/` — commission, spec, plan, and review discipline

- **`action-plans-state-what-will-happen-not-what-wont.md`** — once planning commits, alternatives are noise; cut spec-phase hedging from plans.
- **`implementation-deviations-need-explicit-spec-alignment.md`** — commissions record deviations in their notes but leave specs stale; needs an explicit alignment step.
- **`plans-need-a-spec-revision-pin.md`** — a plan re-read pays full cost when the spec has revised between commission and rework; pin the spec revision.
- **`specs-dont-survive-multi-phase-lag.md`** — phase-author-to-implementer lag invalidates line numbers in long-lived specs; mark them advisory or shorten the lag.
- **`dispatch-review-commissions-for-every-implementation.md`** — skipping review on "simple" work breaks the spec-to-plan-to-implement-to-review chain.
- **`foundation-review-fix-fanout-origin.md`** — origin of the foundation-then-review-then-fix-then-fan-out pattern (heartbeat dispatch failure).
- **`open-meeting-items-go-dark-without-commissions.md`** — anything left in meeting notes goes dark; dispatch a commission before the meeting closes.
- **`research-commissions-need-artifact-verification.md`** — "written to X" is narration, not a receipt; fail completion if the file doesn't exist.
- **`warn-level-review-findings-get-dropped.md`** — WARN-rated findings don't trigger fix commissions; they need a separate routing path.

### `practices/` — engineering tactics and code-level recipes

- **`large-refactors-need-prerequisite-extractions.md`** — when a refactor feels too big, look for a smaller extraction first.
- **`refactors-reproduce-source-error-handling.md`** — refactors faithfully reproduce the error handling of the source unless it's a named target.
- **`grep-for-old-terms-after-infrastructure-refactor.md`** — type-checking won't catch stale references in tool descriptions, comments, or JSDoc.
- **`linked-artifacts-is-schema-not-prose.md`** — `linked_artifacts` entries are foreign keys; layout migrations must rewrite them in the same operation.
- **`test-spy-must-be-reachable.md`** — a spy asserted "never called" must actually be reachable from the path under test.
- **`extract-module-wiring-to-factories-for-bun-coverage.md`** — Bun's function coverage counts every lambda; extract module-level wiring into named factories.
- **`use-os-tmpdir-not-hardcoded-tmp-paths.md`** — hardcoded `/tmp/` paths fail under the pre-commit sandbox; use `os.tmpdir()`.
- **`pick-one-source-when-sdk-streams-text-twice.md`** — when the SDK emits both streaming and complete messages, pick one source for text.
- **`terminal-state-guard-for-cancel-completion-race.md`** — fire-and-forget async with a cancel method needs a terminal state guard.

## Conventions

- **Frontmatter** — every file has `title`, `date`, `status`, `tags`, `modules`. Tags drive discovery; titles read as full sentences.
- **One paragraph per file** — lessons stay short enough to scan. If a lesson grows beyond a paragraph, it's two lessons.
- **Bare-name cross-references** — refer to other lessons by filename without path; readers grep. Keeps moves cheap.
- **Status discipline** — `active` for current; `superseded` when a later lesson replaces this one (link forward in the body).
