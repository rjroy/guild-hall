---
title: Worker display title hardcoded to worker name in meeting artifact creation
date: 2026-03-08
status: open
reopened: 2026-04-18
tags: [bug-fix, meetings, worker-identity, artifact-creation]
modules: [meeting-toolbox, manager-toolbox, attribution-resolution]
related:
  - .lore/specs/workers/worker-identity-and-personality.md
  - .lore/_archive/issues/meeting-portrait-not-displayed.md
  - .lore/retros/meeting-cleanup-2026-03-10.md
---

# Worker Display Title Hardcoded to Worker Name in Meeting Artifact Creation

## Status

Originally filed 2026-03-08, marked resolved and archived without verification, re-opened 2026-04-18 after confirming the bug is still live in code. Also folds in a related ambiguity from the 2026-03-10 meeting cleanup retro: `initiate_meeting` accepts a free-form `workerName` argument and never normalizes display name vs. package identifier.

## What Happens

Two of three meeting artifact creation paths write the worker's identity name as `workerDisplayTitle` instead of the actual display title from the worker's package metadata. Display picks up exactly what was written, so the UI shows the worker name where the title belongs (e.g. "Octavia" instead of "Guild Chronicler").

## Verified Locations (2026-04-18)

**Bug 1 — `propose_followup`:** `daemon/services/meeting/toolbox.ts:135`
```ts
worker: ${deps.workerName}
workerDisplayTitle: "${deps.workerName}"
```

**Bug 2 — `initiate_meeting`:** `daemon/services/manager/toolbox.ts:406`
```ts
worker: ${args.workerName}
workerDisplayTitle: "${args.workerName}"
```

**Correct path (for reference) — `writeMeetingArtifact`:** `daemon/services/meeting/record.ts:147,167,172` receives `workerDisplayTitle` as a parameter and writes it correctly. Callers resolve it from worker metadata before invoking.

## Related Ambiguity: `initiate_meeting` Argument Normalization

The `initiate_meeting` MCP tool exposed by the manager toolbox accepts `workerName` as a free-form string (`daemon/services/manager/toolbox.ts:376-380`). There is no helper anywhere in the daemon (`normalizeWorkerName`, `resolveWorkerByDisplayTitle`, etc.) to translate a display name back to the package identifier.

Originally identified 2026-03-08 (audience-Guild-Master-20260308-085545): the Guild Master was passing display names ("Guild Chronicler") instead of package names ("Octavia"), and the meeting in turn would lose its connection to the worker's package metadata.

Two options were discussed in that session, no decision recorded:
1. **Behavioral discipline only.** Guild Master uses package names going forward. Brittle: any new manager-class worker has to re-learn the rule.
2. **Harden the toolbox.** Accept either form and normalize at the boundary by resolving against the worker package roster.

The hardcoded-displayTitle bug above is the user-visible symptom of this same gap — both bugs come from "worker identity is treated as a single string instead of a structured lookup." A real fix should consider both. If Option A from the displayTitle fix direction (display-time resolution from a roster lookup) is taken, the `initiate_meeting` normalization becomes a smaller concern: `worker` field is the lookup key regardless of which form was passed, as long as the roster knows both names. If Option B is taken, normalization should be added to the same code paths that look up `identity.displayTitle`.

Either way, the choice should be made once and applied to both bugs, not patched in isolation.

## Why The First Resolution Claim Was Wrong

The archived issue stated: "Same structural fix as portrait: resolve `workerDisplayTitle` at display time from worker identity metadata, using the `worker` field as the lookup key."

`web/lib/resolve-attribution.ts:38-39` does not do display-time resolution. It reads `extras.workerDisplayTitle` straight from the artifact's frontmatter:

```ts
if (typeof extras.workerDisplayTitle === "string" && extras.workerDisplayTitle.length > 0) {
  workerTitle = extras.workerDisplayTitle;
}
```

There is no fallback to `packages/<worker>/package.json` `identity.displayTitle`. Whatever the creation path wrote is what displays. So the "structural fix" was claimed but never landed.

## Fix Direction

Two viable approaches. Pick one, do not mix.

**Option A — Display-time resolution (matches the portrait fix pattern).** Update `web/lib/resolve-attribution.ts` to look up `displayTitle` from the package roster using `workerName` as the key, and treat `extras.workerDisplayTitle` as a fallback only. The roster is already passed in as `portraitMap`; a parallel `titleMap` (or a single `WorkerInfo` map carrying both portrait and title) would centralize identity resolution. Source of truth: `packages/<worker>/package.json` `identity.displayTitle` (already aggregated by `daemon/services/manager/worker.ts` via `packages/shared/worker-activation.ts:23` and `packages/shared/sub-agent-description.ts:10`).

**Option B — Fix at creation paths.** Update `propose_followup` (`daemon/services/meeting/toolbox.ts:135`) and `initiate_meeting` (`daemon/services/manager/toolbox.ts:406`) to look up the worker package and write `identity.displayTitle` instead of `workerName`. This duplicates the lookup logic that `writeMeetingArtifact` callers already perform, and any new creation path will need to repeat it. This is what the portrait fix tried first and rejected for that exact reason (see `_archive/issues/meeting-portrait-not-displayed.md` "Decision reversed (2026-03-08)").

Option A is the structural fix. Option B is the localized fix.

## Verification After Fix

- Trigger a `propose_followup` from a worker meeting; confirm the resulting artifact frontmatter shows the worker's display title (e.g. "Guild Chronicler"), or, if Option A is chosen, that the UI displays the correct title regardless of what's stored.
- Trigger `initiate_meeting` via Guild Master dispatch; same check.
- Existing `writeMeetingArtifact` path stays correct (already carries the title through callers).
- Add a unit test in `tests/web/artifact-attribution-resolution.test.ts` covering the case where `extras.workerDisplayTitle` equals `extras.worker` (i.e. legacy artifacts) — Option A should still resolve the correct title from the roster; Option B will leave legacy artifacts displaying the worker name.

## Notes for the Fix

- Do not re-archive this issue without grepping `daemon/services/meeting/toolbox.ts` and `daemon/services/manager/toolbox.ts` for `workerDisplayTitle:.*workerName` and confirming both lines are gone (Option B), or that `resolve-attribution.ts` no longer prefers `extras.workerDisplayTitle` over the roster lookup (Option A).
- The previously archived version of this issue is at `.lore/_archive/issues/worker-display-title-hardcoded-to-name.md` (do not delete; it documents why the first attempt missed).
