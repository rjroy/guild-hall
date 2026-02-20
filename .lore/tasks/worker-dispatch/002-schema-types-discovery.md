---
title: Add capabilities to schema, types, and discovery
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/phase-1/worker-dispatch.md
sequence: 2
modules: [guild-hall-core, plugin-discovery]
---

# Task: Add Capabilities to Schema, Types, and Discovery

## What

Add the capability system to Guild Hall's core types and plugin discovery.

**Schema** (`lib/schemas.ts`): Add an optional `capabilities` array to `GuildMemberManifestSchema`:

```typescript
capabilities: z.array(z.string()).optional(),
```

**Types** (`lib/types.ts`): The `GuildMember` type extends `GuildMemberManifest` via intersection, so the Zod-inferred type will automatically include `capabilities?: string[]`. Add a `WorkerHandle` interface with six methods:

```typescript
export interface WorkerHandle {
  dispatch(params: { description: string; task: string; config?: Record<string, unknown> }): Promise<{ jobId: string }>;
  list(params?: { detail?: "simple" | "detailed"; filter?: string }): Promise<{ jobs: WorkerJobSummary[] }>;
  status(params: { jobId: string }): Promise<WorkerJobStatus>;
  result(params: { jobId: string }): Promise<WorkerJobResult>;
  cancel(params: { jobId: string }): Promise<{ jobId: string; status: string }>;
  delete(params: { jobId: string }): Promise<{ jobId: string; deleted: true }>;
}
```

Define the response types (`WorkerJobSummary`, `WorkerJobStatus`, `WorkerJobResult`) matching the spec shapes (REQ-WD-9 through REQ-WD-15).

**Discovery** (`lib/plugin-discovery.ts`): The `capabilities` field flows through from schema parsing to GuildMember construction. If `capabilities` is undefined (not in manifest), normalize to empty array on the GuildMember object.

**Capability semantics**: The `capabilities` array determines what a plugin supports. Known capability values:
- `"worker"` - plugin accepts dispatched agent work via `worker/*` JSON-RPC methods
- `"tools"` - plugin exposes tools via `tools/list` and `tools/call`

Plugins without capabilities (or empty array) default to tool-only behavior for backwards compatibility (existing plugins don't declare capabilities). The distinction matters for routing:
- Worker-only: `capabilities: ["worker"]` (gets dispatch server, no MCP connection for tools)
- Tool-only: no capabilities or `capabilities: ["tools"]` (MCP connection for tools, no dispatch)
- Hybrid: `capabilities: ["worker", "tools"]` (both)

This replaces the plan's original approach of checking `tools/list` at runtime. The manifest is the source of truth.

**Retro lessons to apply:**
- Use consistent naming (`jobId` everywhere, never `id`) per the SSE streaming bug retro warning about identifier namespace confusion
- Consider branded types for jobId per the nested plugin support retro

## Validation

- Manifest with `capabilities: ["worker"]` parses successfully via `GuildMemberManifestSchema`
- Manifest with `capabilities: ["worker", "tools"]` parses successfully (hybrid plugin)
- Manifest without `capabilities` parses successfully (defaults to empty array on GuildMember)
- Plugins without capabilities are treated as tool-only (backwards compatible)
- Discovery returns capabilities on GuildMember objects
- WorkerHandle type compiles with correct method signatures
- WorkerJobSummary, WorkerJobStatus, WorkerJobResult types match spec shapes
- 90%+ coverage on new/modified code

## Why

From `.lore/specs/phase-1/worker-dispatch.md`:
- REQ-WD-1: Plugins MAY declare worker capability by adding `"capabilities": ["worker"]` to `guild-member.json`
- REQ-WD-2: Guild Hall discovers worker-capable plugins at roster initialization
- REQ-WD-37: `GuildMemberManifestSchema` adds an optional `capabilities` field
- REQ-WD-38: `GuildMember` type gains a `capabilities` field (defaults to empty array)

## Files

- `lib/schemas.ts` (modify: add capabilities to GuildMemberManifestSchema)
- `lib/types.ts` (modify: add WorkerHandle, WorkerJobSummary, WorkerJobStatus, WorkerJobResult)
- `lib/plugin-discovery.ts` (modify: normalize capabilities to empty array)
- `tests/schemas.test.ts` (modify: add capabilities parsing tests)
- `tests/plugin-discovery.test.ts` (modify: add capabilities discovery tests)
