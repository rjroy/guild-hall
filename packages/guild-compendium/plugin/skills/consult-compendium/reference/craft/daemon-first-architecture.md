---
title: Daemon-First Architecture
domain: architecture
last_updated: 2026-04-04
source: "reference extraction (shelf-judge, 2026-04-04)"
---

# Daemon-First Architecture

The daemon is the application. Everything else is a client.

Web, CLI, and agents don't make decisions or hold state. They relay user intent to the daemon and render what comes back. If the daemon stops, there is no application. If a client stops, nothing is lost.

## Three Clients, One App

A daemon-first system has a single server process and multiple thin clients. Each client exists for a different interaction mode but none owns business logic or durable state.

| Layer       | Role                                                               |
| ----------- | ------------------------------------------------------------------ |
| **Daemon**  | The application. Owns all state, logic, and coordination.          |
| **Web**     | Read-heavy UI. Calls daemon API for writes.                        |
| **CLI**     | Scriptable surface. Discovers operations from daemon at runtime.   |

The daemon typically runs on a Unix socket (for local-only apps) or TCP (for networked access). Clients never touch the filesystem, config, or internal state directly.

### Why CLI Matters

The CLI isn't a convenience interface. It's what makes the daemon usable by other agents.

An agent with shell access can discover what the daemon offers, invoke operations, and read results without a custom client library. If the daemon exposes an operations registry with runtime discovery, agents learn the surface the same way humans do.

**When you make a thing, make a CLI.**

## Route/Service Split with DI Factories

Every route file is a factory: `createXRoutes(deps) → RouteModule`. Each factory receives only the slice of dependencies it needs. Production wiring lives in one place, which builds real deps and passes them down.

Tests provide mock deps. The app can start with a fallback if production setup fails.

This pattern keeps routes thin (request parsing + response formatting) and services testable (pure logic with injected dependencies). The production composition root is the only place that knows what's real.

## One Entry Point for External Service Calls

When a codebase talks to an external service (LLM, payment provider, email sender), all interaction should flow through a single session runner or client wrapper. No direct calls from routes, services, or domain logic.

The runner owns configuration, error handling, retry logic, and observability. Callers describe what they need. The runner decides how to talk to the service.

This isn't abstraction for its own sake. When service calls scatter across the codebase, every caller reinvents error handling and configuration. One entry point means one place to fix, observe, and evolve.

## Operations Registry and CLI Discovery

Routes can export operation metadata with hierarchy information. A registry builds a navigation tree from these exports.

```
mycli help                    → Full tree
mycli project help            → Subtree
mycli project status get      → Operation details
```

The CLI binary contains no operation catalog. The daemon is the source of truth. Progressive discovery means the CLI stays thin and always reflects the daemon's current capabilities.

## SSE Streaming

For server-push scenarios (streaming responses, live updates), route handlers can use SSE (Server-Sent Events) directly. There is no intermediate EventBus or pub/sub layer unless multiple subscribers need the same stream.

The route handler owns the SSE lifecycle: open the stream, run the operation, write events as they arrive, close the stream when done or on client disconnect.

This inline approach works when there's a single consumer per stream (the HTTP client that initiated the request). If you need multiple subscribers or cross-request event delivery, introduce a bus then, not before.

## File-Based State

All durable state lives in YAML and markdown files. No database.

Humans can inspect and edit state files directly. This is a feature, not a limitation. When something goes wrong, you open a file and read it.

This model works well for tools, developer infrastructure, and apps where the data volume stays modest. It stops working when you need transactions, concurrent writes from multiple processes, or query patterns that don't map to directory traversal.

## Type Boundaries

- **Shared types** live in a common package or directory. Never import from daemon or client packages.
- **Daemon types** stay in the daemon. Consider branded types (e.g., `ProjectId`, `SessionId`) when multiple ID namespaces coexist and could be confused at call sites.
- **Client types** derive from API responses, not from daemon internals.

## Testing Seams

DI factories are the primary testing seam. Every external dependency is injectable:

- **`fileOps`**: A single interface wrapping all filesystem operations. Tests provide in-memory implementations. This is the dominant DI seam in practice: most services need filesystem access, and a single interface keeps the injection surface narrow.
- **Service interfaces**: Services are injected into route factories. Tests can stub individual service methods without replacing the filesystem layer.
- **App-level test client**: Use the framework's built-in test client (e.g., Hono's `app.request()`, Express's `supertest`) with injected deps for integration-level route testing.
- **Temp directories**: `fs.mkdtemp()` for filesystem isolation, env vars for path overrides.

Design for dependency injection. Never mock modules (it couples tests to import paths and is fragile across runtimes).

### Config Resolution

Config resolution lives in the app factory module, not in the entry point. The factory conditionally resolves environment config only when DI deps don't provide the needed values. This avoids env coupling in tests: test callers pass paths and functions directly, and the factory never touches `process.env`.
