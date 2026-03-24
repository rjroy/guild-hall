---
title: "Windows Native Support"
date: 2026-03-24
status: resolved
tags: [windows, sockets, ipc, cross-platform, bun, architecture]
modules: [daemon, daemon-lib-socket, daemon-lib-git, lib-daemon-client, lib-paths, notification-service]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/brainstorm/guild-hall-future-vision.md
---

# Brainstorm: Windows Native Support

## Context

Guild Hall runs on Linux and macOS. The daemon binds a Unix socket at `~/.guild-hall/guild-hall.sock` using `Bun.serve({ unix })`, and both the web layer and CLI connect to it via `node:http` with the `socketPath` option. The question is what it takes to run this natively on Windows, not under WSL.

Unix sockets are the obvious blocker, but they're not the only one. This brainstorm maps the full problem space: every POSIX assumption in the codebase, the realistic transport alternatives on Windows, and what a phased migration path looks like.

## 1. Unix Socket Dependency Audit

The socket dependency is concentrated in four files but touches the entire client-server boundary.

### Server side

**`daemon/index.ts:57-63`** is the binding point:

```typescript
const server = Bun.serve({
  unix: socketPath,
  fetch: app.fetch,
  idleTimeout: 0 as never,
});
```

`Bun.serve({ unix })` is not available on Windows. This is a hard stop: the daemon will not start.

**`daemon/lib/socket.ts`** manages the socket lifecycle: `getSocketPath()` returns the `.sock` file path, `cleanStaleSocket()` checks for stale socket files and PID files, `writePidFile()` / `removePidFile()` / `removeSocketFile()` handle cleanup on shutdown. The entire module assumes the transport is a filesystem-visible socket file. PID file liveness checking via `process.kill(pid, 0)` works on Windows, but the socket file itself wouldn't exist under a TCP transport.

### Client side

**`lib/daemon-client.ts`** is the sole client module. Every function (`daemonFetch`, `daemonFetchBinary`, `daemonStream`, `daemonStreamAsync`, `daemonHealth`) uses `node:http` with the `socketPath` option. There's also a duplicate `getSocketPath()` that mirrors the daemon's version for the lib/ layer.

This is approximately 300 lines of client code that assumes socket-file transport. Under `node:http`, the `socketPath` option does use Windows AF_UNIX on Windows 10 1803+, so the client side might work with Windows native sockets if the server could listen on one.

### Touchpoint summary

| File | Role | Lines | Windows impact |
|------|------|-------|----------------|
| `daemon/index.ts` | Server bind | 57-63 | **Blocks startup** |
| `daemon/lib/socket.ts` | Socket lifecycle | All 121 lines | Assumes filesystem socket |
| `lib/daemon-client.ts` | All client calls | All 342 lines | Uses `node:http` socketPath |
| `lib/paths.ts:12-22` | Home directory | `getGuildHallHome()` | Uses `HOME` env var |

The dependency is deep but narrow: one binding call, one lifecycle module, one client module. Every other part of the system talks HTTP through Hono, which is transport-agnostic.

## 2. Windows IPC Alternatives

### Option A: TCP localhost

**How it works.** Replace `Bun.serve({ unix })` with `Bun.serve({ port: N })` on Windows. Clients connect via `http://127.0.0.1:N` instead of a socket path.

**Bun support:** Full. `Bun.serve({ port })` works on Windows today.

**Security.** A TCP port on localhost is visible to every process on the machine. Any local user or application can connect to the daemon. Unix sockets inherit filesystem permissions; TCP ports do not. For a personal development tool, this is acceptable. For a shared machine or a security-conscious environment, it's a regression. The risk is low but real: another application could bind the port first (either accidentally or maliciously), or another user could send requests to the daemon.

**Port management.** Fixed port risks collision. Dynamic port (bind to 0, write actual port to a file) avoids collision but adds a discovery step: clients read the port file before connecting. This is the pattern VS Code and JetBrains IDEs use for their local daemons.

**Performance.** TCP loopback is marginally slower than Unix sockets due to the full TCP/IP stack overhead, but the difference is negligible for an HTTP API serving development tools. Not a concern.

**Complexity.** Low. The transport change is isolated to `daemon/index.ts` and the client module. The rest of the app is HTTP over Hono and doesn't care.

**Verdict:** Simplest path. Works today. Security is the only real downside, and it's manageable for a single-user development tool.

### Option B: Windows Named Pipes

**How it works.** Named pipes are Windows' native IPC mechanism. A server creates a pipe at `\\.\pipe\guild-hall`, clients connect to it by name. They support access control, are not visible on the network, and provide the same single-machine isolation as Unix sockets.

**Bun support:** None. `Bun.serve()` does not accept a named pipe path. Bun has no API for creating a named pipe server. This would require dropping to `node:net` or native bindings.

**Implementation.** You'd need to replace `Bun.serve()` with a `node:http.createServer()` + `node:net` listener on the named pipe path, then mount Hono onto the Node.js HTTP server. Hono supports this (`import { serve } from '@hono/node-server'`), but it means running Hono on the Node.js HTTP stack rather than Bun's native server. Performance characteristics change, and Bun-specific options (`idleTimeout`) are unavailable.

**Complexity.** Medium. The architectural change is bigger than TCP: you're swapping the server runtime from Bun-native to Node.js-compat. But it gives you the security model that TCP lacks.

**Verdict:** Better security model than TCP, but significantly more implementation complexity and no Bun-native support. Only worth it if single-user localhost TCP is unacceptable.

### ~~Option C: Windows AF_UNIX~~ (eliminated)

Windows AF_UNIX is a 2018 kernel bolt-on that Microsoft hasn't invested in deeply since. Even if Bun wires it up, building on a flimsy OS integration through a runtime's compat layer is two layers of uncertainty. TCP localhost is proven and native on Windows going back decades. Don't build on what's shaky when something solid is available.

### Comparison matrix

| Factor | TCP localhost | Named Pipes |
|--------|--------------|-------------|
| Bun support | Yes | No |
| Security (local) | Process-visible | ACL-controlled |
| Implementation effort | Low | Medium |
| Port collision risk | Yes (mitigable) | No |
| Client changes | URL-based | Pipe path |
| Maturity on Windows | Proven | Proven |

Windows AF_UNIX is excluded from comparison (see Option C above).

## 3. Bun on Windows: Current State

Bun declared Windows support stable starting around Bun 1.1 (early 2024). The core runtime, bundler, and test runner all work. But "stable" means "ships and runs," not "every API is feature-complete."

### What works

- `Bun.serve({ port })`: TCP server binding is fully supported.
- `Bun.spawn(["git", ...args])`: Direct binary execution works. Guild Hall's `daemon/lib/git.ts` spawns git as an array of arguments, not through a shell, so this is portable.
- `bun test`, `bun install`, `bun run`: Core toolchain works.
- `node:fs`, `node:path`, `node:http`: Standard Node.js compat APIs are generally available.

### What doesn't work or is uncertain

- **`Bun.serve({ unix })`**: Not available on Windows. This is the primary blocker.
- **`node:http` with `socketPath`**: May work via Windows AF_UNIX in Bun's Node.js compat layer, but untested and undocumented. Needs verification against current Bun releases.
- **Signal handling**: `SIGTERM` and `SIGINT` have partial support on Windows. The `process.on("SIGINT")` handler in `daemon/index.ts:83` fires on Ctrl+C but `SIGTERM` is not a Windows concept. Process cleanup on daemon shutdown may not trigger reliably.
- **`idleTimeout: 0 as never`**: This Bun-specific server option (`daemon/index.ts:62`) keeps SSE connections alive. Behavior under a TCP server may differ, or the option may not exist on the Node.js HTTP compat path. Needs testing.

### What to verify (stale knowledge)

These require checking against current Bun releases (the search terms for `github.com/oven-sh/bun/issues`):

1. Has `Bun.serve({ unix })` been added to Windows?
2. Does `node:http` with `socketPath` work in Bun on Windows for SSE streaming?
3. Any open bugs around `Bun.spawn()` and stdout/stderr pipe draining on Windows?

## 4. Beyond Sockets: Other POSIX Assumptions

### 4.1 HOME environment variable

**`lib/paths.ts:15-21`**: `getGuildHallHome()` reads `process.env.HOME`. On Windows, `HOME` is not a standard environment variable. The standard is `USERPROFILE` (e.g., `C:\Users\username`). The code will throw "Cannot determine home directory" on a stock Windows install.

**Fix:** Check `USERPROFILE` as a fallback. Or use Node.js `os.homedir()`, which handles the platform difference internally. The `GUILD_HALL_HOME` env var override already exists as an escape valve, but the error message doesn't guide users to it.

### 4.2 Shell execution

**`daemon/services/notification-service.ts:52`**: `Bun.spawn(["sh", "-c", command])` runs shell notification commands. `sh` does not exist on stock Windows. The equivalent would be `cmd.exe /c` or `powershell -Command`.

**`daemon/app.ts:249`**: `Bun.spawn(["which", "bwrap"])` checks for bubblewrap. This is already gated by `process.platform === "linux"`, so it's not a bug, but it's a reminder that platform checks exist in exactly one place.

**`.git-hooks/pre-commit.sh`**: Bash script. Will not run on Windows without Git Bash in PATH. Git for Windows ships with Git Bash, and git hooks do invoke it through the git-shipped `sh.exe`, so this may actually work for git operations. But if the user runs it manually, it won't work from PowerShell.

### 4.3 Path separators

Guild Hall uses `node:path` for path construction throughout (77+ occurrences across 20+ files). `path.join()` and `path.resolve()` produce platform-correct separators on Windows. This is low risk.

The exception is hardcoded forward slashes in string operations. Two areas to audit:

- **Git branch names** (`claude/main`, `claude/commission/...`): These are git refs, not filesystem paths. Git uses forward slashes internally on all platforms. Safe.
- **`.lore/` path prefixes** in string matching (e.g., `f.startsWith(".lore/")` in `daemon/lib/git.ts:617`): git status output uses forward slashes on all platforms. Safe.
- **URL paths** in HTTP routes: Forward slashes. Safe.

The codebase is cleaner than expected here. No obvious hardcoded `/home/` or `/tmp/` literals in production code.

### 4.4 Git worktrees on Windows

Git worktrees work on Windows, but with friction:

**Path length.** Windows MAX_PATH is 260 characters. Guild Hall worktree paths follow `~/.guild-hall/worktrees/<project>/<activityId>/`. A typical path:

```
C:\Users\username\.guild-hall\worktrees\guild-hall\commission-Octavia-20260324-063017\
```

That's ~90 characters for the root, before any file paths inside. Deep `.lore/` hierarchies could hit the limit. Git for Windows supports `core.longpaths=true`, but it must be configured per-repo or globally. The daemon should set this automatically when creating worktrees.

**Symlinks.** Git worktrees use a `.git` file (not symlink) that references the main repo. This works without symlink privileges. Guild Hall doesn't create symlinks elsewhere.

**Sparse checkout.** Works on Windows. `daemon/lib/git.ts` uses `git sparse-checkout init --cone` and `git sparse-checkout set`, both supported.

**Line endings.** Not directly a worktree issue, but `core.autocrlf` defaults can cause unexpected git status noise. Guild Hall should add a `.gitattributes` with `* text=auto eol=lf` to enforce consistent line endings.

### 4.5 Process management

**PID file liveness** (`daemon/lib/socket.ts:29-35`): `process.kill(pid, 0)` works on Windows to check if a process is alive. This is portable.

**`SIGINT` / `SIGTERM`** (`daemon/index.ts:83-84`): `process.on("SIGINT")` fires on Ctrl+C on Windows. `process.on("SIGTERM")` is not a Windows concept. If the daemon is stopped by Task Manager or `taskkill`, the shutdown handler won't fire, leaving stale PID files. The `cleanStaleSocket()` logic on next startup handles this (dead PID = clean up), so it's a recoverable state.

**bubblewrap** (`daemon/app.ts:241-266`): The bubblewrap sandbox check is Linux-only (gated by `process.platform === "linux"`). On Windows, the Claude Agent SDK uses its own sandboxing. No action needed here.

### 4.6 Summary of non-socket issues

| Issue | Severity | Fix complexity |
|-------|----------|---------------|
| `HOME` env var not set | **Blocks startup** | Trivial (add `USERPROFILE` fallback) |
| `sh -c` in notification dispatch | Breaks notifications | Low (platform-switch to `cmd.exe /c`) |
| Pre-commit hook is bash | Breaks hook | Low (add PowerShell equivalent or rely on Git Bash) |
| Git long path support | Silent failures | Low (configure `core.longpaths` on worktree creation) |
| `SIGTERM` not available | Stale PID on kill | Already handled (cleanup on next start) |
| Line ending inconsistency | Git status noise | Low (add `.gitattributes`) |
| `idleTimeout` on Node HTTP | SSE may timeout | Needs investigation |

## 5. Architecture Options

### Option 1: Transport abstraction layer

Abstract the daemon transport so it can serve over Unix socket, TCP, or named pipe depending on platform.

```typescript
// daemon/lib/transport.ts
interface DaemonTransport {
  start(app: { fetch: Function }): Promise<{ stop: () => void }>;
  getConnectionInfo(): ConnectionInfo;
}

type ConnectionInfo =
  | { type: "unix"; socketPath: string }
  | { type: "tcp"; host: string; port: number }
  | { type: "pipe"; pipeName: string };
```

The daemon creates a transport based on `process.platform`, the client reads connection info from a file (port number for TCP, socket path for Unix), and everything above the transport layer stays the same.

**Pros:** Clean separation. Future-proof (could add named pipes later if Bun adds support). Each platform gets its best option.

**Cons:** More code to maintain. Connection info file adds a discovery step for TCP. Named pipes can't be implemented today (no Bun support), so the abstraction is premature for that case.

**When it makes sense:** If you want to support both Unix socket (Linux/macOS) and TCP (Windows) simultaneously, and the codebase is going to live with both long-term.

### Option 2: TCP fallback on Windows only

Keep Unix sockets on Linux/macOS. On Windows, use `Bun.serve({ port })` with a dynamic port written to a discovery file.

```typescript
// daemon/index.ts
if (process.platform === "win32") {
  server = Bun.serve({ port: 0, fetch: app.fetch }); // OS assigns port
  writePortFile(server.port);
} else {
  server = Bun.serve({ unix: socketPath, fetch: app.fetch });
}
```

Client reads the port file on Windows, uses socket path on POSIX:

```typescript
// lib/daemon-client.ts
function getTransport(): { socketPath: string } | { hostname: string; port: number } {
  if (process.platform === "win32") {
    return { hostname: "127.0.0.1", port: readPortFile() };
  }
  return { socketPath: getSocketPath() };
}
```

**Pros:** Minimal change. Each platform uses its native best option. No premature abstraction.

**Cons:** Two code paths means two things to test. The TCP path has weaker security isolation. Port file introduces a small race window on startup.

**When it makes sense:** If Windows support is a secondary concern and you want the minimum viable change. This is the pragmatic option.

### Option 3: TCP everywhere

Drop Unix sockets entirely. Use `Bun.serve({ port })` on all platforms. Simplifies the codebase to one transport.

**Pros:** One code path. No platform branching. Easier to test and debug.

**Cons:** Loses Unix socket security model on Linux/macOS. Breaking change for existing users (socket path disappears, port file appears). Marginal performance regression on POSIX (TCP overhead vs socket). Goes against the grain: Unix sockets are the right tool for local daemons on POSIX.

**When it makes sense:** If cross-platform simplicity is more important than POSIX-optimal security. Not recommended.

### ~~Option 4: Node.js HTTP server on Windows~~ (eliminated)

This option existed to support AF_UNIX or named pipes through Node's compat layer. With AF_UNIX eliminated and named pipes lacking Bun support, the complexity of mixing Bun-native and Node-compat server stacks has no payoff. TCP localhost handles the Windows case cleanly.

### Recommended approach

**Option 2 (TCP fallback on Windows only)** is the confirmed path. Unix sockets on Linux/macOS, TCP on `127.0.0.1` with dynamic port on Windows. Auto-detect by `process.platform === "win32"`, no configuration setting.

Options C and 4 are eliminated (AF_UNIX is too flimsy to build on). Option 3 is a regression on POSIX. Option B (named pipes) stays on the shelf as a future possibility if Bun adds support, but it's not needed now. TCP security is acceptable for a single-user development tool bound to loopback.

## 6. Migration Path

### Phase 0: Non-socket portability fixes (no transport changes)

These can land on `master` today without affecting Linux/macOS behavior:

1. **Fix `getGuildHallHome()`**: Add `USERPROFILE` fallback in `lib/paths.ts`. One-liner. Zero risk to existing platforms.
2. **Platform-aware shell dispatch**: Change `notification-service.ts` to use `cmd.exe /c` on Windows. Already a self-contained function with a clear seam.
3. **Add `.gitattributes`**: `* text=auto eol=lf` to enforce line endings. Standard practice.
4. **Configure `core.longpaths`**: Add `git config core.longpaths true` to worktree creation in `daemon/lib/git.ts`. Safe on all platforms.

These are all low-risk, independently testable, and valuable even before the transport layer changes. They reduce the eventual Windows PR from "many concerns" to "just the transport."

### Phase 1: Transport abstraction

Introduce platform-aware daemon binding and client connection:

1. **Daemon side**: `daemon/index.ts` checks `process.platform` and either binds a Unix socket or a TCP port on `127.0.0.1` (not `"localhost"`, to avoid IPv4/IPv6 resolution ambiguity). The TCP path writes the port to a file alongside where the socket would be.
2. **Socket lifecycle**: `daemon/lib/socket.ts` gains a TCP-aware mode: instead of cleaning socket files, it manages port files. PID file logic stays the same.
3. **Client side**: `lib/daemon-client.ts` detects which transport is active (socket file exists? port file exists?) and connects accordingly.
4. **Tests**: Socket tests gain Windows-aware assertions. A new test verifies TCP transport on any platform.

This is the big change. It touches three files substantively. Everything above the transport (routes, services, SDK runner, toolbox) is unaffected.

### Phase 2: Verification and hardening

1. **CI**: Add a Windows runner to the test matrix. Even without full E2E, unit tests should pass.
2. **Git worktree testing**: Verify worktree create/merge/cleanup on NTFS.
3. **SSE streaming over TCP**: Verify long-lived SSE connections don't timeout or drop. The `idleTimeout: 0` hack in `Bun.serve()` may behave differently or be unnecessary over TCP.
4. **Signal handling**: Document that `SIGTERM` doesn't work on Windows. Verify that `SIGINT` (Ctrl+C) still triggers clean shutdown.
5. **Pre-commit hook**: Document that Git for Windows's bundled `sh.exe` runs the hook. Optionally provide a PowerShell equivalent.

### Phase 3: Polish

1. **Installation docs**: Windows-specific setup guide (Git for Windows, Bun install, PowerShell vs Git Bash).
2. **Error messages**: Any platform-specific error messages should say what to do, not just what went wrong.
3. **Config defaults**: No `transport` setting needed. Auto-detection by platform is sufficient.

### What's incremental vs. big-bang

Phase 0 is fully incremental: each fix is an independent PR. Phase 1 is a single coordinated change (you can't ship half a transport abstraction), but it's contained to three files. Phases 2 and 3 are incremental again.

The minimum viable Windows support is Phase 0 + Phase 1. That gets the daemon starting and clients connecting on Windows.

## Resolved Questions

1. **Has Bun added `unix:` support on Windows since mid-2025?** Does not matter. Windows AF_UNIX is a flimsy OS integration. Building on it through Bun's compat layer is two layers of uncertainty. TCP localhost is proven and native. Proceed with TCP fallback regardless.

2. ~~**Does `node:http` with `socketPath` work in current Bun on Windows?**~~ Struck. With TCP as the Windows transport, the client connects via `127.0.0.1:port`, not `socketPath`. No longer on the critical path.

3. **Is TCP security acceptable for this use case?** Yes. Bind to `127.0.0.1` explicitly (not the string `"localhost"`, which could resolve to `::1` on some Windows configurations). TCP on loopback is not network-accessible. Any attacker with local code execution already has access to the filesystem, git repos, and SSH keys. The daemon is not the weakest link. Document the local-process visibility trade-off in setup docs.

4. **Should the transport be configurable?** No. Auto-detect by `process.platform === "win32"`. WSL and native Windows have separate home directories and separate Guild Hall installations. There's no cross-environment scenario that needs a config knob. If a real need surfaces later, adding the setting is a small change on top of auto-detection.

5. **What about the Claude Agent SDK sandbox on Windows?** External dependency risk, not a Guild Hall design concern. The bubblewrap check is already platform-gated (`process.platform === "linux"`). Guild Hall delegates sandboxing to the SDK. If the SDK's Windows sandbox has issues, that's the SDK's problem. Document the dependency in setup docs.
