---
title: Add worker protocol methods to JsonRpcClient
date: 2026-02-17
status: pending
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/worker-dispatch.md
sequence: 3
modules: [json-rpc-client]
---

# Task: Add Worker Protocol Methods to JsonRpcClient

## What

Add six methods to `JsonRpcClient` (`lib/json-rpc-client.ts`) following the existing `invokeTool()` pattern (30s timeout, AbortController, error handling):

- `dispatchWorker(params)` calls `worker/dispatch`
- `listWorkers(params?)` calls `worker/list`
- `workerStatus(params)` calls `worker/status`
- `workerResult(params)` calls `worker/result`
- `cancelWorker(params)` calls `worker/cancel`
- `deleteWorker(params)` calls `worker/delete`

Each method: creates AbortController, sets 30s timeout, calls `this.call(method, params, signal)`, casts the result to the appropriate response type, handles AbortError as timeout. Same pattern as `invokeTool()` but without the `isError` check (worker methods return JSON-RPC errors via the standard error field, not via a flag in the result).

Use the response types defined in Task 002 (`WorkerJobSummary`, `WorkerJobStatus`, `WorkerJobResult`) for return type annotations.

## Validation

- Each method sends the correct JSON-RPC method name and params
- Each method respects the 30s timeout
- JSON-RPC protocol errors propagate as `JsonRpcProtocolError`
- HTTP errors propagate as `JsonRpcHttpError`
- Timeouts throw `JsonRpcTimeoutError`
- Tests follow the existing `invokeTool()` test patterns
- 90%+ coverage

## Why

From `.lore/specs/worker-dispatch.md`:
- REQ-WD-35: `JsonRpcClient` gains methods for each `worker/*` call: `dispatchWorker()`, `listWorkers()`, `workerStatus()`, `workerResult()`, `cancelWorker()`, `deleteWorker()`. Same timeout and error handling patterns as `invokeTool()`.

## Files

- `lib/json-rpc-client.ts` (modify: add six worker methods)
- `tests/json-rpc-client.test.ts` (modify: add worker method tests)
