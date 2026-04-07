---
title: "Commission: HTML mockup preview: Phases 1-3 (types, scanner, daemon, proxy)"
date: 2026-04-07
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 1-3 of the HTML mockup preview plan at `.lore/plans/ui/html-mockup-preview.md`.\n\nRead the plan thoroughly before starting. The spec is at `.lore/specs/ui/html-mockup-preview.md`.\n\n**Phase 1: Type Foundation and Scanner** (Steps 1-4)\n- Extend `artifactType` union in `lib/types.ts` to include `\"mockup\"`\n- Add `.html` to `collectArtifactFiles()` in `lib/artifacts.ts`\n- Add mockup branch in `scanArtifacts()` with synthetic metadata\n- Tests in `tests/lib/artifacts.test.ts`\n\n**Phase 2: Daemon Mockup Serving** (Steps 5-6)\n- Add `GET /workspace/artifact/mockup/read` endpoint in `daemon/routes/artifacts.ts`\n- Follow the image serving pattern but with CSP headers per REQ-MKP-10\n- Operation definition and descriptions record\n- Tests in `tests/daemon/routes/artifacts.test.ts`\n\n**Phase 3: Next.js Proxy Route** (Steps 7-8)\n- New file `web/app/api/artifacts/mockup/route.ts`\n- Forward daemon response with all security headers preserved\n- Tests in `tests/web/api/artifacts-mockup.test.ts`\n\nRun `bun test` at the end to confirm nothing is broken. Run `bun run typecheck` and `bun run lint` as well."
dependencies: []
linked_artifacts:
  - lib/types.ts

  - lib/artifacts.ts
  - daemon/routes/artifacts.ts
  - web/app/api/artifacts/mockup/route.ts
  - tests/lib/artifacts.test.ts
  - tests/daemon/routes/artifacts.test.ts
  - tests/web/api/artifacts-mockup.test.ts
  - lib/artifacts.ts
  - daemon/routes/artifacts.ts
  - web/app/api/artifacts/mockup/route.ts
  - tests/lib/artifacts.test.ts
  - tests/daemon/routes/artifacts.test.ts
  - tests/web/api/artifacts-mockup.test.ts
activity_timeline:
  - timestamp: 2026-04-07T00:05:01.928Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-07T00:05:01.930Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-07T00:05:01.977Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-07T00:05:12.055Z
    event: progress_report
    reason: "Read plan and spec. Starting Phase 1: reading source files before making changes."
  - timestamp: 2026-04-07T00:06:08.397Z
    event: progress_report
    reason: "Context gathered. Starting Phase 1: type foundation and scanner changes."
  - timestamp: 2026-04-07T00:07:08.173Z
    event: progress_report
    reason: "Phase 1 complete (type union + scanner + tests, 73 tests pass). Starting Phase 2: daemon mockup serving endpoint."
  - timestamp: 2026-04-07T00:08:14.726Z
    event: progress_report
    reason: "Phase 2 complete (daemon endpoint + tests, 66 tests pass). Starting Phase 3: Next.js proxy route."
  - timestamp: 2026-04-07T00:09:54.828Z
    event: progress_report
    reason: "Phase 3 complete (proxy route + tests, 6 tests pass). Running full verification: typecheck, lint, tests."
  - timestamp: 2026-04-07T00:11:06.410Z
    event: result_submitted
    reason: "Phases 1-3 of the HTML mockup preview plan implemented. All 3538 tests pass, typecheck and lint clean.\n\n**Phase 1: Type Foundation and Scanner**\n- Extended `artifactType` union in `lib/types.ts:77` to include `\"mockup\"`\n- Added `.html` to `collectArtifactFiles()` filter in `lib/artifacts.ts:341`\n- Added mockup branch in `scanArtifacts()` with synthetic metadata (title from filename, status \"complete\", date from mtime, empty content)\n- 7 new scanner tests covering: discovery, synthetic metadata, empty content, mixed file types, nested directories, exclusion of .htm/.xhtml, title derivation\n\n**Phase 2: Daemon Mockup Serving**\n- Added `GET /workspace/artifact/mockup/read` endpoint in `daemon/routes/artifacts.ts` following the image serving pattern\n- CSP headers: `connect-src 'none'`, `frame-ancestors 'none'`, `script-src 'unsafe-inline'`, `style-src 'unsafe-inline' data:`\n- Security headers: `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`\n- Cache: `Cache-Control: no-cache`\n- Extension validation returns 415 for non-.html, path validation returns 400 for traversal\n- Added operation definition and description record entry\n- 10 new daemon route tests covering: missing params (400), unknown project (404), wrong extension (415), missing file (404), path traversal (400), correct content-type, exact body match, CSP header, nosniff, cache-control, content-disposition\n\n**Phase 3: Next.js Proxy Route**\n- Created `web/app/api/artifacts/mockup/route.ts` following the image proxy pattern\n- Forwards all security headers (CSP, X-Content-Type-Options, Content-Disposition, Cache-Control) from daemon response\n- Returns 503 when daemon is offline, 400 for missing params, forwards 404/415 from daemon\n- 6 integration tests using a real HTTP mock server with GUILD_HALL_HOME override\n\n**artifactType exhaustiveness check:** All existing switch points on `artifactType` use non-exhaustive patterns (equality checks with fallthrough to default). Adding \"mockup\" to the union does not break existing code. The UI components (Phase 4) will need explicit mockup handling when that phase is implemented."
  - timestamp: 2026-04-07T00:11:11.741Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Phase 3 complete (proxy route + tests, 6 tests pass). Running full verification: typecheck, lint, tests."
projectName: guild-hall
---
Phases 1-3 of the HTML mockup preview plan implemented. All 3538 tests pass, typecheck and lint clean.

**Phase 1: Type Foundation and Scanner**
- Extended `artifactType` union in `lib/types.ts:77` to include `"mockup"`
- Added `.html` to `collectArtifactFiles()` filter in `lib/artifacts.ts:341`
- Added mockup branch in `scanArtifacts()` with synthetic metadata (title from filename, status "complete", date from mtime, empty content)
- 7 new scanner tests covering: discovery, synthetic metadata, empty content, mixed file types, nested directories, exclusion of .htm/.xhtml, title derivation

**Phase 2: Daemon Mockup Serving**
- Added `GET /workspace/artifact/mockup/read` endpoint in `daemon/routes/artifacts.ts` following the image serving pattern
- CSP headers: `connect-src 'none'`, `frame-ancestors 'none'`, `script-src 'unsafe-inline'`, `style-src 'unsafe-inline' data:`
- Security headers: `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`
- Cache: `Cache-Control: no-cache`
- Extension validation returns 415 for non-.html, path validation returns 400 for traversal
- Added operation definition and description record entry
- 10 new daemon route tests covering: missing params (400), unknown project (404), wrong extension (415), missing file (404), path traversal (400), correct content-type, exact body match, CSP header, nosniff, cache-control, content-disposition

**Phase 3: Next.js Proxy Route**
- Created `web/app/api/artifacts/mockup/route.ts` following the image proxy pattern
- Forwards all security headers (CSP, X-Content-Type-Options, Content-Disposition, Cache-Control) from daemon response
- Returns 503 when daemon is offline, 400 for missing params, forwards 404/415 from daemon
- 6 integration tests using a real HTTP mock server with GUILD_HALL_HOME override

**artifactType exhaustiveness check:** All existing switch points on `artifactType` use non-exhaustive patterns (equality checks with fallthrough to default). Adding "mockup" to the union does not break existing code. The UI components (Phase 4) will need explicit mockup handling when that phase is implemented.

## Decisions

**How to test the Next.js proxy route given the mock.module() prohibition?**
Write an integration-style test that spins up the daemon's Hono app on a local port, uses a transport override to point daemonFetchBinary at it, and exercises the full proxy path. This tests the actual route handler including header forwarding, not just parameter validation.
*Reasoning: The route handler imports daemonFetchBinary directly and has no DI seam. mock.module() is prohibited. The proxy's value is in header forwarding and error handling, which are untestable without calling the daemon. A real Hono test server gives us a true integration test. The daemon route tests already cover the daemon side; this test covers the proxy layer on top.*
