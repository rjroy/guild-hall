---
title: Artifact Request Meeting
date: 2026-03-14
status: executed
tags: [ui, meetings, artifact, sidebar]
modules: [artifact-view, meeting-creation]
related:
  - .lore/specs/ui/artifact-request-meeting.md
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/ui/guild-hall-views.md
---

# Plan: Artifact Request Meeting

## Goal

Add a "Request Meeting" link to the artifact sidebar alongside the existing "Create Commission from Artifact" link. Both links move into a dedicated **Actions** section below "Associated Commissions." Clicking "Request Meeting" navigates to the project page's meetings tab with a pre-opened form. Submitting the form calls `POST /api/meetings` (the existing SSE route), reads the `session` event, and navigates to the live meeting view.

## Codebase Context

**`MetadataSidebar.tsx`** (`web/components/artifact/MetadataSidebar.tsx`):
The "Create Commission from Artifact" link at lines 141-148 currently lives inside the Associated Commissions section div. It needs to move to a new Actions section rendered below Associated Commissions. `createCommissionHref()` at lines 40-47 is the template for `requestMeetingHref()` — same encoding pattern, different query params. The `.createCommissionLink` CSS class in `MetadataSidebar.module.css:93-113` defines the brass button appearance; rename it to `.actionLink` and apply it to both links.

**`web/app/projects/[name]/page.tsx`**:
`searchParams` is typed at line 19 as `{ tab?: string; newCommission?: string; dep?: string }`. The meetings tab at lines 78-80 renders only `<MeetingList>` with no creation affordance. The commissions tab at lines 59-67 shows the target pattern: an actions wrapper div containing `CreateCommissionButton`, then the list. The meetings tab needs the same structure.

**`POST /api/meetings` route** (`web/app/api/meetings/route.ts`):
Already exists. Accepts `{ projectName, workerName, prompt }`, proxies to the daemon's `POST /meeting/request/meeting/create`, and returns SSE. The first event emitted is `{ type: "session", meetingId: string, sessionId: string, worker: string }` — verified at `daemon/services/meeting/orchestrator.ts:550-556`. Navigate on this event; no need to wait for `turn_end`.

**Live meeting route**: `/projects/[name]/meetings/[id]/page.tsx` is the target after creation. URL shape: `/projects/${encodeURIComponent(projectName)}/meetings/${meetingId}`.

**`CreateCommissionButton.tsx`** (`web/components/commission/CreateCommissionButton.tsx`):
The toggle pattern: `useState(defaultOpen)` controls whether the button or the form is shown. On success, calls `router.refresh()`. For meetings, the success path is navigation to the meeting view instead of a refresh.

**`CommissionForm.tsx`** (`web/components/commission/CommissionForm.tsx`):
The meeting form is simpler: no title field, no dependencies field, no type toggle, no resource overrides, no worker fetch (user types the worker name). `CreateMeetingButton.tsx` is self-contained — the form is inlined, no separate Form component needed.

**Existing tests** (`tests/components/metadata-sidebar.test.ts`):
Line 294-310 finds links by `newCommission=true` in the href. This test survives the move of the commission link to Actions (it searches by href content, not section). New tests cover `requestMeetingHref` output and the Actions section visibility guard.

Client component constraint (`tests/components/commission-form.test.tsx` comment): `useState`, `useRouter`, `useEffect`, and `fetch` make client components un-callable outside a React render context in bun test. `CreateMeetingButton` is a client component; tests verify type contracts and module exports only.

## Implementation Steps

### Step 1: Refactor `MetadataSidebar`

**Modified files:**
- `web/components/artifact/MetadataSidebar.tsx`
- `web/components/artifact/MetadataSidebar.module.css`

#### 1a. Add `requestMeetingHref`

Add alongside `createCommissionHref`. Same encoding pattern, different route:

```ts
export function requestMeetingHref(
  projectName: string,
  artifactPath: string,
): string {
  const encodedName = encodeURIComponent(projectName);
  const encodedPath = encodeURIComponent(artifactPath);
  return `/projects/${encodedName}?tab=meetings&newMeeting=true&artifact=${encodedPath}`;
}
```

#### 1b. Move commission link into a new Actions section

Remove the `{artifactPath && (...)}` block from inside the Associated Commissions section div (lines 141-148). Replace it with a new Actions section after the Associated Commissions section:

```tsx
{artifactPath && (
  <div className={styles.section}>
    <h3 className={styles.sectionTitle}>Actions</h3>
    <div className={styles.actionLinks}>
      <Link
        href={createCommissionHref(projectName, artifactPath)}
        className={styles.actionLink}
      >
        Create Commission from Artifact
      </Link>
      <Link
        href={requestMeetingHref(projectName, artifactPath)}
        className={styles.actionLink}
      >
        Request Meeting
      </Link>
    </div>
  </div>
)}
```

The `{artifactPath && (...)}` guard wraps the entire Actions section, satisfying REQ-ARM-4.

#### 1c. Update CSS

Rename `.createCommissionLink` to `.actionLink` in `MetadataSidebar.module.css`. Add a `.actionLinks` container for vertical stacking:

```css
.actionLinks {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.actionLink {
  /* rename from .createCommissionLink — same styles */
  display: block;
  padding: var(--space-xs) var(--space-sm);
  background-color: rgba(168, 152, 120, 0.15);
  border: 1px solid var(--color-brass);
  color: var(--color-brass);
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 4px;
  text-align: center;
  text-decoration: none;
  width: 100%;
  transition: background-color 0.2s, color 0.2s;
}

.actionLink:hover {
  background-color: rgba(168, 152, 120, 0.25);
  color: var(--color-amber);
}
```

Delete `.createCommissionLink` and `.createCommissionLink:hover`. The class is only used in `MetadataSidebar.tsx`; no other file references it.

### Step 2: Create `CreateMeetingButton`

**New files:**
- `web/components/meeting/CreateMeetingButton.tsx`
- `web/components/meeting/CreateMeetingButton.module.css`

#### 2a. Component

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./CreateMeetingButton.module.css";

interface CreateMeetingButtonProps {
  projectName: string;
  /** When true, the form is expanded on mount (e.g. from a query param link). */
  defaultOpen?: boolean;
  /** Pre-populates the prompt with artifact context and shows artifact path display. */
  initialArtifact?: string;
}

export default function CreateMeetingButton({
  projectName,
  defaultOpen = false,
  initialArtifact,
}: CreateMeetingButtonProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(defaultOpen);
  const [workerName, setWorkerName] = useState("");
  const [prompt, setPrompt] = useState(
    initialArtifact ? `Discussing artifact: .lore/${initialArtifact}\n\n` : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = workerName.trim().length > 0 && prompt.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName, workerName: workerName.trim(), prompt: prompt.trim() }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        setError(typeof data.error === "string" ? data.error : `Request failed (${response.status})`);
        setSubmitting(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const event = JSON.parse(json) as { type: string; meetingId?: string; reason?: string };
            if (event.type === "session" && event.meetingId) {
              router.push(
                `/projects/${encodeURIComponent(projectName)}/meetings/${encodeURIComponent(event.meetingId)}`,
              );
              return;
            }
            if (event.type === "error") {
              setError(event.reason ?? "Meeting creation failed");
              setSubmitting(false);
              return;
            }
          } catch {
            // ignore malformed SSE data lines
          }
        }
      }

      setError("Meeting created but no session ID received");
      setSubmitting(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setSubmitting(false);
    }
  }, [canSubmit, projectName, workerName, prompt, router]);

  if (!showForm) {
    return (
      <button
        type="button"
        className={styles.createButton}
        onClick={() => setShowForm(true)}
      >
        Request Meeting
      </button>
    );
  }

  return (
    <div className={styles.form} role="form" aria-label="Request Meeting">
      {initialArtifact && (
        <div className={styles.fieldGroup}>
          <span className={styles.label}>Artifact</span>
          <p className={styles.artifactContext}>.lore/{initialArtifact}</p>
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="meeting-worker">
          Worker
        </label>
        <input
          id="meeting-worker"
          className={styles.textInput}
          type="text"
          value={workerName}
          onChange={(e) => setWorkerName(e.target.value)}
          placeholder="e.g. octavia"
          disabled={submitting}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.label} htmlFor="meeting-prompt">
          Prompt
        </label>
        <textarea
          id="meeting-prompt"
          className={styles.textarea}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What do you want to discuss?"
          disabled={submitting}
        />
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.cancelButton}
          onClick={() => setShowForm(false)}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.submitButton}
          disabled={!canSubmit}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Starting..." : "Start Meeting"}
        </button>
      </div>
    </div>
  );
}
```

#### 2b. CSS

Mirror the shape of `CommissionForm.module.css`. Reuse the same brass-tone variables. Key classes: `.createButton` (same as `CreateCommissionButton.module.css`), `.form`, `.fieldGroup`, `.label`, `.textInput`, `.textarea`, `.artifactContext`, `.errorMessage`, `.buttonRow`, `.cancelButton`, `.submitButton`.

The `.artifactContext` is a read-only display: monospace, muted color, small font — it shows the path from `initialArtifact` and signals to the user why the prompt is pre-filled.

### Step 3: Update the project page

**Modified file:** `web/app/projects/[name]/page.tsx`

#### 3a. Extend `searchParams` type

Add `newMeeting` and `artifact` to the type annotation at line 19 and the destructure at line 22:

```ts
searchParams: Promise<{ tab?: string; newCommission?: string; dep?: string; newMeeting?: string; artifact?: string }>;
```

```ts
const { tab = "artifacts", newCommission, dep, newMeeting, artifact } = await searchParams;
```

#### 3b. Add import

```ts
import CreateMeetingButton from "@/web/components/meeting/CreateMeetingButton";
```

#### 3c. Update the meetings tab

Replace the bare `MeetingList` at lines 78-80 with a structure mirroring the commissions tab:

```tsx
{tab === "meetings" && (
  <div className={styles.meetingTab}>
    <div className={styles.meetingActions}>
      <CreateMeetingButton
        projectName={projectName}
        defaultOpen={newMeeting === "true"}
        initialArtifact={artifact}
      />
    </div>
    <MeetingList meetings={meetingArtifacts} projectName={projectName} />
  </div>
)}
```

#### 3d. Add CSS classes

Add `.meetingTab` and `.meetingActions` to `web/app/projects/[name]/page.module.css`, mirroring `.commissionTab` and `.commissionActions`. Check the existing class shapes before writing — use the same layout approach.

### Step 4: Tests

**Modified file:** `tests/components/metadata-sidebar.test.ts`

Add to the existing `describe("MetadataSidebar associated commissions", ...)` block:

1. **`requestMeetingHref` tests** (new `describe` block alongside `createCommissionHref`):
   - Builds the correct href with `tab=meetings&newMeeting=true&artifact=<encoded>`
   - Encodes project name with special characters
   - Encodes artifact path (slashes become `%2F`)

2. **Actions section rendering**:
   - When `artifactPath` is provided, a link with `newMeeting=true` appears in the tree
   - When `artifactPath` is provided, both `newCommission=true` and `newMeeting=true` links appear (they are peers)
   - When `artifactPath` is absent, neither link appears

3. **Commission link is no longer inside Associated Commissions**:
   - This is already covered implicitly — the existing test at line 294 still passes because it searches by href, not by section. No structural assertion needs updating unless you want to explicitly verify the section separation. That's optional for this plan.

**New file:** `tests/components/create-meeting-button.test.ts`

`CreateMeetingButton` is a client component with hooks; it cannot be called outside a React render context in bun test. The test file verifies:

1. The module exports a default export that is a function (type contract check via `typeof`).
2. The module exports from the expected path without import errors.

This is the same scope as the `CommissionForm`/`CreateCommissionButton` coverage noted in `tests/components/commission-form.test.tsx:6-16`. Do not attempt to render the component or test the SSE parsing here.

## Validation

1. **TypeScript**: `bun run typecheck` must pass. All new props (`initialArtifact`, `newMeeting`, `artifact`) flow through without `any`. The `event` variable parsed from SSE JSON is typed explicitly; no implicit `unknown` access.

2. **Tests**: `bun test` must pass. Specifically:
   - `tests/components/metadata-sidebar.test.ts` — all existing tests still pass; new `requestMeetingHref` and Actions section tests pass
   - `tests/components/create-meeting-button.test.ts` — module export test passes

3. **Build**: `bun run build` must pass. The CSS rename (`.createCommissionLink` → `.actionLink`) must not leave a dangling reference in `MetadataSidebar.tsx`.

4. **Manual smoke — sidebar to meeting**:
   - Navigate to any artifact that has an `artifactPath` prop rendered (any artifact detail page)
   - Confirm the "Actions" section appears below "Associated Commissions" with both links
   - Confirm clicking "Request Meeting" navigates to `?tab=meetings&newMeeting=true&artifact=<path>`
   - Confirm the meetings tab shows `CreateMeetingButton` expanded with the artifact path in the Artifact display and the prompt pre-filled
   - Type a valid worker name, adjust prompt if desired, submit
   - Confirm navigation to `/projects/<name>/meetings/<id>` on success
   - Confirm error display if an invalid worker name is submitted

5. **Manual smoke — no artifact path**:
   - Navigate to an artifact page where the parent page passes no `artifactPath` prop
   - Confirm the Actions section does not appear

6. **Manual smoke — direct meetings tab**:
   - Navigate to `/projects/<name>?tab=meetings` (no query params)
   - Confirm `CreateMeetingButton` is shown collapsed (shows "Request Meeting" button)
   - Click it, fill in worker and prompt, submit
   - Confirm navigation to the live meeting view

## Constraints and Decisions

**`MetadataSidebar` stays a server component.** Both action links are plain `<Link>` elements — no client state needed. `CreateMeetingButton` is imported and rendered by the server-rendered project page, which passes the pre-opened state as a prop. The boundary is correct.

**Self-contained form in `CreateMeetingButton`.** The meeting form is simple enough (two fields, one SSE call) that a separate `MeetingForm` component would be premature abstraction. `CommissionForm` is a separate file because it manages significant complexity (worker fetch, model fetch, scheduled type, resource overrides). The meeting form doesn't need that.

**Navigate on `session` event, not `turn_end`.** The `session` event is the first event from the SSE stream and carries `meetingId`. It is emitted before the SDK begins any work. Waiting for `turn_end` would block navigation until the worker sends its first full response — that's the wrong UX. Navigate immediately to the live view where streaming output is visible.

**Worker name is a text input.** REQ-ARM-13 specifies that worker selection is the user's responsibility. Adding a worker fetch and dropdown would couple this form to the workers API and introduce loading state for a field the spec explicitly doesn't require. The daemon returns an error for invalid worker names (REQ-ARM-14); the form displays it.

**CSS rename scope is contained.** `.createCommissionLink` appears only in `MetadataSidebar.tsx` and `MetadataSidebar.module.css`. Renaming to `.actionLink` does not affect any other component, test, or import.

**`artifact` param carries `.lore/`-relative path.** The `dep` param for commissions uses the same format (e.g., `specs/infrastructure/my-spec.md`). `requestMeetingHref` passes `artifactPath` directly as `artifact=<encoded>`, and `CreateMeetingButton` receives it as `initialArtifact` — no transformation at the boundary. The pre-filled prompt prepends `.lore/` to produce the full path the worker needs.

## Delegation Guide

| Step | Files | What to verify |
|------|-------|---------------|
| Step 1 | `MetadataSidebar.tsx`, `MetadataSidebar.module.css` | Commission link removed from Associated Commissions; Actions section renders only when `artifactPath` present; CSS has no dangling references |
| Step 2 | `CreateMeetingButton.tsx`, `CreateMeetingButton.module.css` | SSE parse loop handles `session`, `error`, and stream-end correctly; prompt initializes from `initialArtifact`; cancel collapses form without navigation |
| Step 3 | `web/app/projects/[name]/page.tsx`, `page.module.css` | `searchParams` type extended; `CreateMeetingButton` rendered with correct props on meetings tab only; meetings tab layout mirrors commissions tab |
| Step 4 | `tests/components/metadata-sidebar.test.ts`, `tests/components/create-meeting-button.test.ts` | `requestMeetingHref` tests cover encoding; Actions section guard tested; `CreateMeetingButton` module export verified |

After Step 2, use a sub-agent with fresh context to verify the SSE parse loop specifically: confirm it handles partial chunks correctly (buffer accumulation), handles a `done` stream without a `session` event (the fallback error path), and doesn't leak if `router.push` is called and the component unmounts mid-read.
