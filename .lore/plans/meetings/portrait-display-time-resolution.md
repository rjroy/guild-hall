---
title: Portrait display-time resolution
date: 2026-03-08
status: executed
tags: [worker-identity, meetings, portrait, structural-fix]
modules: [meeting-record, meeting-toolbox, manager-toolbox, meeting-page, dashboard, toolbox-resolver, sdk-runner]
related:
  - .lore/specs/workers/worker-identity-and-personality.md
  - .lore/issues/meeting-portrait-not-displayed.md
  - .lore/issues/worker-display-title-hardcoded-to-name.md
---

# Plan: Portrait Display-Time Resolution

## Spec Reference

**Spec**: `.lore/specs/workers/worker-identity-and-personality.md`

Requirements addressed:
- REQ-WID-10: Identity block in `package.json` carries name, description, displayTitle, portraitPath. Single source of truth. -> Steps 1-6 (remove redundant storage), Steps 7-9 (resolve from source)
- REQ-VIEW-3: Worker identity rendered consistently (portrait frame, name, title) -> Steps 7-9 (portrait now resolved uniformly)
- REQ-VIEW-28: Worker portrait displayed prominently in Meeting view -> Step 8
- REQ-VIEW-12 zone 5: Pending audiences show worker portrait -> Step 9

## Codebase Context

**Current state**: Three code paths create meeting artifacts, each with its own template. Two include `workerPortraitUrl` in frontmatter, one (the manager toolbox) does not. The spec was updated to require display-time portrait resolution instead.

**Portrait data flow today**:
- `daemon/lib/agent-sdk/sdk-runner.ts:238`: Extracts `portraitPath` from worker metadata
- `daemon/services/toolbox-resolver.ts:39,78`: Threads `workerPortraitUrl` through `ToolboxResolverContext` into `GuildHallToolboxDeps`
- `daemon/services/meeting/record.ts:113,129-131`: `writeMeetingArtifact()` writes `workerPortraitUrl` to frontmatter
- `daemon/services/meeting/toolbox.ts:36,128-130`: `MeetingToolboxDeps` carries portrait for `propose_followup`
- `daemon/services/meeting/orchestrator.ts:836,904,1512`: Three callers pass `portraitPath` to `writeMeetingArtifact()`
- `web/app/projects/[name]/meetings/[id]/page.tsx:106-109`: Reads `workerPortraitUrl` from artifact frontmatter

**Portrait resolution approach**: Next.js server components can call `discoverPackages()` from `lib/packages.ts` directly (filesystem reads, no daemon dependency). The packages directory is `path.join(getGuildHallHome(), "packages")`. A new helper builds a worker name to portrait map. Server components resolve portrait before passing to client components as props.

**Dashboard data flow**: `web/app/page.tsx` (server component) calls `scanMeetingRequests()` which returns `MeetingMeta[]`. Each `MeetingMeta` has a `worker` field (identity name). `PendingAudiences` (server component) maps to `MeetingRequestCard` (client component). Portrait needs to flow from the server component as a prop.

## Implementation Steps

### Step 1: Add `resolveWorkerPortraits()` helper

**Files**: `lib/packages.ts`
**Addresses**: REQ-WID-10
**Expertise**: none

Add a function that returns a `Map<string, string>` mapping worker identity name to portrait URL. It calls `discoverPackages()` with the installed packages path, filters to workers, and extracts `identity.portraitPath`. This is the single resolution function used by all display-time consumers.

```
resolveWorkerPortraits(ghHome?: string): Promise<Map<string, string>>
```

Uses `getGuildHallHome()` from `lib/paths.ts` to find `<ghHome>/packages/`. Falls back to empty map if the directory doesn't exist (graceful degradation when no workers are installed).

### Step 2: Remove `workerPortraitUrl` from artifact creation

**Files**: `daemon/services/meeting/record.ts`, `daemon/services/meeting/orchestrator.ts`
**Addresses**: REQ-WID-10

In `record.ts`:
- Remove `workerPortraitUrl` parameter from `writeMeetingArtifact()` (line 113)
- Remove `portraitLine` construction (lines 127-131)
- Remove `${portraitLine}` from the template (line 141)

In `orchestrator.ts`:
- Remove `workerMeta.identity.portraitPath` argument at line 836 (`createMeeting` caller)
- Remove `wMeta.identity.portraitPath` argument at line 904 (accept flow caller)
- Remove `workerMeta.identity.portraitPath` argument at line 1512 (`createMeetingRequest` caller)

### Step 3: Remove `workerPortraitUrl` from meeting toolbox

**Files**: `daemon/services/meeting/toolbox.ts`
**Addresses**: REQ-WID-10

- Remove `workerPortraitUrl` from `MeetingToolboxDeps` interface (line 36)
- Remove portrait line construction from `makeProposeFollowupHandler` (lines 127-130)
- Remove `${portraitLine}` from the follow-up template (line 140)

### Step 4: Remove `workerPortraitUrl` from toolbox resolver and SDK runner

**Files**: `daemon/services/toolbox-resolver.ts`, `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-WID-10

In `toolbox-resolver.ts`:
- Remove `workerPortraitUrl` from `ToolboxResolverContext` interface
- Remove it from the `deps` object construction passed to toolbox factories

In `sdk-runner.ts`:
- Remove `workerPortraitUrl` from the context object passed to `resolveToolSet()` (around line 238)

### Step 5: Update meeting page to resolve portrait at display time

**Files**: `web/app/projects/[name]/meetings/[id]/page.tsx`
**Addresses**: REQ-VIEW-28
**Expertise**: none

Replace the frontmatter read (lines 106-109) with a call to `resolveWorkerPortraits()`. Look up the `workerName` (already extracted from frontmatter at line 98) in the returned map. If the worker isn't found (package uninstalled, name mismatch), the result is `undefined`, and `WorkerPortrait` already falls back to initials. No additional fallback handling needed.

The server component already reads the artifact and extracts `workerName`. Adding the portrait lookup is a single additional async call. The existing prop threading (`workerPortraitUrl` through `MeetingHeader`, `MeetingView`, `ChatInterface`, `MessageBubble`, `StreamingMessage`) stays unchanged; only the source of the value changes.

### Step 6: Update dashboard to show portrait on meeting requests

**Files**: `web/app/page.tsx`, `web/components/dashboard/PendingAudiences.tsx`, `web/components/dashboard/MeetingRequestCard.tsx`
**Addresses**: REQ-VIEW-12 zone 5, REQ-VIEW-3

Do NOT add `portraitUrl` to `MeetingMeta`. That type represents artifact data, and the portrait is no longer stored in artifacts. Instead, pre-resolve portrait URLs in the server component and pass them as a separate prop.

In `web/app/page.tsx` (server component):
- Call `resolveWorkerPortraits()` once to get the `Map<string, string>`
- Convert to a plain `Record<string, string>` for prop passing (Maps don't serialize across the server/client boundary)
- Pass `workerPortraits` to `PendingAudiences`

In `PendingAudiences.tsx` (server component):
- Accept `workerPortraits: Record<string, string>` prop
- For each request, look up `workerPortraits[request.worker]` and pass the result as `portraitUrl` to `MeetingRequestCard`

In `MeetingRequestCard.tsx` (client component):
- Accept `portraitUrl?: string` prop
- Render `WorkerPortrait` component in the header section alongside the worker name/title
- Import `WorkerPortrait` from `@/web/components/ui/WorkerPortrait`
- If `portraitUrl` is undefined (worker not found), `WorkerPortrait` falls back to initials

This addresses REQ-VIEW-12 zone 5 which specifies "worker portrait, name, reason, and action buttons" for pending audiences, but the card currently shows no portrait.

### Step 7: Update tests

**Files**: `tests/daemon/services/meeting/record.test.ts`, `tests/daemon/services/meeting/toolbox.test.ts`, other test files referencing `workerPortraitUrl`
**Addresses**: validation

- Remove `workerPortraitUrl` assertions from meeting artifact creation tests
- Remove portrait parameter from `writeMeetingArtifact()` test calls
- Remove portrait from `MeetingToolboxDeps` in test setup
- Add test for `resolveWorkerPortraits()`: given a temp directory with worker packages, returns correct name-to-portrait mapping
- Add test for graceful degradation: missing packages directory returns empty map
- Add test for meeting page resolution: verify portrait URL comes from worker packages, not artifact frontmatter

### Step 8: Validate against spec

Launch a sub-agent that reads `.lore/specs/workers/worker-identity-and-personality.md` (specifically the identity flow section), `.lore/specs/ui/guild-hall-views.md` (REQ-VIEW-3, REQ-VIEW-28, REQ-VIEW-12), and reviews the implementation. Verify:
- No artifact creation path writes `workerPortraitUrl`
- Meeting page resolves portrait from worker packages
- Dashboard meeting requests show portrait
- `WorkerPortrait` component renders correctly with resolved URL
- Graceful degradation when worker not found (falls back to initials)

## Delegation Guide

No specialized expertise needed. All steps are straightforward data plumbing. Code review by fresh-context sub-agent at Step 8 is the primary quality gate.

## Open Questions

1. **Existing artifacts with `workerPortraitUrl`**: Older meeting artifacts still have `workerPortraitUrl` in their frontmatter from the previous fix. This is harmless (the field is simply ignored at display time), but `/tend` will flag it as an unknown field now that it's removed from `lore-config.md`. Accept the noise or add a migration step to strip the field from existing artifacts.
