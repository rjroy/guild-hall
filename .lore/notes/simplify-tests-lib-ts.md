---
title: Simplification notes: tests-lib-ts
date: 2026-02-19
status: complete
tags: [simplify, cleanup, code-quality, tests]
modules: [tests-lib]
---

# Simplification Notes: tests-lib-ts

## Files Processed

- tests/lib/agent-manager.test.ts
- tests/lib/agent.test.ts
- tests/lib/dispatch-bridge.test.ts
- tests/lib/http-mcp-factory.test.ts
- tests/lib/json-rpc-client.test.ts
- tests/lib/mcp-manager.test.ts
- tests/lib/node-session-store.test.ts
- tests/lib/pid-file-manager.test.ts
- tests/lib/plugin-discovery.test.ts
- tests/lib/port-registry.test.ts
- tests/lib/schema-fields.test.ts
- tests/lib/schemas.test.ts
- tests/lib/server-context.test.ts
- tests/lib/session-store.test.ts
- tests/lib/sse.test.ts

## Cleanup Agents Run

- code-simplifier:code-simplifier

## Results

### Simplification

- Agent: code-simplifier:code-simplifier
  Changes: Extracted shared SDK message factories (makeInitMessage, makeStreamTextDelta, etc.) and query mock factories (createMockQuery, createMockQueryFn, etc.) into tests/helpers/mock-sdk-messages.ts and tests/helpers/mock-query.ts. Removed ~100+ lines of duplicate code across agent-manager, agent, and server-context tests. Added tick()/settle() helpers replacing repeated setTimeout patterns. Removed restating section comments across 11 files. Created describeWorkerErrors helper in json-rpc-client tests to replace 18 individual error tests.

### Testing

- Command: bun test
  Result: Pass
  809 pass, 0 fail, 1781 expect() calls across 38 files

### Review

- Agent: pr-review-toolkit:code-reviewer
  Result: 1 issue found, corrected
  Findings: Duplicate makeToolUseSummary with swapped parameter ordering in agent.test.ts vs shared helper (drift timebomb). Fixed by deleting local definition and importing shared version. Re-review passed clean.

## Failures

### Review Failure (Corrected)
- Diagnosis: makeToolUseSummary existed in both tests/helpers/mock-sdk-messages.ts and tests/lib/agent.test.ts with different parameter ordering
- Resolution: Deleted local definition, imported shared helper, updated 2 call sites. Re-review and re-test both passed.
