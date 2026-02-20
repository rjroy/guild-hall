---
title: Define internal tools for worker agents
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
  - .lore/research/claude-agent-sdk.md
sequence: 10
modules: [researcher-plugin]
---

# Task: Define Internal Tools for Worker Agents

## What

Define four internal tools that worker agents receive via `createSdkMcpServer()`. Use the API verified in Task 001.

**Factory function** (`guild-members/researcher/worker-tools.ts`):

```typescript
export function createWorkerTools(jobId: string, jobStore: JobStore, memoryStore: MemoryStore, deps?) {
  // Returns a createSdkMcpServer() instance with four tools
}
```

Uses DI for filesystem operations and memory functions. The `jobId` and `jobStore` are captured via closure so tools are scoped to the dispatching job. The `memoryStore` provides `storeMemory()` and `getTotalMemorySize()` (defined in Task 011). For this task, the memory store is an injected interface.

**Tools:**

- `update_summary({ summary: string })` - calls `jobStore.writeSummary(jobId, summary)`. Overwrites previous summary. Workers call this to report progress.

- `record_decision({ question: string, decision: string, reasoning: string })` - calls `jobStore.appendDecision(jobId, { question, decision, reasoning })`. Workers call this when resolving ambiguity autonomously.

- `log_question({ question: string })` - calls `jobStore.appendQuestion(jobId, question)`. Workers call this for questions they cannot resolve.

- `store_memory({ key: string, content: string })` - calls `memoryStore.storeMemory(key, content)`. Key must be filename-safe. Writing to an existing key overwrites it. After writing, checks total memory size via `memoryStore.getTotalMemorySize()` and triggers compaction if threshold exceeded. Compaction is fire-and-forget (does not await).

These tools run in the plugin process (REQ-WD-22), so they have full filesystem access to the plugin root regardless of worker sandbox settings.

**Retro lessons to apply:**
- Follow DI factory pattern per coverage-di-factories retro
- Test with external-consumer values, not internal IDs, per Phase 1 retro (tautological tests lesson)
- Use `agent-sdk-dev:agent-sdk-verifier-ts` after implementation to verify createSdkMcpServer usage

## Validation

- `update_summary` writes to status.md via JobStore
- `update_summary` overwrites previous content
- `record_decision` appends to decisions.json array
- `record_decision` creates decisions.json if it doesn't exist
- `log_question` appends to questions.md
- `log_question` creates questions.md if it doesn't exist
- `store_memory` calls memoryStore.storeMemory with key and content
- `store_memory` triggers compaction check after writing
- `store_memory` does not await compaction (fire-and-forget)
- Tool handlers receive correct input shapes (verified by Zod schema)
- createSdkMcpServer creates valid server instance passable to query()
- 90%+ coverage

## Why

From `.lore/specs/phase-1/worker-dispatch.md`:
- REQ-WD-22: Worker agents receive internal tools via `createSdkMcpServer()` running in plugin process
- REQ-WD-23: `update_summary` writes to `status.md`
- REQ-WD-24: `record_decision` appends to `decisions.json`
- REQ-WD-25: `log_question` appends to `questions.md`
- REQ-WD-26: `store_memory` writes to plugin `memory/` directory, MAY trigger compaction

## Files

- `guild-members/researcher/worker-tools.ts` (create)
- `tests/researcher/worker-tools.test.ts` (create)
