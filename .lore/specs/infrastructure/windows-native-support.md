---
title: Windows native support
date: 2026-03-24
status: implemented
tags: [windows, cross-platform, transport, ipc, tcp, sockets, portability]
modules: [daemon, daemon-lib-socket, daemon-lib-git, lib-daemon-client, lib-paths, notification-service]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/brainstorm/windows-native-support.md
  - .lore/design/daemon-rest-api.md
req-prefix: WIN
---

# Spec: Windows Native Support

## Overview

Guild Hall runs on Linux and macOS. The daemon binds a Unix socket, and every client connects through it. On Windows, `Bun.serve({ unix })` is not available, which blocks the daemon from starting entirely. Beyond the socket, a handful of POSIX assumptions (HOME environment variable, `sh -c` shell dispatch, missing long-path support in git) prevent the rest of the system from functioning even if the transport were solved.

This spec defines what it takes to run Guild Hall natively on Windows (not under WSL). The approach is TCP fallback on Windows with Unix sockets preserved on POSIX, plus targeted portability fixes for non-socket assumptions. The goal is minimum viable Windows support: the daemon starts, clients connect, commissions and meetings run, and git worktrees function. Full platform parity (CI matrix, installer, PowerShell integration) is out of scope.

## Entry Points

- A developer on Windows wants to run Guild Hall without WSL (from user request)
- The daemon fails to start on Windows because `Bun.serve({ unix })` is unavailable (from `apps/daemon/index.ts:57-63`)
- REQ-DAB-2 already contemplates alternative transports: "Other transports may proxy to this API" (from daemon-application-boundary spec)

## Requirements

### Transport

- REQ-WIN-1: On Linux and macOS, the daemon continues to bind a Unix socket at `~/.guild-hall/guild-hall.sock`. No behavior change on POSIX platforms.

- REQ-WIN-2: On Windows (`process.platform === "win32"`), the daemon binds a TCP port on `127.0.0.1` instead of a Unix socket. The bind address must be the literal `127.0.0.1`, not the string `"localhost"`, to avoid IPv4/IPv6 resolution ambiguity on Windows.

- REQ-WIN-3: The TCP port must be dynamically assigned (bind to port 0, let the OS choose). A fixed port risks collision with other applications. The daemon writes the assigned port number to a port discovery file at `~/.guild-hall/guild-hall.port` (alongside the existing `guild-hall.sock` convention). The PID file on Windows anchors to the port file: `guild-hall.port.pid`.

- REQ-WIN-4: Transport selection is automatic based on `process.platform`. There is no user-facing configuration setting for transport type. WSL and native Windows have separate home directories and separate Guild Hall installations; no cross-environment scenario requires a config knob.

- REQ-WIN-5: Everything above the transport layer (Hono routes, services, SDK runner, toolbox resolver, EventBus) must be unaffected by the transport change. The HTTP contract is the boundary; transport is below it.

### Client connectivity

- REQ-WIN-6: The daemon client (`lib/daemon-client.ts`) must connect via the active transport: Unix socket on POSIX, TCP on Windows. Transport detection must work from the discovery files (socket file exists, or port file exists), not from `process.platform`, so that transport tests are runnable on any OS and the client doesn't hardcode platform assumptions. When a discovery file exists but the daemon isn't running (stale file), the existing `classifyError()` pattern handles this: the connection attempt fails with ECONNREFUSED and the client surfaces a `DaemonError`. The daemon side (REQ-WIN-4) uses `process.platform` because it knows what it's binding at startup; the client infers from evidence on disk because it may run in a separate process (web server, CLI) that doesn't share the daemon's runtime state.

- REQ-WIN-7: SSE streaming must work over TCP. Long-lived connections used by `daemonStream` and `daemonStreamAsync` must not timeout or drop under the TCP transport. `Bun.serve({ port })` uses the same options interface as `Bun.serve({ unix })`, so `idleTimeout: 0` should be available on both paths. This must be verified against the current Bun version before transport code is written. If `idleTimeout` behaves differently or is unavailable on the TCP path, the plan must address SSE keepalive as a separate concern.

### Daemon lifecycle on Windows

- REQ-WIN-8: The daemon lifecycle module (`apps/daemon/lib/socket.ts`) must manage the port discovery file on Windows in addition to the socket file on POSIX. PID file logic (write on start, remove on shutdown, stale-PID detection on next start) must work on both platforms.

- REQ-WIN-9: On Windows, if the daemon is killed without a clean shutdown (Task Manager, `taskkill`), the `SIGTERM` handler will not fire. The next daemon start must detect and recover from stale PID and port files, the same way it currently recovers from stale socket files on POSIX.

- REQ-WIN-10: `SIGINT` (Ctrl+C) must trigger clean shutdown on Windows. `SIGTERM` handling is documented as unavailable on Windows, and stale-file recovery (REQ-WIN-9) covers the gap.

### Platform portability

- REQ-WIN-11: `getGuildHallHome()` in `lib/paths.ts` must resolve the home directory on Windows. The `HOME` environment variable is not set on stock Windows. The preferred fix is `os.homedir()` from `node:os`, which handles platform differences internally (including `USERPROFILE`, `HOMEDRIVE`/`HOMEPATH`, and edge cases like network home directories). The existing `GUILD_HALL_HOME` env var override continues to work as an escape valve and takes precedence over `os.homedir()`.

- REQ-WIN-12: Shell command dispatch in `apps/daemon/services/notification-service.ts` must use a platform-appropriate shell on Windows. The current `sh -c` invocation does not exist on stock Windows. On Windows, use `cmd.exe /c` (simpler, fewer encoding concerns than PowerShell).

- REQ-WIN-13: Git worktree creation must enable long-path support (`core.longpaths`) on Windows. Guild Hall worktree paths under `~/.guild-hall/worktrees/<project>/<activityId>/` can approach or exceed Windows' 260-character MAX_PATH limit when combined with deep file hierarchies inside the worktree. Note: `core.longpaths true` is inert on Linux and macOS (the setting only affects Windows MAX_PATH handling), so this can be set unconditionally.

- REQ-WIN-14: The repository must include a `.gitattributes` file with `* text=auto eol=lf` to enforce consistent line endings across platforms. Without this, `core.autocrlf` defaults on Windows cause spurious git status noise that can interfere with worktree operations and diff detection.

### Scope boundaries

- REQ-WIN-15: The bubblewrap sandbox check (`apps/daemon/app.ts`, gated by `process.platform === "linux"`) requires no changes. Guild Hall delegates SDK sandboxing to the Claude Agent SDK. If the SDK's Windows sandbox has issues, that is an external dependency, not a Guild Hall concern.

- REQ-WIN-16: The pre-commit hook (`.git-hooks/pre-commit.sh`) is a bash script. Git for Windows ships `sh.exe` and invokes hooks through it, so the hook runs when triggered by git. No PowerShell equivalent is required. Document that the hook depends on Git for Windows.

- REQ-WIN-17: Named pipe transport is out of scope. Bun has no API for named pipe servers. If Bun adds support in the future, named pipes could replace TCP on Windows for better access control, but TCP on loopback is sufficient for a single-user development tool.

## Phasing

The requirements divide into two phases with a clear dependency boundary.

**Phase 0 (portability fixes, no transport changes):** REQ-WIN-11, REQ-WIN-12, REQ-WIN-13, REQ-WIN-14. These can land independently on `master` without affecting Linux/macOS behavior. Each is a self-contained change. They reduce the eventual transport PR from "many concerns" to "just the transport."

**Phase 1 (transport):** REQ-WIN-1 through REQ-WIN-10. This is a single coordinated change: daemon binding, lifecycle management, and client connectivity must ship together. Everything above the transport layer (REQ-WIN-5) is unaffected.

REQ-WIN-15, REQ-WIN-16, and REQ-WIN-17 are scope boundaries that require no implementation work.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Windows CI matrix | Phase 1 complete, manual testing done | [STUB: windows-ci] |
| Windows install docs | Phase 1 complete | [STUB: windows-setup-guide] |
| Named pipe transport | Bun adds named pipe server API | REQ-WIN-17 (revisit scope boundary) |

## Success Criteria

**Verified by automated tests (cross-platform):**
- [ ] All existing tests pass on Linux and macOS with no observable behavior change
- [ ] TCP transport unit tests pass on any platform (Linux TCP test validates the Windows code path)
- [ ] Port discovery file round-trip works (write port, read port, connect, verify response)
- [ ] Stale port-file and PID-file recovery works (dead PID detected, both files cleaned, daemon binds successfully)
- [ ] `getGuildHallHome()` resolves correctly when only `USERPROFILE` is set (no `HOME`)

**Verified by manual testing on Windows (or future Windows CI runner):**
- [ ] Daemon starts on Windows without WSL
- [ ] Web UI connects and renders dashboard, commissions, meetings
- [ ] SSE streaming works for live commission/meeting updates
- [ ] Commission dispatch, execution, and completion work end-to-end
- [ ] Meeting creation, messaging, and note generation work end-to-end
- [ ] Git worktree create, sparse checkout, merge, and cleanup work on NTFS
- [ ] A notification shell channel configured with a Windows-compatible command (`cmd.exe /c echo test`) fires without error

## AI Validation

**Defaults apply:**
- Unit tests with mocked time/network/filesystem
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Phase 0 changes must not alter any observable behavior on Linux/macOS (verified by existing test suite passing unchanged)
- Transport tests must be runnable on any platform: a TCP transport test on Linux validates the code path that Windows will use
- Port discovery file round-trip: write port, read port, connect, verify response
- Stale port-file recovery: simulate crash (leave port file and PID file with dead PID), verify next start removes both and binds successfully
- Verify `idleTimeout: 0` is accepted by `Bun.serve({ port })` before writing transport code

## Constraints

- **No TCP on POSIX.** Unix sockets are the correct tool for local daemons on POSIX. TCP everywhere (eliminated Option 3 in the brainstorm) is a security regression with no upside.
- **No config knob for transport.** Auto-detection by `process.platform` is sufficient. Adding a setting creates a support surface for a scenario that doesn't exist.
- **No Windows AF_UNIX.** Windows AF_UNIX (2018 kernel bolt-on) is too flimsy to build on. TCP localhost is proven and native on Windows. Don't build on what's shaky when something solid is available.
- **Bun is the runtime.** The transport change must work within `Bun.serve()` capabilities. Dropping to `node:http.createServer()` for named pipe support (eliminated Option 4) introduces a server runtime split that isn't justified.

## Context

- **Brainstorm:** `.lore/brainstorm/windows-native-support.md` maps the full problem space with code-level audit, IPC alternatives comparison, and migration path. All open questions resolved in meeting review sessions (2026-03-24).
- **Daemon boundary:** REQ-DAB-2 in `.lore/specs/infrastructure/daemon-application-boundary.md` already contemplates alternative transports.
- **REST API design:** `.lore/design/daemon-rest-api.md` explicitly states "paths and transport details may evolve."
- **SSE timeout:** `.lore/retros/phase-4-commissions.md` documents the `idleTimeout: 0` workaround for SSE connections, relevant to REQ-WIN-7.
