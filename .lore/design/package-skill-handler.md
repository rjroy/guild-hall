---
title: Package Skill Handler Contract
date: 2026-03-14
status: implemented
tags: [architecture, daemon, skills, packages, handler-contract, progressive-discovery]
modules: [daemon, lib, packages]
related:
  - .lore/specs/infrastructure/cli-progressive-discovery.md
  - .lore/design/skill-contract.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/brainstorm/commission-layer-separation.md
---

# Design: Package Skill Handler Contract

## Problem

The CLI progressive discovery spec (REQ-CLI-PD-11 through REQ-CLI-PD-13) defines how package skill handlers should behave but defers the concrete TypeScript interface as `[STUB: package-skill-handler]`. Without this contract, packages cannot declare skills and the daemon cannot wire them. The spec's requirements are clear enough to resolve this now.

See [Spec: CLI Progressive Discovery](.lore/specs/infrastructure/cli-progressive-discovery.md) for the full requirements.

## Constraints

- The daemon owns the HTTP boundary. Handlers must not receive or return Hono-specific types (REQ-CLI-PD-11).
- State transitions are daemon-mediated. Handlers signal intent; the daemon applies guards, mutual exclusion, and EventBus emission (REQ-CLI-PD-12).
- Streaming handlers emit events through a provided callback. The daemon manages SSE transport (REQ-CLI-PD-13).
- Package skills use the existing `SkillDefinition` type, extended with `sourcePackage` (REQ-CLI-PD-1, REQ-CLI-PD-17).
- The daemon validates context before handler invocation (REQ-CLI-PD-8, REQ-CLI-PD-9).
- The CLI doesn't change. Package skills appear in `GET /help/skills` alongside built-in skills.
- The declaration surface must parallel `toolboxFactory` for familiarity but serve a different purpose (public API vs. agent tools).

## Approaches Considered

### Option 1: `skillFactory` export returning handler map

Packages export a `skillFactory` function that receives daemon-provided dependencies and returns `SkillDefinition` objects paired with handler functions. The factory pattern mirrors `toolboxFactory`: the daemon calls it during startup, passing a deps object that provides the services the handler can use.

```typescript
export const skillFactory: SkillFactory = (deps) => ({
  skills: [
    {
      definition: { skillId: "writer.cleanup.commission.run", ... },
      handler: async (ctx) => { /* ... */ },
    },
  ],
});
```

**Pros:**
- Familiar pattern (matches `toolboxFactory`)
- Co-locates definition and handler
- Factory receives deps at construction time, handler receives request-specific context at invocation time
- The daemon controls what deps are available

**Cons:**
- Two-level dependency injection (factory deps + handler context) is a pattern to learn, though `toolboxFactory` already establishes it

### Option 2: Static skill declarations in `package.json` with convention-named exports

Skills are declared in the package's `guildHall` metadata (in `package.json`). Handler functions are exported from `index.ts` with names matching skill IDs.

```json
{
  "guildHall": {
    "skills": [{ "skillId": "writer.cleanup.commission.run", ... }]
  }
}
```

```typescript
export async function writer_cleanup_commission_run(ctx) { ... }
```

**Pros:**
- Skills are discoverable without importing the module (metadata scan)
- No factory layer

**Cons:**
- Splits definition (package.json) from implementation (index.ts), creating drift
- Convention-based naming is fragile and hard to type-check
- No opportunity to inject daemon dependencies at construction time
- `SkillDefinition` includes Zod schemas, which can't live in JSON

### Option 3: Separate `skills.ts` module with named exports

Each package exports a `skills` array from a dedicated `skills.ts` file. Each entry pairs a definition with a handler.

```typescript
// skills.ts
export const skills: PackageSkill[] = [
  { definition: { ... }, handler: async (ctx) => { ... } },
];
```

**Pros:**
- No factory layer, simpler mental model
- Colocation of definition and handler

**Cons:**
- Static exports can't receive daemon dependencies at construction time
- The handler would need all services passed per-invocation, making the context object heavier
- Separate file (`skills.ts`) vs entry point (`index.ts`) is a convention the daemon must know about

## Decision

**Option 1: `skillFactory` export.** The two-level injection (factory deps for daemon services, handler context for per-request data) is the right separation. Factory deps are things that don't change between requests (EventBus, config, record ops). Handler context is things that do (project name, commission ID, request params). This mirrors how built-in route factories work: the factory receives deps via DI, individual route handlers receive request-specific data via Hono context. Package skill handlers get the same split, just without the Hono types.

Option 2's JSON-based declarations can't express Zod schemas, and splitting definition from handler creates a maintenance problem. Option 3 forces all dependencies into the per-request context, blurring the line between "what's available" and "what's relevant to this request."

## Interface/Contract

### Core types

```typescript
/**
 * Context provided to a package skill handler at invocation time.
 * Contains only request-specific data. Daemon services come from
 * the factory deps, not from here.
 */
interface SkillHandlerContext {
  /** Validated request parameters (query or body), keyed by parameter name. */
  params: Record<string, string>;

  /** Resolved context fields. Present only when the skill's SkillContext
   *  declares them as required. The daemon resolves and validates these
   *  before calling the handler. */
  projectName?: string;
  commissionId?: string;
  meetingId?: string;
  scheduleId?: string;
}

/**
 * Result returned by a non-streaming handler.
 * The daemon serializes this to JSON for the HTTP response.
 */
interface SkillHandlerResult {
  /** The response payload. Must be JSON-serializable. */
  data: unknown;

  /** HTTP status code. Defaults to 200 if omitted. */
  status?: number;
}

/**
 * Error type for handler failures. The daemon catches these and
 * returns an appropriate HTTP error response.
 */
class SkillHandlerError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "SkillHandlerError";
  }
}

/**
 * A non-streaming skill handler.
 */
type SkillHandler = (ctx: SkillHandlerContext) => Promise<SkillHandlerResult>;

/**
 * Callback for streaming handlers to emit SSE events.
 * The daemon wraps this in SSE transport. The stream closes when
 * the handler's returned promise resolves.
 */
interface SkillStreamEmitter {
  /** Emit a typed event to the SSE stream. */
  emit(event: string, data: unknown): void;
}

/**
 * A streaming skill handler. The daemon closes the SSE connection
 * when the returned promise resolves. To signal completion, simply
 * return. To signal an error, throw SkillHandlerError.
 */
type SkillStreamHandler = (
  ctx: SkillHandlerContext,
  emitter: SkillStreamEmitter,
) => Promise<void>;
```

### State transition signaling

REQ-CLI-PD-12 requires that state transitions be daemon-mediated. The handler signals intent; the daemon applies guards.

Rather than adding transition methods to `SkillHandlerContext` (which would couple every handler to the transition vocabulary), state transitions are services on the factory deps. Only handlers that need transitions declare dependency on them.

```typescript
/**
 * Dependencies injected into the skill factory at construction time.
 * The daemon provides these; packages consume them.
 *
 * This is intentionally narrow. Handlers that need more daemon
 * services indicate a design problem: the handler is doing too much.
 */
interface SkillFactoryDeps {
  /** Application configuration (read-only). */
  config: AppConfig;

  /** Guild Hall home directory path. */
  guildHallHome: string;

  /** Emit a system event. The daemon applies EventBus routing. */
  emitEvent: (event: SystemEvent) => void;

  /**
   * Request a commission state transition. The daemon validates the
   * transition, applies one-call guards and mutual exclusion, emits
   * the appropriate event, and returns the updated record.
   *
   * Throws SkillHandlerError if the transition is invalid (e.g.,
   * commission is in a terminal state, guard rejection). This matches
   * the existing commission lifecycle layer, which throws on invalid
   * state transitions. Handlers should let these errors propagate;
   * the daemon route wrapper catches SkillHandlerError and returns
   * the appropriate HTTP error response.
   */
  transitionCommission?: CommissionTransitionFn;

  /**
   * Request a meeting state transition. Same throwing contract as
   * commission transitions.
   */
  transitionMeeting?: MeetingTransitionFn;
}

/**
 * Commission transition function signature. The daemon implements
 * this; the handler calls it. Throws SkillHandlerError on invalid
 * transitions. Returns void on success.
 */
type CommissionTransitionFn = (
  commissionId: string,
  transition: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

/**
 * Meeting transition function signature. Same throwing contract.
 */
type MeetingTransitionFn = (
  meetingId: string,
  transition: string,
  payload?: Record<string, unknown>,
) => Promise<void>;
```

The `transitionCommission` and `transitionMeeting` functions are optional on the deps because most package skills don't need them. A package that reads commission data doesn't need transition capabilities. The daemon only provides these functions when the package declares skills that have `readOnly: false` and require the corresponding context.

### Skill factory and package skill

```typescript
/**
 * A skill definition paired with its handler.
 */
interface PackageSkill {
  /** The skill definition, registered in the daemon's SkillRegistry. */
  definition: SkillDefinition;

  /** Handler for non-streaming skills. Exactly one of handler or
   *  streamHandler must be provided. */
  handler?: SkillHandler;

  /** Handler for streaming skills. The skill's definition must include
   *  streaming.eventTypes when this is provided. */
  streamHandler?: SkillStreamHandler;
}

/**
 * Factory function exported by packages that contribute skills.
 * Called once during daemon startup with daemon-provided deps.
 */
type SkillFactory = (deps: SkillFactoryDeps) => SkillFactoryOutput;

interface SkillFactoryOutput {
  skills: PackageSkill[];
}
```

### `SkillDefinition` extension

Per REQ-CLI-PD-17, `SkillDefinition` gains an optional `sourcePackage` field:

```typescript
interface SkillDefinition {
  // ... all existing fields ...

  /** Package that contributed this skill. Undefined for built-in skills.
   *  Displayed in leaf-level help for attribution (REQ-CLI-PD-17). */
  sourcePackage?: string;
}
```

The daemon sets this during registration, not the package. The package provides `definition` without `sourcePackage`; the daemon stamps it with the package name from `DiscoveredPackage.name`.

### Package export surface

A package that contributes both agent tools and public skills exports both:

```typescript
// packages/guild-hall-writer/index.ts

import type { ToolboxFactory } from "@/daemon/services/toolbox-types";
import type { SkillFactory } from "@/daemon/services/skill-types";

export const toolboxFactory: ToolboxFactory = (deps) => { /* MCP tools */ };
export const skillFactory: SkillFactory = (deps) => { /* public skills */ };
```

Packages may export one, both, or neither. The daemon checks for each export independently.

## Daemon Wiring

### Discovery and loading

The daemon discovers package skills during `createProductionApp()`, after package discovery and before `createApp()`.

```
discoverPackages() → loadPackageSkills() → createApp({ ..., packageSkills })
```

`loadPackageSkills()` iterates discovered packages, imports each entry point, checks for a `skillFactory` export, calls it with `SkillFactoryDeps`, and collects the resulting `PackageSkill[]`. The daemon stamps each definition with `sourcePackage`.

### Route generation

For each `PackageSkill`, the daemon generates a Hono route that:

1. Extracts and validates request parameters (query for GET, body for POST) against the skill's `parameters` declaration.
2. Resolves context fields (`projectName`, `commissionId`, etc.) from the request, validating that referenced sessions exist and are in a compatible state (REQ-CLI-PD-9).
3. Builds a `SkillHandlerContext` from the validated parameters and resolved context.
4. Calls the handler (or stream handler).
5. For non-streaming: returns `SkillHandlerResult.data` as JSON with the appropriate status code.
6. For streaming: wraps the `SkillStreamEmitter` in SSE transport via `streamSSE()`.
7. Catches `SkillHandlerError` and returns the error message with the specified status code.

This is a generic route factory, not per-skill code. One function generates routes for all package skills:

```typescript
function createPackageSkillRoutes(
  packageSkills: PackageSkill[],
  deps: PackageSkillRouteDeps,
): RouteModule {
  const routes = new Hono();
  const skills: SkillDefinition[] = [];

  for (const ps of packageSkills) {
    const { definition, handler, streamHandler } = ps;
    const { method, path } = definition.invocation;

    if (handler) {
      routes.on(method, path, async (c) => {
        const ctx = buildHandlerContext(c, definition);
        await validateContext(ctx, definition, deps);
        try {
          const result = await handler(ctx);
          return c.json(result.data, result.status ?? 200);
        } catch (err) {
          if (err instanceof SkillHandlerError) {
            return c.json({ error: err.message }, err.status);
          }
          throw err;
        }
      });
    }

    if (streamHandler) {
      routes.on(method, path, async (c) => {
        const ctx = buildHandlerContext(c, definition);
        await validateContext(ctx, definition, deps);
        return streamSSE(c, async (stream) => {
          const emitter: SkillStreamEmitter = {
            emit: (event, data) => {
              void stream.writeSSE({ event, data: JSON.stringify(data) });
            },
          };
          await streamHandler(ctx, emitter);
        });
      });
    }

    skills.push(definition);
  }

  return { routes, skills };
}
```

This `RouteModule` is mounted in `createApp()` alongside built-in route modules. The skills array feeds into the same `createSkillRegistry()` call. No special handling, no separate namespace.

### Duplicate detection

REQ-CLI-PD-6 requires duplicate `skillId` rejection at startup. This is already handled by `createSkillRegistry()`, which throws on duplicate skill IDs. Package skills enter the same array as built-in skills before registry construction, so collisions between packages or between a package and a built-in skill are caught automatically.

### Validation sequence

At daemon startup:

1. Discover packages (`discoverPackages()`)
2. For each package with a `skillFactory` export, call the factory
3. Validate each `PackageSkill`:
   - Neither `handler` nor `streamHandler` provided: startup error (no handler to invoke)
   - Both `handler` and `streamHandler` provided: startup error (ambiguous invocation)
   - If `streamHandler` is provided, `definition.streaming` must be present
   - If `handler` is provided, `definition.streaming` must be absent
   - `definition.invocation.path` doesn't collide with built-in routes (caught by Hono's router if paths collide, and by the registry if skill IDs collide)
4. Stamp `sourcePackage` on each definition
5. Pass to `createApp()` for route generation and registry inclusion

## Edge Cases

- **Package exports `skillFactory` that throws:** The daemon logs the error and skips that package's skills. Other packages are unaffected. The daemon starts with a partial skill set rather than failing entirely. This matches how `loadDomainToolbox` handles import failures today.

- **Handler throws a non-`SkillHandlerError` error:** The generated route's catch block re-throws, letting Hono's error handler return a 500. This is the same behavior as built-in route handlers.

- **Streaming handler hangs (never returns):** The SSE connection stays open until the client disconnects or a timeout fires. The daemon should set a configurable timeout on streaming skill connections. This is an implementation detail for planning, not a contract concern.

- **Package skill declares `context: { commissionId: true }` but the commission doesn't exist:** The daemon's context validation (step 2 in route generation) rejects the request with a 404 before the handler runs. This is REQ-CLI-PD-9.

- **Package skill with `readOnly: false` but no `transitionCommission` in deps:** The factory deps include transition functions only when the daemon can provide them. A package skill that modifies state through its own mechanisms (e.g., writing files) doesn't need transition functions. The `readOnly` flag gates eligibility, not capability. The handler is responsible for using the transition functions it received from deps.

- **Two packages contribute skills at the same hierarchy position:** This is fine as long as skill IDs don't collide. Two packages can both contribute skills under `workspace.artifact` if their operation names differ. The help tree merges them naturally.

- **Package skill wants to read artifacts or commissions:** These are read operations that don't require transition functions. The handler can use `config` and `guildHallHome` from factory deps plus `projectName` from handler context to construct paths and read files directly. This is consistent with how built-in read routes work. The "daemon mediates state transitions" constraint (REQ-CLI-PD-12) applies to writes, not reads.

## Open Questions

- **Backpressure for streaming handlers.** The current `SkillStreamEmitter.emit()` is fire-and-forget. If the handler emits faster than the client consumes, events queue in the SSE buffer. For the current use case (progress updates, not high-frequency data), this is acceptable. If high-throughput streaming becomes a need, `emit()` could return a `Promise<void>` that resolves when the event is flushed. Deferring this until there's a concrete need.

- **Handler timeout.** Should the daemon enforce a maximum execution time for handlers? Built-in route handlers don't have explicit timeouts. Adding one for package skills but not built-in skills would be inconsistent. Deferring unless package handlers prove unreliable in practice.

- **Graduation path implementation.** REQ-CLI-PD-14 says an internal tool graduates to a public skill by declaring a `SkillDefinition` and implementing a handler. The contract defined here supports this: a toolbox package adds a `skillFactory` export alongside its existing `toolboxFactory`. The internal tool continues to work for agent sessions; the skill handler becomes the public invocation path. The mechanical steps of graduation are a planning concern.
