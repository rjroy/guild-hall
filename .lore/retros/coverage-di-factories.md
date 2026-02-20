---
title: Coverage gaps closed by extracting DI factories from hardcoded singletons
date: 2026-02-13
status: complete
tags: [testing, coverage, dependency-injection, refactor]
modules: [server-context, node-session-store, tools-invoke-route, mock-fs]
related: [.lore/notes/phase-1/coverage-gaps.md, .lore/plans/phase-1/coverage-di-factories.md]
---

# Retro: Coverage DI Factories

## Summary

Four files were below the 80% functions / 90% lines coverage threshold. Three shared the same root cause: hardcoded dependencies with no DI seam, making tests impossible without `mock.module()` (banned in this project). Extracted factory functions following the project's existing DI patterns (AgentManager, MCPManager, and SessionStore already accept injected dependencies). All four files now exceed both thresholds. Overall coverage rose from 92.4% lines / 80.6% functions to 98.62% lines / 96.89% functions.

## What Went Well

- The plan was accurate. Each phase executed cleanly with no surprises in the first three phases and only minor adjustments in the fourth.
- Phased execution order (mock-fs, then node-session-store, then server-context, then route) was correct. Each phase built on the previous one.
- Backward compatibility held throughout. No existing imports broke because the factories are additive (new exports alongside existing ones).
- The existing test patterns (createMockFs, createMockSessionFs, mock QueryFn from agent.test.ts) were directly reusable, reducing test setup boilerplate.

## What Could Improve

- The plan underestimated the difficulty of reaching 80% *functions* on `server-context.ts`. Module-level anonymous lambdas (node:fs wrappers for the production FileSystem adapter) count toward the file's function total but can't be exercised by unit tests without the real filesystem. Required an extra iteration: extracting `createNodePluginFs()` factory and adding integration tests against temp directories to reach 94%. The original plan assumed the factory + unit tests would be sufficient.
- The `agent.test.ts` mock QueryFn pattern requires boilerplate to satisfy the Query interface (manually attaching `interrupt` and `close` stubs via type assertions). This is copy-pasted across test files now. A shared `createMockQueryFn` helper in `tests/helpers/` would reduce duplication.

## Lessons Learned

- Bun's function coverage counts every anonymous lambda and arrow function at the source location level. Module-level production wiring (like `const nodeFs = { readdir: (...) => ... }`) inflates the denominator even when the real logic is fully tested through mocks. Extract wiring into named, exported factory functions to make the coverage metric reflect actual test quality.
- When a coverage plan targets function percentages, verify the function count includes module-level anonymous functions. A file can be 100% line-covered and still fail function thresholds because lambdas were created but never called.
- The DI factory pattern (export a `createX(deps)` factory, keep a default instance for production) is consistently useful across this codebase. It's now applied to SessionStore, AgentManager, MCPManager, ServerContext, NodeSessionStore, and the POST route handler. The pattern is: factory creates closure-held state, default export destructures from a default instance.

## Artifacts

- Gap analysis: `.lore/notes/phase-1/coverage-gaps.md`
- Implementation plan: `.lore/plans/phase-1/coverage-di-factories.md`
- PR: https://github.com/rjroy/guild-hall/pull/4
