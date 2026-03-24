---
title: "Brainstorm: Artifact Provenance Worker Attribution"
date: 2026-03-23
status: active
author: Octavia
tags: [ui, artifacts, provenance, workers, attribution]
related:
  - web/components/artifact/ArtifactProvenance.tsx
  - web/components/ui/WorkerPortrait.tsx
  - web/app/projects/[name]/artifacts/[...path]/page.tsx
---

# Brainstorm: Artifact Provenance Worker Attribution

The `ArtifactProvenance` component renders a `WorkerPortrait` with no props and "Source information unavailable." text. This was explicitly stubbed for Phase 1. Here's what I found when I went to read the actual data.

---

## What the data actually looks like

Before reasoning about approach, I read the real frontmatter across artifact types. The picture is clearer than the prompt description suggests.

**Commission artifacts** (all of them, consistently):
```yaml
worker: Dalton
workerDisplayTitle: "Guild Artificer"
```

**Meeting artifacts** (all of them, consistently):
```yaml
worker: Guild Master
workerDisplayTitle: "Guild Master"
```

**Brainstorm artifacts written by workers** (some, not all):
```yaml
author: Celeste
```
No `workerDisplayTitle`. The `author` field is added manually by the worker, not by a service.

**Plans, specs, designs, retros**: neither field. These are human-written and have no machine attribution.

One thing worth noting: the archive has older artifacts using `worker: guild-hall-writer` (package name) instead of the display name. Those are a minority and could be treated as unresolvable.

The `worker` and `workerDisplayTitle` fields live in `ArtifactMeta.extras` since `ArtifactMeta` only types the common fields. The artifact page reads `artifact.meta.extras` already; accessing these costs nothing.

---

## The portrait gap

Commission artifacts have the name and title but not the portrait URL. That lives in the worker package metadata. The worker route at `/system/packages/worker/list` returns:

```json
{
  "name": "guild-hall-writer",
  "displayName": "Octavia",
  "displayTitle": "Guild Chronicler",
  "portraitUrl": "/images/portraits/octavia-chronicler.webp",
  ...
}
```

So the lookup is: `extras.worker` (display name) → find worker in roster where `displayName` matches → extract `portraitUrl`.

The artifact page is already a server component that makes three daemon fetches. Adding a fourth to `/system/packages/worker/list` is cheap and consistent with the page's existing pattern.

**The Guild Master edge case**: Guild Master is a built-in coordinator, not a discovered package. It won't appear in the worker list. But `/images/portraits/guild-master.webp` exists. The lookup would need a fallback for this case: if the name is "Guild Master" and no package entry matches, hardcode the portrait path. This is the only special case; all other workers are packages.

---

## Question 1: Can we use worker/author fields for attribution?

Yes, and the commission/meeting case is the strongest. `worker` + `workerDisplayTitle` in extras are written by the commission and meeting services at artifact creation time. They're reliable, structured, and present in every commission and meeting artifact. They were put there precisely for this purpose.

The `author` field is less reliable. It's written by workers themselves when they feel like it — brainstorm files show it, spec and plan files don't. Treat it as a weaker signal: fall back to it if `worker` is absent, but don't expect it everywhere.

The name-to-portrait lookup via `/system/packages/worker/list` works for all installed packages. The roster is small and stable per daemon session, so fetching it once per page render is fine.

---

## Question 2: Should we attribute to workers or to commissions?

The current stub says "Source information unavailable." That's accurate but not useful. The question is what's useful.

**Option A: Worker attribution** — "Written by Dalton" with Dalton's portrait. Focuses on who did the work. Makes sense for commission artifacts where the worker is the author. Works equally well for meeting notes where you met with a specific worker.

**Option B: Commission attribution** — "Created during commission: Fix dashboard hydration" with a link to the commission. Focuses on the context that produced the artifact. More navigable — clicking lets you see the full commission, its prompt, its timeline.

**Option C: Both** — Worker portrait next to "Created during commission [link]". Portrait gives the human face; the commission link gives the context.

Option C is the richest, but it requires resolving which commission the artifact came from. The artifact page already does this: it fetches `commissionsResult` and filters to `associatedCommissions`. So the data is there if we pass it to `ArtifactProvenance`.

My instinct: Option C for commission artifacts, Option A for meeting artifacts (there's no "meeting" link to show from the artifact page, and the worker attribution is meaningful enough). For brainstorm and other docs that have `author`, Option A. For unattributed artifacts, consider "Created by hand" or just hide the portrait row entirely rather than showing "Source information unavailable."

---

## Question 3: What about artifacts with no attribution data?

"Source information unavailable." is accurate but feels like a broken state. Three alternatives:

1. **Hide the row** — if no attribution, don't show the portrait row at all. The component has expanded/condensed states; the source row could simply be conditional. Clean, honest.

2. **Show a generic** — "Guild Hall artifact" with some placeholder icon. Not much better than the current stub.

3. **Show last modified** — fall back to a "Last modified by git" approach. The artifact page has `lastModified`. Not quite attribution, but at least it's real data.

Option 1 (hide the row) is the cleanest. If there's nothing useful to say about provenance, say nothing. The breadcrumb row above still gives navigation context.

---

## Question 4: Frontend concern or does it need daemon support?

Mostly frontend. The building blocks are already there:

- `extras.worker` and `extras.workerDisplayTitle` are already in the artifact response
- `/system/packages/worker/list` already exists and returns `portraitUrl`
- The artifact page is a server component that can fetch both
- `associatedCommissions` is already fetched for the sidebar

The only daemon-side gap is the Guild Master special case. That could be handled by either:
- Adding Guild Master to the worker list response (it's already a "worker" conceptually, just built-in)
- Hardcoding the portrait path fallback on the frontend for this one case

The built-in option is cleaner in the long run, but the hardcode is fine for now given Guild Master is genuinely special (it's not a package, it's part of the daemon).

No new daemon endpoint is needed.

---

## Question 5: Could the artifact page use GET /workers?

Yes — and this is the right call. The artifact page already lives at `web/app/projects/[name]/artifacts/[...path]/page.tsx` as a server component. It can fetch `/system/packages/worker/list` alongside its other fetches, build a name-keyed lookup object (`{ Dalton: { portraitUrl: ..., displayTitle: ... }, Octavia: {...}, ... }`), and pass the resolved worker metadata into `ArtifactProvenance` as props.

No client-side fetching needed. No API route changes needed. The worker roster is small enough (10 packages) that fetching it per page render adds negligible overhead.

---

## Recommended approach

This is what I'd spec, in order of dependency:

**1. Pass attribution data as props to ArtifactProvenance**

The artifact page resolves attribution before rendering. ArtifactProvenance gains optional props:

```tsx
interface ArtifactProvenanceProps {
  projectName: string;
  artifactTitle: string;
  artifactPath: string;
  attribution?: {
    workerName: string;
    workerTitle?: string;
    workerPortraitUrl?: string;
    commissionId?: string;     // for linking to commission detail
    commissionTitle?: string;  // for display text
  };
}
```

**2. The artifact page resolves attribution from three sources**

In priority order:
1. `extras.worker` + `extras.workerDisplayTitle` → structured attribution (commission/meeting artifacts)
2. `extras.author` → name-only attribution (brainstorms authored by workers)
3. Neither → `attribution` prop omitted

Portrait URL is resolved from the worker list, keyed by display name. Guild Master gets the hardcoded fallback.

**3. ArtifactProvenance renders conditionally**

- If `attribution` present: show `WorkerPortrait` with resolved props, show appropriate text
- If `attribution` absent: hide the source row entirely

**4. Text framing**

For commission artifacts where `associatedCommissions` has entries: "Written by [Name] during commission [link]"
For meeting/brainstorm artifacts: "Written by [Name]"
For commission artifacts where commission can't be resolved: "Written by [Name]"

The portrait is the visual anchor; the text is context.

---

## What this doesn't resolve

**Old-format artifacts** (`worker: guild-hall-writer`) in the archive: the display name lookup would fail since "guild-hall-writer" doesn't match any `displayName`. These would fall back gracefully to no attribution if the lookup is implemented as a map lookup with a missing-key fallback.

**Human-created artifacts**: specs, plans, retros, and other artifacts written directly by the user will remain unattributed unless the user adds an `author` field manually. That's fine. The system doesn't know who the user is, and guessing would be wrong.

**Portrait availability**: if a worker package lacks a `portraitPath`, the lookup returns null and `WorkerPortrait` falls back to initials. That's already the WorkerPortrait design. No special handling needed.
