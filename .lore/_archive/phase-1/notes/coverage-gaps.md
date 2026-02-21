# Coverage Gaps

Target thresholds: **90% lines, 80% functions** (per-file).

Current overall: 92.4% lines, 80.6% functions (375 tests across 20 files).

Files below target, ordered by severity.

## 1. `lib/server-context.ts` (0% functions, 27% lines)

Server-side singleton wiring. Four exported getters (`getEventBus`, `getAgentManager`, `getMCPManager`, `getRosterMap`) plus a private `initialize()` that does async guild member discovery. None are tested directly.

**Why it's low:** These functions import Node `fs`, the Agent SDK `query`, and compose real singletons. Tests use the injected-dependency versions of AgentManager/MCPManager/SessionStore directly, bypassing this wiring layer entirely.

**Path to coverage:** Extract testable logic from `initialize()` (the composition is the logic). A test can call `getAgentManager()` with a mocked filesystem and mocked query function if the module accepts dependency overrides. Alternatively, accept this as integration-only code and exclude it from per-file thresholds via `coveragePathIgnorePatterns` once bun supports it.

**Effort:** Medium. Requires either a DI seam for the singletons or acceptance as untestable wiring.

## 2. `lib/node-session-store.ts` (0% functions, 79% lines)

Thin adapter binding Node `fs` to the `SessionFileSystem` interface. Seven one-liner lambda functions wrapping `fs.readdir`, `fs.writeFile`, etc.

**Why it's low:** The lambdas are hit as line coverage (the module executes at import time to build the `nodeFs` object), but bun counts zero of them as "called" because test code uses `MockSessionFileSystem` instead. The `SessionStore` class itself has 95%/100% coverage via the mock.

**Path to coverage:** This is a wiring-only file. Either:
- Accept it as-is (tests cover the real logic via the injected mock)
- Exclude via path ignore pattern
- Write a trivial integration test that imports and calls `sessionStore.list()` against a temp directory

**Effort:** Low. Integration test is optional; the real coverage is in `session-store.ts`.

## 3. `lib/relative-time.ts` (50% functions, 100% lines)

Two functions: `formatRelativeTime` (tested, 100% line coverage) and `defaultClock` (a one-liner `() => Date.now()`, never called directly because tests inject their own clock).

**Why it's low:** The default clock is a module-level constant. Calling `formatRelativeTime` without a clock argument would exercise it, but tests correctly inject clocks for determinism.

**Path to coverage:** Add one test that calls `formatRelativeTime(someIsoString)` without a clock argument. This exercises the default clock path and brings functions to 100%.

**Effort:** Trivial. One line of test code.

## 4. `app/api/tools/invoke/route.ts` (67% functions, 88% lines)

Three functions: `handleInvokeTool` (tested), the `InvokeToolDeps` type (not a function), and `POST` (the Next.js route handler, untested). Lines 68-73 are the `POST` wrapper.

**Why it's low:** `POST` calls `getMCPManager()` and `getRosterMap()` from `server-context.ts`, then delegates to `handleInvokeTool`. It's thin glue between Next.js and the testable handler.

**Path to coverage:** Same story as server-context. Testing `POST` directly requires mocking the server-context singletons. The important logic in `handleInvokeTool` is fully tested.

**Effort:** Low-medium. Could test via a route-level integration test, but the value is marginal since `handleInvokeTool` is already covered.

## 5. `lib/workshop-state.ts` (83% functions, 96% lines)

Five of six reducer event handlers covered. The uncovered code is the `default` exhaustive check branch (lines 185-188) and line 183 (end of the preceding case).

**Why it's low:** The `default` branch uses `never` typing and is unreachable by design. TypeScript enforces exhaustiveness at compile time.

**Path to coverage:** Not worth testing. The branch exists to catch future event additions at compile time, not runtime. This is healthy defensive code.

**Effort:** None. Accept the 4% gap.

## 6. `lib/agent.ts` (89% functions, 97% lines)

Two type guard functions uncovered: `isStatusMessage` (lines 455-458) and `isToolProgressMessage` (lines 461-464). These exist for future use in later phases.

**Path to coverage:** Add two simple type guard tests. Pattern matches the existing `isSystemInitMessage`/`isAssistantMessage` tests already in the file.

**Effort:** Trivial. Four lines of test code.

## Summary

| Priority | File | Action |
|----------|------|--------|
| Quick win | `relative-time.ts` | One test without clock arg |
| Quick win | `agent.ts` | Two type guard tests |
| Accept | `workshop-state.ts` | Unreachable exhaustive check |
| Accept | `node-session-store.ts` | Wiring-only, real logic tested via mock |
| Deferred | `server-context.ts` | Singleton wiring, needs DI seam or integration test |
| Deferred | `tools/invoke/route.ts` | Route glue, handler logic already covered |
