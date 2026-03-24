---
title: "Plan: Windows Native Support"
date: 2026-03-24
status: approved
tags: [windows, cross-platform, transport, ipc, tcp, sockets, portability, plan]
modules: [daemon, daemon-lib-socket, daemon-lib-git, lib-daemon-client, lib-paths, notification-service]
related:
  - .lore/specs/infrastructure/windows-native-support.md
  - .lore/brainstorm/windows-native-support.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/daemon-rest-api.md
  - .lore/retros/phase-4-commissions.md
---

# Plan: Windows Native Support

## Spec Reference

**Spec**: `.lore/specs/infrastructure/windows-native-support.md`
**Brainstorm**: `.lore/brainstorm/windows-native-support.md` (all open questions resolved)

Requirements addressed:

- REQ-WIN-1: Unix socket preserved on POSIX -> Step 5
- REQ-WIN-2: TCP on Windows (127.0.0.1, not localhost) -> Step 5
- REQ-WIN-3: Dynamic port, port discovery file, port-anchored PID file -> Steps 4, 5
- REQ-WIN-4: Auto-detect by platform, no config knob -> Steps 4, 5
- REQ-WIN-5: Everything above transport unaffected -> Structural (validated by existing test suite)
- REQ-WIN-6: Client detects transport from discovery files, not platform -> Steps 6, 7
- REQ-WIN-7: SSE streaming over TCP, idleTimeout verified -> Step 5 (pre-check in Step 4)
- REQ-WIN-8: Lifecycle module manages port file on Windows -> Step 4
- REQ-WIN-9: Stale port/PID recovery on Windows -> Step 4
- REQ-WIN-10: SIGINT triggers clean shutdown on Windows -> Step 5
- REQ-WIN-11: os.homedir() replaces process.env.HOME -> Step 1
- REQ-WIN-12: Platform-appropriate shell dispatch -> Step 2
- REQ-WIN-13: core.longpaths for git worktrees -> Step 3
- REQ-WIN-14: .gitattributes with eol=lf -> Step 3
- REQ-WIN-15: No changes (sandbox check, scope boundary) -> N/A
- REQ-WIN-16: No changes (pre-commit hook, scope boundary) -> N/A
- REQ-WIN-17: No changes (named pipes, scope boundary) -> N/A

## Codebase Context

**Daemon entry** (`daemon/index.ts:57-63`): `Bun.serve({ unix: socketPath, fetch, idleTimeout: 0 as never })`. Single server binding. The `as never` cast works around Bun's type for `idleTimeout`. Both `unix` and `port` paths use the same `Bun.serve()` interface.

**Socket lifecycle** (`daemon/lib/socket.ts`): Six exported functions: `getSocketPath()`, `pidFilePathFor()`, `cleanStaleSocket()`, `writePidFile()`, `removePidFile()`, `removeSocketFile()`. The PID logic (`isProcessAlive`, `cleanStaleSocket`, `writePidFile`, `removePidFile`) is transport-agnostic. The socket-specific parts are `getSocketPath()`, `removeSocketFile()`, and the socket-specific naming in `cleanStaleSocket()`.

**Client connectivity** (`lib/daemon-client.ts`): Four functions pass `{ socketPath }` to `http.request()`: `daemonFetch` (line 78), `daemonFetchBinary` (line 132), `daemonStream` (line 221), `daemonStreamAsync` (line 292). A duplicate `getSocketPath()` (line 33) exists here because `lib/` cannot import from `daemon/`. The `classifyError()` function already handles `ECONNREFUSED` and `ENOENT`, which covers both socket and TCP failure modes.

**Home directory** (`lib/paths.ts:12-22`): `getGuildHallHome()` reads `process.env.HOME` directly. Falls back to nothing on Windows (throws). The `GUILD_HALL_HOME` override and `homeOverride` parameter are transport-independent.

**Duplicate home function** (`daemon/services/meeting/notes-generator.ts:209-215`): `defaultGuildHallHome()` duplicates the `process.env.HOME` pattern. Should consolidate to use `getGuildHallHome()`.

**Shell dispatch** (`daemon/services/notification-service.ts:51-52`): `Bun.spawn(["sh", "-c", command], ...)`. Hardcoded POSIX shell. DI seam already exists (`dispatchShell` in `NotificationServiceDeps`), so the default just needs a platform branch.

**Git worktree creation** (`daemon/lib/git.ts:239-241`): `createWorktree()` calls `runGit(repoPath, ["worktree", "add", worktreePath, branchName])`. No config flags passed. `core.longpaths` can be set via `git -c core.longpaths=true worktree add` or as a one-time config on the repo.

**Test patterns**: DI everywhere, `fs.mkdtemp()` for temp dirs, `Bun.serve({ unix })` for integration tests in `daemon-client.test.ts`, `serveOnSocket()` helper with EPERM fallback in socket tests.

## Implementation Steps

Two phases matching the spec. Phase 0 items are independent and can be separate commissions. Phase 1 is a coordinated change with internal review checkpoints.

---

### Phase 0: Portability Fixes

These three steps are independent. Each is a single commit that does not affect POSIX behavior. They can run in parallel as separate commissions.

### Step 1: Replace process.env.HOME with os.homedir()

**Files**: `lib/paths.ts`, `daemon/services/meeting/notes-generator.ts`, `tests/lib/paths.test.ts`
**Addresses**: REQ-WIN-11

In `lib/paths.ts:getGuildHallHome()` (line 15), replace:

```typescript
const home = process.env.HOME;
```

with:

```typescript
import * as os from "node:os";
// ...
const home = os.homedir();
```

The `os` import goes at the top of the file (line 1 area, alongside existing `node:fs/promises` and `node:path`). The resolution order stays the same: `homeOverride` first, then `GUILD_HALL_HOME`, then `os.homedir()`. The error message changes from "HOME environment variable is not set" to "Cannot determine home directory" (os.homedir() returns empty string on failure, not undefined).

In `daemon/services/meeting/notes-generator.ts`, replace `defaultGuildHallHome()` (lines 209-215) with a call to `getGuildHallHome()` from `@/lib/paths`. This eliminates the duplicate. Add the import at the top of the file. The function is only called as a default parameter value in `createNotesGenerator()`, so the change is contained.

**Tests** (`tests/lib/paths.test.ts`): Add a test that unsets `HOME` and `GUILD_HALL_HOME` from the environment, then calls `getGuildHallHome()`. On Linux, `os.homedir()` falls back to the passwd database when `HOME` is unset, so this test validates that the function no longer throws. It does not validate the Windows-specific `USERPROFILE` path (on Linux, `os.homedir()` never reads `USERPROFILE`).

The spec's success criterion "getGuildHallHome() resolves correctly when only USERPROFILE is set" is a Windows-only verification. On Linux CI, the test confirms the `os.homedir()` call path works, but the `USERPROFILE` scenario is manual-only until a Windows CI runner exists. Document this limitation in the test with a comment.

### Step 2: Platform-appropriate shell dispatch

**Files**: `daemon/services/notification-service.ts`, `tests/daemon/services/notification-service.test.ts`
**Addresses**: REQ-WIN-12

In `defaultDispatchShell()` (line 52), replace the hardcoded `["sh", "-c", command]` with a platform branch:

```typescript
const shell = process.platform === "win32"
  ? ["cmd.exe", "/c", command]
  : ["sh", "-c", command];

const proc = Bun.spawn(shell, { ... });
```

The DI seam (`dispatchShell` in `NotificationServiceDeps`) means tests already inject their own shell function. The default function is what changes.

**Tests**: Extract the shell selection into a pure function `shellForPlatform(platform: string): string[]` that takes `platform` as a parameter. This makes the Windows branch testable on Linux without mocking `process.platform`. Test both `"linux"` and `"win32"` inputs directly. `defaultDispatchShell` calls `shellForPlatform(process.platform)` internally. The existing test pattern uses the DI seam for the service-level tests; this is a focused unit test on the platform branching logic itself.

### Step 3: Git long paths and .gitattributes

**Files**: `daemon/lib/git.ts`, `.gitattributes`, `tests/daemon/git.test.ts` (if worktree creation tests exist)
**Addresses**: REQ-WIN-13, REQ-WIN-14

**`.gitattributes`** (new file in repo root):

```
* text=auto eol=lf
```

This is a one-line file. Commit it directly.

**`core.longpaths`** in `daemon/lib/git.ts`: Set `core.longpaths` on the parent repo before worktree creation. The concern is path length during file checkout inside the worktree, not the `worktree add` command itself (which creates a directory, not deep file paths). However, setting it on the repo ensures it's inherited by all worktrees created from it, rather than requiring per-worktree config.

Modify the repo setup path (or `createWorktree` itself) to set the config unconditionally on the source repo:

```typescript
async createWorktree(repoPath, worktreePath, branchName) {
  await runGit(repoPath, ["-c", "core.longpaths=true", "worktree", "add", worktreePath, branchName]);
},
```

The `-c` flag applies `core.longpaths` for the duration of the `worktree add` command, which covers the file checkout phase. The setting is inert on Linux/macOS, so it runs unconditionally. No conditional logic needed.

Alternative: Set `core.longpaths=true` in the repo's config once during project registration (`bun run guild-hall register`), which propagates to all worktrees. The `-c` flag approach is simpler (no registration change) but must be applied to every `git` call that creates files. The implementer should pick whichever is cleaner at implementation time.

**Tests**: Verify that after `createWorktree()`, the worktree has `core.longpaths=true` in its config. Use `runGit(worktreePath, ["config", "core.longpaths"])` to check.

---

### Phase 0 Review Checkpoint

After all four Phase 0 steps land, dispatch a single Thorne review covering the combined diff. Phase 0 changes are low-risk (self-contained, no cross-file dependencies, no POSIX behavior change), so one review pass is sufficient.

---

### Phase 1: Transport

Phase 1 is a coordinated change. Steps 4-8 must ship together. Two review checkpoints break up the risk.

### Step 4: Transport descriptor type and lifecycle module refactoring

**Files**: `daemon/lib/socket.ts` (rename to `daemon/lib/transport.ts`), `daemon/index.ts` (import update), `tests/daemon/socket.test.ts` (rename to `tests/daemon/transport.test.ts`)
**Addresses**: REQ-WIN-3, REQ-WIN-4, REQ-WIN-8, REQ-WIN-9

This step defines the transport abstraction and refactors the lifecycle module. No client changes yet.

**Transport descriptor type** (new export in `daemon/lib/transport.ts`):

```typescript
export type TransportDescriptor =
  | { type: "unix"; socketPath: string }
  | { type: "tcp"; hostname: string; port: number };
```

Both the daemon and client use this type. It lives in the transport module because it's the transport layer's vocabulary.

**Module rename**: `daemon/lib/socket.ts` becomes `daemon/lib/transport.ts`. The file's scope expands from socket-only to transport-aware lifecycle management.

**New constants**:

```typescript
const SOCKET_NAME = "guild-hall.sock";     // existing
const PORT_FILE_NAME = "guild-hall.port";  // new
const PID_SUFFIX = ".pid";                 // existing
```

**New functions**:

- `getPortFilePath(guildHallHome?: string): string`: Returns `~/.guild-hall/guild-hall.port`. Parallel to `getSocketPath()`.
- `writePortFile(portFilePath: string, port: number): void`: Writes the port number to the discovery file. Creates parent dirs.
- `removePortFile(portFilePath: string): void`: Removes the port file. No-op if absent. Same `safeUnlink` pattern.
- `cleanStalePort(portFilePath: string): void`: Parallel to `cleanStaleSocket()`. Same logic shape: if PID file exists and process is alive, throw; if dead, remove both port file and PID file; if corrupt PID, remove both; if port file exists without PID file (unclean shutdown), remove port file. Uses the existing private `safeUnlink` helper (available within the same module).

**Refactored functions**:

- `pidFilePathFor()`: Unchanged. It already appends `.pid` to any path, so `pidFilePathFor(portFilePath)` returns `guild-hall.port.pid`.
- `cleanStaleSocket()`: Unchanged. POSIX path stays exactly as-is.
- `getSocketPath()`: Unchanged.

**Pre-check for REQ-WIN-7**: Before writing transport code, verify `idleTimeout: 0` works with `Bun.serve({ port })`. Write a throwaway test:

```typescript
const server = Bun.serve({ port: 0, fetch: () => new Response("ok"), idleTimeout: 0 as never });
server.stop();
```

If this fails, SSE keepalive becomes a separate concern (document in Open Questions). If it passes, proceed.

**Tests**: Rename `tests/daemon/socket.test.ts` to `tests/daemon/transport.test.ts`. Keep all existing socket tests. Add new test groups:

- `getPortFilePath`: Returns correct path under given home.
- `writePortFile` / `removePortFile`: Round-trip (write port number, read it back, remove, verify gone).
- `cleanStalePort`: Same test shape as existing `cleanStaleSocket` tests (dead PID removes both files, live PID throws, corrupt PID removes both, port file without PID file removes port file).

---

### Phase 1 Review Checkpoint 1

After Step 4 lands, dispatch a Thorne review. This is the transport abstraction foundation. Getting it right before building on it catches type design issues early. The review should verify:
- Transport descriptor type is complete and correct
- Port file lifecycle mirrors socket file lifecycle
- No regressions in existing socket behavior
- Clean separation between socket and port code paths

---

### Step 5: Daemon binding platform branch

**Files**: `daemon/index.ts`
**Addresses**: REQ-WIN-1, REQ-WIN-2, REQ-WIN-3, REQ-WIN-4, REQ-WIN-5, REQ-WIN-7, REQ-WIN-10

Replace the current `Bun.serve({ unix })` call (lines 57-63) with a platform branch:

```typescript
import {
  getSocketPath,
  getPortFilePath,
  cleanStaleSocket,
  cleanStalePort,
  writePidFile,
  removePidFile,
  removeSocketFile,
  writePortFile,
  removePortFile,
} from "./lib/transport";

// ... (existing parseArgs, packagesDir, app creation) ...

const isWindows = process.platform === "win32";

let server: ReturnType<typeof Bun.serve>;
let cleanupFiles: () => void;

if (isWindows) {
  const portFilePath = getPortFilePath();
  cleanStalePort(portFilePath);

  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: app.fetch,
    idleTimeout: 0 as never,
  });

  const assignedPort = server.port;
  writePortFile(portFilePath, assignedPort);
  writePidFile(portFilePath);

  log.info(`listening on 127.0.0.1:${assignedPort} (PID ${process.pid})`);

  cleanupFiles = () => {
    removePidFile(portFilePath);
    removePortFile(portFilePath);
  };
} else {
  const socketPath = getSocketPath();
  cleanStaleSocket(socketPath);

  server = Bun.serve({
    unix: socketPath,
    fetch: app.fetch,
    idleTimeout: 0 as never,
  });

  writePidFile(socketPath);

  log.info(`listening on ${socketPath} (PID ${process.pid})`);

  cleanupFiles = () => {
    removePidFile(socketPath);
    removeSocketFile(socketPath);
  };
}

function shutdown() {
  log.info("shutting down...");
  try {
    schedulerShutdown?.();
    void server.stop();
  } finally {
    cleanupFiles();
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

The `socketPath` variable moves inside the else branch. The `cleanupFiles` closure captures the right paths for each platform. SIGINT works on Windows (REQ-WIN-10); SIGTERM is documented as unavailable but stale-file recovery (Step 4) covers the gap.

REQ-WIN-5 (everything above transport unaffected): The `app.fetch` binding is the same on both paths. Hono routes, services, SDK runner, toolbox resolver, and EventBus are untouched.

### Step 6: Transport discovery function (shared)

**Files**: `lib/daemon-client.ts`, `tests/lib/daemon-client.test.ts`
**Addresses**: REQ-WIN-6

Replace the duplicate `getSocketPath()` in `lib/daemon-client.ts` (line 33) with a transport discovery function:

```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { getGuildHallHome } from "./paths";

export type TransportDescriptor =
  | { type: "unix"; socketPath: string }
  | { type: "tcp"; hostname: string; port: number };

/**
 * Discovers the active daemon transport by checking for discovery files.
 * Checks socket file first (POSIX), then port file (Windows).
 * Returns null if neither exists.
 *
 * Detection is file-based (not process.platform) so transport tests
 * are runnable on any OS.
 */
export function discoverTransport(homeOverride?: string): TransportDescriptor | null {
  const home = homeOverride ?? getGuildHallHome();
  const socketPath = path.join(home, "guild-hall.sock");
  const portFilePath = path.join(home, "guild-hall.port");

  if (fs.existsSync(socketPath)) {
    return { type: "unix", socketPath };
  }

  if (fs.existsSync(portFilePath)) {
    const raw = fs.readFileSync(portFilePath, "utf-8").trim();
    const port = parseInt(raw, 10);
    if (isNaN(port)) return null;
    return { type: "tcp", hostname: "127.0.0.1", port };
  }

  return null;
}
```

The `TransportDescriptor` type is duplicated here from `daemon/lib/transport.ts` because `lib/` cannot import from `daemon/`. Both definitions are identical. This mirrors the existing `getSocketPath()` duplication pattern.

**Note on classifyError()**: The existing `classifyError()` already handles `ECONNREFUSED` (daemon not running) and `ENOENT` (socket file missing). For TCP, `ECONNREFUSED` still applies. `ENOENT` won't occur (TCP connections don't use filesystem paths), but the `socket_not_found` error type semantically covers "no discovery file found." Add handling for `discoverTransport()` returning null:

```typescript
function classifyError(err: unknown): DaemonError {
  // ... existing code ...
}

function noTransportError(): DaemonError {
  return { type: "socket_not_found", message: "No daemon discovery file found (neither socket nor port file exists)" };
}
```

**Tests**: Add tests for `discoverTransport()`:
- Returns `{ type: "unix", socketPath }` when socket file exists
- Returns `{ type: "tcp", hostname: "127.0.0.1", port }` when port file exists with valid port
- Returns null when neither exists
- Returns null when port file contains non-numeric content
- Socket file takes precedence when both exist (edge case, shouldn't happen in practice)

### Step 7: Client functions use transport descriptor

**Files**: `lib/daemon-client.ts`, `tests/lib/daemon-client.test.ts`
**Addresses**: REQ-WIN-6, REQ-WIN-7

Refactor all four client functions to accept a `TransportDescriptor` instead of `socketPathOverride`. The `http.request` options change based on transport type:

```typescript
function transportOptions(transport: TransportDescriptor): { socketPath: string } | { hostname: string; port: number } {
  if (transport.type === "unix") {
    return { socketPath: transport.socketPath };
  }
  return { hostname: transport.hostname, port: transport.port };
}
```

Each function's signature changes:

```typescript
// Before:
export async function daemonFetch(
  requestPath: string,
  options?: { method?: string; body?: string },
  socketPathOverride?: string,
): Promise<Response | DaemonError>

// After:
export async function daemonFetch(
  requestPath: string,
  options?: { method?: string; body?: string },
  transportOverride?: TransportDescriptor,
): Promise<Response | DaemonError>
```

Internal logic: Each function calls `discoverTransport()` when no override is provided, then passes the result through `transportOptions()` into `http.request()`. If `discoverTransport()` returns null, return `noTransportError()`.

The `daemonHealth()` function signature changes from `socketPathOverride?: string` to `transportOverride?: TransportDescriptor`.

**Callers**: The four client functions (`daemonFetch`, `daemonFetchBinary`, `daemonStream`, `daemonStreamAsync`) are called from `web/` server components and `web/app/api/` route handlers. None of these callers pass a `socketPathOverride`; they all use the default discovery path. The `daemonHealth()` wrapper also takes `socketPathOverride` and passes it through; its callers likewise use the default.

The migration scope is therefore limited to the function signatures themselves: rename `socketPathOverride?: string` to `transportOverride?: TransportDescriptor` in the four functions and `daemonHealth()`. No caller code in `web/` or `cli/` changes. Test files that pass explicit socket paths (e.g., `tests/lib/daemon-client.test.ts`) must wrap them in `{ type: "unix", socketPath }` and add parallel `{ type: "tcp", ... }` test cases.

**Tests**: The existing `daemon-client.test.ts` uses `Bun.serve({ unix })` integration tests. Add parallel `Bun.serve({ port: 0 })` tests that exercise the TCP path:

- `daemonFetch` over TCP: start a TCP server, pass `{ type: "tcp", hostname: "127.0.0.1", port }`, verify response.
- `daemonFetchBinary` over TCP: same pattern.
- `daemonStreamAsync` over TCP: start a TCP server that streams SSE events, verify they arrive.
- `daemonStream` over TCP: same pattern.

These tests run on Linux and validate the Windows code path (per spec: "TCP transport unit tests pass on any platform").

### Step 8: Validate

**Addresses**: All REQs (validation pass)

Run the full test suite (`bun test`). All existing tests must pass unchanged (REQ-WIN-5 verification). New transport tests must pass.

Launch a sub-agent that reads the spec at `.lore/specs/infrastructure/windows-native-support.md`, reviews the implementation, and flags any requirements not met. This step is not optional.

---

### Phase 1 Review Checkpoint 2

After Steps 5-7 land together, dispatch a Thorne review. This covers the daemon binding change and all client connectivity changes. The review should verify:
- Platform branch in daemon/index.ts is minimal and correct
- Client discovery is file-based, not platform-based
- SSE streaming tests cover the TCP path
- No regressions in POSIX behavior
- All callers updated correctly

## Delegation Guide

### Phase 0 (Steps 1-3)

All four Phase 0 steps are suitable for Dalton (implementation) commissions. They're self-contained, low-risk, and have clear boundaries. They can run in parallel.

After all four land: single Thorne review commission.

### Phase 1 (Steps 4-7)

Step 4 (transport abstraction): Dalton commission. This is the foundation; correctness matters more than speed.

**Review checkpoint 1**: Thorne commission on Step 4 output. Focus: type design, lifecycle correctness.

Steps 5-7 (daemon binding + client changes): Dalton commission. These three steps are tightly coupled and should be a single commission to avoid partial states. The implementer works through them in order within one session.

**Review checkpoint 2**: Thorne commission on Steps 5-7 output. Focus: platform branching, discovery logic, caller migration, SSE over TCP.

Step 8 (validation): Thorne commission with spec-comparison mandate. Fresh context, reads only the spec and the implementation.

### Expertise notes

No specialized domain expertise needed beyond standard TypeScript/Bun development. The transport change is straightforward (Bun.serve options, node:http request options). The risk is in the number of touchpoints, not the complexity of any single change.

## Open Questions

1. **Bun.serve({ port: 0 }) with idleTimeout: 0**: The spec requires verifying this works before writing transport code (REQ-WIN-7, AI Validation). Step 4 includes this pre-check. If it fails, SSE keepalive on TCP becomes an additional concern (periodic empty comments in the SSE stream as heartbeats).

2. **Module rename ripple**: Renaming `daemon/lib/socket.ts` to `daemon/lib/transport.ts` (Step 4) updates imports in `daemon/index.ts` and the test file. Any other file that imports from `@/daemon/lib/socket` needs updating. Grep at implementation time. The rename should be a separate commit within the Step 4 work to keep the diff clean.

3. **`.gitattributes` line-ending normalization**: Adding `* text=auto eol=lf` (Step 3) may trigger line-ending normalization on files that were previously stored without it. The repo likely already uses LF consistently, but the implementer should verify `git status` is clean after committing the file and before moving on. If normalization creates spurious diffs, a one-time `git add --renormalize .` commit resolves them.
