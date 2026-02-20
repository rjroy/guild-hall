---
title: Create researcher plugin scaffold and JobStore module
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/phase-1/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
sequence: 6
modules: [researcher-plugin]
---

# Task: Create Researcher Plugin Scaffold and JobStore Module

## What

Build the researcher plugin's scaffold and the JobStore module that all handlers depend on.

**Plugin manifest** (`guild-members/researcher/guild-member.json`):
```json
{
  "name": "researcher",
  "displayName": "Researcher",
  "description": "Research agent that investigates questions using web search and produces structured reports.",
  "version": "0.1.0",
  "transport": "http",
  "mcp": {
    "command": "bun",
    "args": ["run", "server.ts", "--port", "${PORT}"]
  },
  "capabilities": ["worker"]
}
```

**HTTP server** (`server.ts`): Copy the `HttpTransport` class from the example plugin for HTTP handling. `worker/*` methods are NOT standard MCP protocol methods, so the `@modelcontextprotocol/sdk` `Server` class will not route them. Handle JSON-RPC routing at the raw transport level:

- Use the MCP SDK `Server` for standard methods (`initialize`, `tools/list`, `tools/call`)
- Intercept incoming JSON-RPC messages at the `HttpTransport` layer BEFORE forwarding to the MCP `Server`
- Route `worker/*` methods to plugin-local handlers directly
- Forward all other methods to the MCP `Server` as normal

Standard MCP methods: `initialize` (via SDK Server), `tools/list` (returns empty), `tools/call` (returns error, no tools).

Worker methods are stubbed in this task (return "not implemented" errors). Tasks 007-009 wire them to real handlers.

**Package setup**: Create `package.json` and `tsconfig.json` for the researcher plugin. Add `picomatch` as a dependency (needed by Task 007 for glob filtering).

**JobStore module** (`job-store.ts`): Extracted job directory management with DI for filesystem and clock. Follow the `createX(deps)` factory pattern established across the codebase.

Directory structure per job:
```
jobs/
  {uuid}/
    task.md          - original task prompt
    config.json      - dispatch config (or {} if none)
    meta.json        - { jobId, status, description, startedAt, completedAt? }
    status.md        - worker's self-reported summary (initially empty)
    result.md        - final output (written on completion)
    questions.md     - unresolved questions (optional, appended)
    decisions.json   - judgment calls array (optional, appended)
    artifacts/       - files the worker creates (optional)
```

JobStore API:
- `createJob(description, task, config?)` - creates directory, writes initial files, returns jobId (`crypto.randomUUID()`)
- `getJob(jobId)` - reads meta.json, returns job metadata or null
- `listJobs()` - reads all job subdirectories, returns array of metadata
- `updateStatus(jobId, status, completedAt?)` - updates meta.json
- `writeResult(jobId, output, artifacts?)` - writes result.md
- `readResult(jobId)` - reads result.md and lists artifacts/
- `readSummary(jobId)` - reads status.md
- `readQuestions(jobId)` - reads questions.md
- `readDecisions(jobId)` - reads decisions.json
- `appendQuestion(jobId, question)` - appends to questions.md
- `appendDecision(jobId, decision)` - appends to decisions.json array
- `writeSummary(jobId, summary)` - writes status.md
- `deleteJob(jobId)` - recursively removes job directory
- `jobExists(jobId)` - checks if job directory exists

**Retro lessons to apply:**
- Follow `createX(deps)` DI factory pattern per coverage-di-factories retro
- Use `jobId` consistently (never `id`) per SSE streaming bug retro
- Avoid anonymous module-level lambdas for filesystem wiring per coverage-di-factories retro

## Validation

- `createJob` creates directory with correct file structure (task.md, config.json, meta.json, status.md)
- `createJob` generates valid UUID job IDs
- `getJob` reads meta.json correctly
- `getJob` returns null for nonexistent job
- `listJobs` returns all jobs
- `updateStatus` transitions status and sets completedAt
- `writeResult` and `readResult` roundtrip correctly
- `readSummary`, `readQuestions`, `readDecisions` handle missing files gracefully (return null, not throw)
- `appendQuestion` and `appendDecision` accumulate entries
- `deleteJob` removes directory recursively
- All operations use injected filesystem (no real disk in tests)
- Researcher server starts and responds to `initialize` request
- Server routes `worker/*` methods to stub handlers (returns "not implemented" error)
- Server routes standard MCP methods to SDK Server
- 90%+ coverage

## Why

From `.lore/specs/phase-1/worker-dispatch.md`:
- REQ-WD-3: Worker-capable plugins MUST handle six additional JSON-RPC methods
- REQ-WD-7: Plugin assigns globally unique job ID per dispatch (UUIDs recommended)
- REQ-WD-19: Each plugin manages its own `jobs/` directory within its plugin root
- REQ-WD-20: Each job gets a subdirectory under `jobs/` named by job ID
- REQ-WD-21: Job state files are plain text/JSON
- REQ-WD-40: A `researcher` plugin lives in `guild-members/researcher/`
- REQ-WD-42: The researcher declares `"capabilities": ["worker"]` in its manifest
- REQ-WD-43: The researcher plugin is self-contained

## Files

- `guild-members/researcher/guild-member.json` (create)
- `guild-members/researcher/server.ts` (create)
- `guild-members/researcher/job-store.ts` (create)
- `guild-members/researcher/package.json` (create)
- `guild-members/researcher/tsconfig.json` (create)
- `tests/researcher/job-store.test.ts` (create)
- `tests/researcher/server.test.ts` (create)
