---
title: "Commission: Plan: Windows Native Support"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan for `.lore/specs/infrastructure/windows-native-support.md`. Use the `/lore-development:prep-plan` skill.\n\nThe plan should go to `.lore/plans/infrastructure/windows-native-support.md`.\n\n## Spec Summary\n\n17 requirements in two phases:\n- **Phase 0** (portability fixes, no transport): REQ-WIN-11, 12, 13, 14\n- **Phase 1** (transport): REQ-WIN-1 through 10\n\nREQ-WIN-15, 16, 17 are scope boundaries (no implementation).\n\n## Codebase Audit (already done for you)\n\nHere's what I found in the codebase. Use this to ground the plan in specific files and line numbers.\n\n### Transport touchpoints (Phase 1)\n\n1. **`daemon/index.ts`** (lines 57-63): `Bun.serve({ unix: socketPath, fetch, idleTimeout: 0 as never })`. This is the single server binding. Needs platform branch: Unix socket on POSIX, TCP `127.0.0.1:0` on Windows.\n\n2. **`daemon/lib/socket.ts`**: All lifecycle management. Functions: `getSocketPath()`, `pidFilePathFor()`, `cleanStaleSocket()`, `writePidFile()`, `removePidFile()`, `removeSocketFile()`. On Windows, needs parallel port-file management: `guild-hall.port` (contains port number) and `guild-hall.port.pid`. The PID file logic (stale detection, write, remove) is reusable; the socket-specific parts need a transport-aware abstraction.\n\n3. **`lib/daemon-client.ts`**: All client connectivity. Four functions use `socketPath`:\n   - `daemonFetch()` (line 68): `http.request({ socketPath, ... })`\n   - `daemonFetchBinary()` (line 122): same pattern\n   - `daemonStream()` (line 186): same pattern, SSE\n   - `daemonStreamAsync()` (line 282): same pattern, SSE\n   \n   Per REQ-WIN-6, the client should detect transport from discovery files (socket file exists → use Unix socket; port file exists → use TCP), NOT from `process.platform`. On TCP, `http.request` uses `{ hostname, port }` instead of `{ socketPath }`.\n\n4. **`lib/daemon-client.ts:getSocketPath()`** (line 33): Duplicate of `daemon/lib/socket.ts:getSocketPath()`. Lives in `lib/` so Next.js can use it. Needs to become transport-aware: return a connection descriptor, not just a socket path.\n\n### Portability touchpoints (Phase 0)\n\n5. **`lib/paths.ts:getGuildHallHome()`** (lines 12-22): Uses `process.env.HOME` which doesn't exist on stock Windows. REQ-WIN-11 says use `os.homedir()` from `node:os`. The `GUILD_HALL_HOME` override and `homeOverride` parameter stay.\n\n6. **`daemon/services/meeting/notes-generator.ts:defaultGuildHallHome()`** (lines 209-215): Same `process.env.HOME` pattern, duplicated. Should be consolidated to use `getGuildHallHome()` from `lib/paths.ts`, or at minimum apply the same `os.homedir()` fix.\n\n7. **`daemon/services/notification-service.ts:defaultDispatchShell()`** (lines 51-73): Hardcoded `[\"sh\", \"-c\", command]`. REQ-WIN-12 says use `[\"cmd.exe\", \"/c\", command]` on Windows.\n\n8. **No `.gitattributes` exists** in the repo. REQ-WIN-14 requires adding one with `* text=auto eol=lf`.\n\n9. **Git long paths** (REQ-WIN-13): `daemon/lib/git.ts:runGit()` (line 43) spawns `Bun.spawn([\"git\", ...args], ...)`. The `core.longpaths` config needs to be set during worktree creation. Check `createWorktree()` or equivalent in `daemon/lib/git.ts`.\n\n### Test files affected\n\n- `tests/daemon/socket.test.ts`: Needs new tests for port-file lifecycle, stale port-file recovery\n- `tests/lib/daemon-client.test.ts`: Needs TCP transport tests (can run on Linux to validate the Windows code path per spec)\n- `tests/lib/paths.test.ts`: Needs test for `os.homedir()` fallback when HOME is unset\n\n### Existing patterns to follow\n\n- DI everywhere: functions accept overrides/deps, tests pass temp dirs\n- `fs.mkdtemp()` for temp dirs, cleanup in `afterEach`\n- `daemon-client.test.ts` uses `Bun.serve({ unix })` for integration tests; Phase 1 tests should add parallel `Bun.serve({ port: 0 })` tests\n- Socket test uses `serveOnSocket()` helper with EPERM fallback for sandboxed environments\n\n### Key design decisions for the plan\n\n1. **Transport descriptor type**: The plan needs to define what replaces raw `socketPath: string` in the client API. Something like `{ type: \"unix\", socketPath } | { type: \"tcp\", hostname, port }` that both the daemon and client use.\n\n2. **Discovery function**: A single function that checks for `guild-hall.sock` or `guild-hall.port` and returns the transport descriptor. This is the client-side transport detection (REQ-WIN-6).\n\n3. **Socket module refactoring**: `daemon/lib/socket.ts` needs to handle both socket files and port files. The PID logic is mostly reusable. The module might want a rename to reflect its broader scope (e.g., `daemon/lib/lifecycle.ts` or `daemon/lib/transport.ts`).\n\n4. **`daemon/index.ts` platform branch**: Minimal. Read platform, call either `Bun.serve({ unix })` or `Bun.serve({ port: 0 })`, write the appropriate discovery file.\n\n5. **Phase 0 items are independent commits**: Each can be a separate commission task. They don't interact.\n\n### Review delegation\n\nPhase 0 changes are low-risk (self-contained, don't affect POSIX behavior). A single Thorne review after all four land is sufficient.\n\nPhase 1 is the risk concentration. Review should happen after the transport abstraction is in place but before client changes. Specifically: review the transport descriptor type + socket module refactoring first, then the daemon binding + client changes together. Two review points within Phase 1."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/windows-native-support.md

activity_timeline:
  - timestamp: 2026-03-24T20:42:07.314Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T20:42:07.315Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T20:42:07.365Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T20:42:17.304Z
    event: progress_report
    reason: "Reading the spec and gathering context before invoking prep-plan skill."
  - timestamp: 2026-03-24T20:44:35.357Z
    event: progress_report
    reason: "All context gathered. Drafting the implementation plan for windows-native-support. Spec has 17 REQs in two phases, all codebase touchpoints verified against source."
  - timestamp: 2026-03-24T20:46:49.061Z
    event: progress_report
    reason: "Plan drafted and saved. Running fresh-eyes plan-reviewer agent for independent review."
  - timestamp: 2026-03-24T20:50:25.035Z
    event: result_submitted
    reason: "Created implementation plan for Windows native support at `.lore/plans/infrastructure/windows-native-support.md`.\n\nThe plan covers all 17 requirements across two phases:\n\n**Phase 0 (3 steps, independent commissions):**\n- Step 1: Replace `process.env.HOME` with `os.homedir()` (REQ-WIN-11)\n- Step 2: Platform-appropriate shell dispatch with testable DI (REQ-WIN-12)\n- Step 3: `.gitattributes` + `core.longpaths` for git worktrees (REQ-WIN-13, 14)\n\n**Phase 1 (4 steps, coordinated with two review checkpoints):**\n- Step 4: Transport descriptor type + lifecycle module refactoring (REQ-WIN-3, 8, 9)\n- Step 5: Daemon binding platform branch (REQ-WIN-1, 2, 4, 7, 10)\n- Step 6: Transport discovery function in shared lib (REQ-WIN-6)\n- Step 7: Client functions use transport descriptor (REQ-WIN-6, 7)\n- Step 8: Full validation pass\n\nIncludes delegation guide (Dalton for implementation, Thorne at three review points) and three open questions (idleTimeout pre-check, module rename ripple, .gitattributes normalization).\n\nFresh-eyes plan review completed. Three priority findings addressed: USERPROFILE test limitation documented, caller migration scope resolved (zero callers need changes), core.longpaths timing clarified."
  - timestamp: 2026-03-24T20:50:28.986Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan drafted and saved. Running fresh-eyes plan-reviewer agent for independent review."
projectName: guild-hall
---
Created implementation plan for Windows native support at `.lore/plans/infrastructure/windows-native-support.md`.

The plan covers all 17 requirements across two phases:

**Phase 0 (3 steps, independent commissions):**
- Step 1: Replace `process.env.HOME` with `os.homedir()` (REQ-WIN-11)
- Step 2: Platform-appropriate shell dispatch with testable DI (REQ-WIN-12)
- Step 3: `.gitattributes` + `core.longpaths` for git worktrees (REQ-WIN-13, 14)

**Phase 1 (4 steps, coordinated with two review checkpoints):**
- Step 4: Transport descriptor type + lifecycle module refactoring (REQ-WIN-3, 8, 9)
- Step 5: Daemon binding platform branch (REQ-WIN-1, 2, 4, 7, 10)
- Step 6: Transport discovery function in shared lib (REQ-WIN-6)
- Step 7: Client functions use transport descriptor (REQ-WIN-6, 7)
- Step 8: Full validation pass

Includes delegation guide (Dalton for implementation, Thorne at three review points) and three open questions (idleTimeout pre-check, module rename ripple, .gitattributes normalization).

Fresh-eyes plan review completed. Three priority findings addressed: USERPROFILE test limitation documented, caller migration scope resolved (zero callers need changes), core.longpaths timing clarified.
