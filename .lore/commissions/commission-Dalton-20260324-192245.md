---
title: "Commission: Fix: Normalize artifact relativePath for cross-platform correctness"
date: 2026-03-25
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Fix: Normalize artifact relativePath for cross-platform correctness\n\n### Context\n\nGuild Hall must run on both Linux and Windows. The `relativePath` field on `Artifact` is a **logical path** within `.lore/`, not a filesystem path. It's used for grouping, display labels, URL routing, and segment extraction. All consumers correctly split on `/` because that's the convention for logical paths (same as URLs, git refs).\n\nOn Linux, `path.relative()` returns `/`-separated paths, so everything works by coincidence. On Windows, `path.relative()` returns `\\`-separated paths, which breaks every consumer.\n\n**The goal is not \"fix Windows.\" The goal is \"make the convention explicit and enforce it at the source so both platforms work by design, not by accident.\"**\n\n### What to fix\n\n`lib/artifacts.ts` lines 127 and 168 assign `relativePath` using raw `path.relative()` output. This leaks OS path semantics into a logical path.\n\n1. Create a `toPosixPath()` utility (or similar) that normalizes OS paths to POSIX-style `/` separators. Place it where it makes sense (e.g., in `lib/artifacts.ts` as a local helper, or in a shared location if you find multiple call sites need it).\n\n2. Apply it to both `relativePath` assignments in `lib/artifacts.ts` (lines 127 and 168).\n\n3. **Add a comment** on the `relativePath` field in the `Artifact` type (in `lib/types.ts`) explaining the convention: this is a POSIX-style logical path, always uses `/`, regardless of OS. Consumers can rely on `/` splitting.\n\n4. **Add comments** at the normalization call sites in `lib/artifacts.ts` explaining why normalization happens here (OS path boundary crossing into logical path).\n\n5. Grep for other places where `path.relative()` or `path.join()` produce paths that are later split on `/` or used in URL construction. Fix any other instances. Check `daemon/` code paths, particularly artifact routes and workspace services.\n\n### What NOT to fix\n\nThe consumers (`artifact-smart-view.ts`, `artifact-grouping.ts`) splitting on `/` are correct. That's the contract. Don't change them.\n\n### Verification\n\n- Existing tests must continue to pass on Linux (CI) and Windows (local)\n- Add test coverage: an artifact whose raw OS path contains backslashes should still be categorized correctly by smart view and grouping functions\n- Run typecheck and lint"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-25T02:22:45.456Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T02:22:45.461Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
