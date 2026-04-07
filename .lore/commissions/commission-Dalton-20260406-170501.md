---
title: "Commission: HTML mockup preview: Phases 1-3 (types, scanner, daemon, proxy)"
date: 2026-04-07
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phases 1-3 of the HTML mockup preview plan at `.lore/plans/ui/html-mockup-preview.md`.\n\nRead the plan thoroughly before starting. The spec is at `.lore/specs/ui/html-mockup-preview.md`.\n\n**Phase 1: Type Foundation and Scanner** (Steps 1-4)\n- Extend `artifactType` union in `lib/types.ts` to include `\"mockup\"`\n- Add `.html` to `collectArtifactFiles()` in `lib/artifacts.ts`\n- Add mockup branch in `scanArtifacts()` with synthetic metadata\n- Tests in `tests/lib/artifacts.test.ts`\n\n**Phase 2: Daemon Mockup Serving** (Steps 5-6)\n- Add `GET /workspace/artifact/mockup/read` endpoint in `daemon/routes/artifacts.ts`\n- Follow the image serving pattern but with CSP headers per REQ-MKP-10\n- Operation definition and descriptions record\n- Tests in `tests/daemon/routes/artifacts.test.ts`\n\n**Phase 3: Next.js Proxy Route** (Steps 7-8)\n- New file `web/app/api/artifacts/mockup/route.ts`\n- Forward daemon response with all security headers preserved\n- Tests in `tests/web/api/artifacts-mockup.test.ts`\n\nRun `bun test` at the end to confirm nothing is broken. Run `bun run typecheck` and `bun run lint` as well."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-07T00:05:01.928Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-07T00:05:01.930Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
