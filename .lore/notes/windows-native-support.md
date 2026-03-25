---
title: "Implementation notes: windows-native-support"
date: 2026-03-24
status: complete
tags: [implementation, notes, windows, cross-platform, transport]
source: .lore/plans/infrastructure/windows-native-support.md
modules: [daemon, daemon-lib-socket, daemon-lib-git, lib-daemon-client, lib-paths, notification-service]
related:
  - .lore/specs/infrastructure/windows-native-support.md
  - .lore/brainstorm/windows-native-support.md
---

# Implementation Notes: Windows Native Support

## Progress
- [x] Phase 1 (Step 1): Replace process.env.HOME with os.homedir()
- [x] Phase 2 (Step 2): Platform-appropriate shell dispatch
- [x] Phase 3 (Step 3): Git long paths and .gitattributes
- [x] Phase 4 (Step 4): Transport descriptor type and lifecycle module refactoring
- [x] Phase 5 (Step 5): Daemon binding platform branch
- [x] Phase 6 (Step 6): Transport discovery function (shared)
- [x] Phase 7 (Step 7): Client functions use transport descriptor
- [x] Phase 8 (Step 8): Validation

## Log

### Phase 1 (Step 1): Replace process.env.HOME with os.homedir()
- Dispatched: Implementation agent for lib/paths.ts, notes-generator.ts consolidation, tests
- Result: os.homedir() replaces process.env.HOME in getGuildHallHome(). Duplicate defaultGuildHallHome() in notes-generator.ts eliminated. Import of getGuildHallHome from @/lib/paths added.
- Tests: 3 path tests pass, 17 notes-generator tests pass
- Review: No concerns. Consolidation is complete (grep confirms no other callers).

### Phase 2 (Step 2): Platform-appropriate shell dispatch
- Dispatched: Implementation agent for notification-service.ts platform branching
- Result: Extracted pure `shellForPlatform(platform)` function returning `["cmd.exe", "/c"]` for win32, `["sh", "-c"]` otherwise. defaultDispatchShell calls it with process.platform.
- Tests: 21 notification service tests pass including 3 new shellForPlatform tests
- Review: No concerns. Clean extraction, no POSIX regression.

### Phase 3 (Step 3): Git long paths and .gitattributes
- Dispatched: Implementation agent for .gitattributes and git.ts createWorktree
- Result: `.gitattributes` created with `* text=auto eol=lf`. createWorktree now passes `-c core.longpaths=true` as global git option before subcommand.
- Tests: 39/40 git tests pass (1 pre-existing failure unrelated to change)
- Review: No concerns. `-c` flag correctly placed before subcommand in args array. Inert on POSIX.
- Note: .gitattributes triggered CRLF-to-LF normalization warnings on 6 files.

### Phase 4 (Step 4): Transport descriptor type and lifecycle module refactoring
- Dispatched: Implementation agent for socket.ts rename, TransportDescriptor type, port file lifecycle
- Result: `daemon/lib/socket.ts` renamed to `daemon/lib/transport.ts` via git mv. `TransportDescriptor` discriminated union exported. Port file lifecycle functions (`getPortFilePath`, `writePortFile`, `removePortFile`, `cleanStalePort`) mirror socket file lifecycle. `idleTimeout: 0` pre-check on TCP passed.
- Tests: 25 transport tests pass. Existing socket tests updated for cross-platform path assertions (path.join instead of hardcoded /).
- Review: All 6 review checkpoints clean. Type is complete, port lifecycle mirrors socket lifecycle, no remaining old imports.

### Phase 5 (Step 5): Daemon binding platform branch
- Dispatched: Combined with Steps 6-7 as tightly coupled changes
- Result: `daemon/index.ts` now has platform branch. Windows: `Bun.serve({ port: 0, hostname: "127.0.0.1" })` with port file discovery. POSIX: `Bun.serve({ unix: socketPath })`. Both share `app.fetch`, `idleTimeout: 0`, `cleanupFiles` closure.

### Phase 6 (Step 6): Transport discovery function
- Result: `discoverTransport()` replaces duplicate `getSocketPath()` in `lib/daemon-client.ts`. File-based detection (socket file first, then port file). `TransportDescriptor` duplicated in lib/ (cannot import from daemon/).
- Tests: 5 discovery tests (socket exists, port file exists, neither, non-numeric, precedence)

### Phase 7 (Step 7): Client functions use transport descriptor
- Result: All 5 client functions (`daemonFetch`, `daemonFetchBinary`, `daemonStream`, `daemonStreamAsync`, `daemonHealth`) accept `transportOverride?: TransportDescriptor`. Cascade fix: `daemon/services/manager/toolbox.ts` updated.
- Tests: 32 daemon-client tests pass. TCP integration tests for all client functions added.
- Review (Steps 5-7 combined): All 7 review checkpoints clean. Platform branch minimal, discovery file-based, SSE streaming tested on TCP, no POSIX regressions, all callers updated, TransportDescriptor types identical.

### Phase 8 (Step 8): Validation
- Full test suite: 3326 pass, 60 fail (all failures pre-existing: operations-loader tests, Windows path separator assertions)
- Spec compliance: All 17 requirements (REQ-WIN-1 through REQ-WIN-17) validated as MET
- No divergence from spec

## Divergence

- `daemon/services/manager/toolbox.ts`: The plan did not mention this file, but it called the old `getSocketPath()` from `lib/daemon-client.ts` which was removed in Step 6. Updated to use `discoverTransport()` instead. This was a necessary cascade fix.
