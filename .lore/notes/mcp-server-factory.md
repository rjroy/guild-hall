---
title: Implementation notes: mcp-server-factory
date: 2026-02-14
status: complete
tags: [implementation, notes, mcp, process-spawning, stdio, phase-1-completion, archived]
source: .lore/plans/mcp-server-factory.md
modules: [mcp-manager, server-context, stdio-mcp-factory]
related:
  - .lore/brainstorm/mcp-transport-stdio-vs-http.md
---

# Implementation Notes: MCPServerFactory (Stdio - Reverted)

> **Status**: Implementation completed through Phase 9 with all tests passing. Manual testing revealed architectural issues that led to HTTP transport decision. Code was reverted but implementation learnings preserved here. See `.lore/brainstorm/mcp-transport-stdio-vs-http.md` for the architectural decision.

## Progress
- [x] Phase 1: Update MCPServerFactory Interface
- [x] Phase 2: Update MCPManager to Pass pluginDir
- [x] Phase 3: Implement Stdio MCP Factory
- [x] Phase 4: Update Server Context to Use Real Factory
- [x] Phase 5: Write Unit Tests for Stdio Factory
- [x] Phase 6: Write Integration Test
- [x] Phase 7: Update Mock Factories in Tests
- [x] Phase 8: Run Full Test Suite
- [x] Phase 9: Manual Testing with Example Plugin
- [ ] Phase 10: Validate Against Spec
- [ ] Phase 11: Fix Tool Caching (discovered in Phase 9)

## Log

### Phase 1: Update MCPServerFactory Interface
- Dispatched: Update interface to include `pluginDir` and `onCrash` parameters
- Result: Implementation went beyond interface update - also populated `pluginDir` in `GuildMember` type and `discoverGuildMembers()`, which makes sense to compute once at discovery rather than at spawn time
- Tests: All 403 tests pass
- Review: Missing test assertion for `pluginDir` passed to `factory.spawn()`
- Resolution: Added assertions in mcp-manager tests to verify `pluginDir` flows through correctly. All tests pass.

### Phase 2: Update MCPManager to Pass pluginDir
- Dispatched: Add onCrash callback to spawnServer() (pluginDir already handled in Phase 1)
- Result: Added onCrash callback that updates member status, sets error, and emits event
- Tests: All 404 tests pass
- Review: Two issues - (1) onCrash doesn't clean up stale server handle, (2) no test coverage for onCrash
- Resolution: Added `this.servers.delete(name)` to onCrash callback and comprehensive test verifying all four requirements (status, error, event, handle cleanup). All tests pass.

### Phase 3: Implement Stdio MCP Factory
- Dispatched: Create stdio-mcp-factory.ts with full implementation, add MCP SDK dependency, integrate with server-context.ts
- Result: Complete implementation with DI factory pattern, shell-based cwd setting, stderr capture, timeouts, serialization, crash handling. Also integrated with server-context.ts (Phase 4 work done concurrently).
- Tests: All 408 tests pass
- Review: Three critical issues - (1) timer leaks on successful spawn/tool, (2) test coverage effectively zero, (3) serialization race condition
- Resolution: Fixed timer leaks with clearTimeout in finally blocks, fixed serialization with promise chaining, added 23 comprehensive unit tests. All 427 tests pass.

### Phase 4: Update Server Context to Use Real Factory
- Already completed in Phase 3 - server-context.ts imports and uses stdioMCPFactory as default

### Phase 5: Write Unit Tests for Stdio Factory
- Already completed in Phase 3 resolution - 23 comprehensive unit tests added covering all factory behaviors

### Phase 6: Write Integration Test
- Dispatched: Create integration tests with actual example plugin
- Result: 8 comprehensive integration tests created but skipped due to Bun limitation - Bun 1.3.5 doesn't support stream.Readable in stdio option
- Tests: 427 pass, 8 skip
- Review: Not performed (tests are skipped)
- Resolution: Tests are preserved for when Bun implements the missing feature or when run in Node.js. CLAUDE.md updated to document limitation.

### Phase 7: Update Mock Factories in Tests
- Already completed in Phases 1 and 2 - mock factory accepts pluginDir and onCrash parameters

### Phase 8: Run Full Test Suite
- Dispatched: Run full test suite and verify coverage
- Result: 435 tests (427 pass + 8 skip), 100% coverage on new code (stdio-mcp-factory.ts)
- Overall coverage: 97.03% functions, 98.62% lines
- Tests: All pass, no regressions
- Resolution: Full test suite passes with excellent coverage. New factory achieves same coverage quality as rest of codebase.

### Phase 9: Manual Testing with Example Plugin
- Manual testing with dev server revealed critical design flaw: **chicken-and-egg problem**
  - MCP servers use deferred initialization (not started until first use)
  - Tool list not populated until server started
  - Agent can't request tools it doesn't know about
  - Result: Tools are invisible to agent, never used
- Required solution: Tool list caching with smart invalidation
  - Cache tool list to disk after first retrieval
  - Show cached tools in roster even when server not running
  - Invalidate cache based on plugin modification date or version
  - Start MCP server on-demand when agent requests cached tool
- Proceeding to implement tool caching before Phase 10 validation

## Divergence
