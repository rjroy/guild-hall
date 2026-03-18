---
title: "Commission: Artifact image display foundation (Steps 1-6, 16)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the foundation for image display in artifact views. Read the full plan at `.lore/plans/ui/artifact-image-display.md` and the spec at `.lore/specs/ui/artifact-image-display.md`.\n\nBuild in this order (per the plan's Build Order section):\n\n**Phase 1 (Steps 1-4):** Type foundation and scanner.\n- Step 1: Add `artifactType` to `Artifact` in `lib/types.ts`\n- Step 2: Add image constants (`IMAGE_EXTENSIONS`, `IMAGE_MIME_TYPES`) to `lib/artifacts.ts`\n- Step 3: Widen `collectMarkdownFiles` to `collectArtifactFiles`, update `scanArtifacts` to produce image artifacts with synthetic metadata\n- Step 4: Update `serializeArtifact` in `daemon/routes/artifacts.ts` to include `artifactType`\n\n**Phase 6 (Step 16):** Binary daemon client.\n- Add `daemonFetchBinary` to `lib/daemon-client.ts` for raw binary responses\n\n**Phase 2 (Steps 5-6):** Image serving.\n- Step 5: Add `GET /workspace/artifact/image/read` daemon endpoint with path validation, worktree resolution, Content-Type, Cache-Control headers\n- Step 6: Add `web/app/api/artifacts/image/route.ts` Next.js API proxy using `daemonFetchBinary`\n\nWrite unit tests for everything listed in the plan's Testing Strategy section for these steps. Run `bun test` after each phase. Run the full test suite at the end.\n\nKey patterns to follow:\n- Daemon routes use DI factory pattern (`createArtifactRoutes(deps)`)\n- Tests use Hono's `app.request()` with injected deps\n- Path validation via `validatePath()` from `lib/artifacts.ts`\n- No external dependencies for image handling"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T23:11:55.239Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T23:12:46.342Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
