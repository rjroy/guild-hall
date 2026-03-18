---
title: "Commit .lore Changes from the Web UI"
date: 2026-03-14
status: executed
tags: [ui, artifacts, git, web, daemon]
modules: [daemon/lib/git, daemon/routes/git-lore, daemon/app, "web/app/projects/[name]/page", web/components/project/CommitLoreButton]
related:
  - .lore/specs/ui/commit-lore-from-web.md
  - .lore/brainstorm/commit-lore-from-web.md
  - .lore/design/daemon-rest-api.md
---

# Plan: Commit .lore Changes from the Web UI

## Goal

Add a "Commit .lore" button to the Artifacts tab action bar. The button expands an inline form that collects a commit message and stages all pending `.lore/` changes in the integration worktree via a new daemon route.

## Codebase Context

**Git abstraction boundary.** `runGit` in `daemon/lib/git.ts` is a private function. Route handlers cannot call it directly. All git operations go through the `GitOps` interface. The spec says "calls `runGit` directly (like the admin routes)" — what it means is: don't use the existing `commitAll` convenience method (it stages everything with `git add -A`). Instead, add targeted methods to `GitOps` that do the right thing for `.lore/`.

**`GitOps` interface** is at `daemon/lib/git.ts:105`. `createGitOps()` is the production implementation at line 203. Any new interface methods need implementations in both places and stubs in every existing test fixture that constructs a `GitOps` mock (`tests/daemon/routes/artifacts.test.ts:35-69`, `tests/daemon/routes/admin.test.ts:14-48`, and any others that build a full mock).

**Route wiring pattern.** `daemon/app.ts:33-50` defines `AppDeps`. Optional fields like `admin?: AdminDeps` and `artifacts?: ArtifactDeps` are conditionally mounted at lines 118-128. `createProductionApp` wires them at lines 550-565 using the shared `config`, `guildHallHome`, and `git` instances.

**Admin route as model.** `daemon/routes/admin.ts:17-32` defines `AdminDeps`. The same shape applies for `GitLoreDeps`. Skill definitions follow `admin.ts:280-343`. The `descriptions` record at `admin.ts:346-351` already registers `"workspace.git"` — the new route must not re-register that key or it will overwrite the admin entry.

**Page and CSS.** `web/app/projects/[name]/page.tsx:39-45` is the `Promise.all` block to extend. Lines 57-90 are the tab conditionals; the commissions tab (`line 60-78`) and meetings tab (`79-90`) establish the `<Tab><Actions><List>` structure the artifacts tab currently lacks. `page.module.css` has `.commissionTab`, `.commissionActions`, `.meetingTab`, `.meetingActions` — add the matching artifact variants.

**Component model.** `CreateCommissionButton.tsx` is the closest analog: a `"use client"` component that toggles an inline form, collapses on success, no modal. `CommitLoreButton` is simpler — one text field, no router refresh on success.

## Implementation Steps

### Step 1: Extend `GitOps` with lore-scoped operations

**Modified file:** `daemon/lib/git.ts`

Add two methods to the `GitOps` interface:

```ts
/** Returns the count of uncommitted .lore/ changes in the worktree. */
lorePendingChanges(worktreePath: string): Promise<{ hasPendingChanges: boolean; fileCount: number }>;

/**
 * Stages .lore/ changes and commits with the given message.
 * Uses `git add -- .lore/` (not `git add -A`) and `--no-verify`.
 * Returns committed: false if there is nothing to stage in .lore/.
 */
commitLore(worktreePath: string, message: string): Promise<{ committed: boolean }>;
```

Add implementations in `createGitOps()`:

```ts
async lorePendingChanges(worktreePath) {
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain", "--", ".lore/"]);
  if (stdout === "") {
    return { hasPendingChanges: false, fileCount: 0 };
  }
  const fileCount = stdout.split("\n").filter(Boolean).length;
  return { hasPendingChanges: true, fileCount };
},

async commitLore(worktreePath, message) {
  const { stdout } = await runGit(worktreePath, ["status", "--porcelain", "--", ".lore/"]);
  if (stdout === "") {
    return { committed: false };
  }
  await runGit(worktreePath, ["add", "--", ".lore/"]);
  // --no-verify: consistent with commitAll and squashMerge.
  // Integration worktrees share the project's hook config but aren't
  // full working copies; pre-commit hooks (linters, tests) will fail.
  await runGit(worktreePath, ["commit", "--no-verify", "-m", message]);
  return { committed: true };
},
```

**Add stubs to all existing `GitOps` mock objects** that enumerate every method. Search for `makeMockGitOps` and the inline mock in `admin.test.ts` — both need the two new methods stubbed:

```ts
lorePendingChanges: () => Promise.resolve({ hasPendingChanges: false, fileCount: 0 }),
commitLore: () => Promise.resolve({ committed: false }),
```

**Verify:** `bun run typecheck` passes. `bun test` passes (existing tests unaffected).

---

### Step 2: Create `daemon/routes/git-lore.ts`

**New file:** `daemon/routes/git-lore.ts`

```ts
import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import type { GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";

export interface GitLoreDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  /** Injectable logger. Defaults to nullLog("git-lore"). */
  log?: Log;
}
```

**`GET /workspace/git/lore/status?projectName=X`**

Resolves the integration worktree path, calls `gitOps.lorePendingChanges(worktreePath)`, returns `{ hasPendingChanges, fileCount }`. Returns 404 if `projectName` is not in config. Returns 500 on unexpected errors.

**`POST /workspace/git/lore/commit?projectName=X`** with JSON body `{ message: string }`

1. Validates `message` is a non-empty string. Returns 400 with `{ error: "Commit message is required" }` if empty or missing.
2. Resolves `integrationWorktreePath(guildHallHome, projectName)`.
3. Calls `gitOps.commitLore(worktreePath, message)`.
4. If `{ committed: false }`: returns `{ committed: false, message: "Nothing to commit" }` with status 200.
5. If `{ committed: true }`: returns `{ committed: true, message }` with status 200.
6. Returns 404 if project not in config. Returns 500 on unexpected errors.

**Operation definitions** (follow `admin.ts:280-343` shape exactly):

```ts
const operations: OperationDefinition[] = [
  {
    operationId: "workspace.git.lore.status",
    version: "1",
    name: "status",
    description: "Check for uncommitted .lore/ changes in the integration worktree",
    invocation: { method: "GET", path: "/workspace/git/lore/status" },
    sideEffects: "",
    context: { project: true },
    idempotent: true,
    hierarchy: { root: "workspace", feature: "git", object: "lore" },
    parameters: [{ name: "projectName", required: true, in: "query" as const }],
  },
  {
    operationId: "workspace.git.lore.commit",
    version: "1",
    name: "commit",
    description: "Stage .lore/ changes and commit to the integration worktree",
    invocation: { method: "POST", path: "/workspace/git/lore/commit" },
    sideEffects: "Stages .lore/ changes and commits to the integration worktree",
    context: { project: true },
    idempotent: false,
    hierarchy: { root: "workspace", feature: "git", object: "lore" },
    parameters: [
      { name: "projectName", required: true, in: "query" as const },
      { name: "message", required: true, in: "body" as const },
    ],
  },
];

const descriptions: Record<string, string> = {
  // Do NOT register "workspace.git" here — admin.ts already owns it.
  "workspace.git.lore": "Commit .lore changes to the integration worktree",
};
```

Export `createGitLoreRoutes(deps: GitLoreDeps): RouteModule`.

**Verify:** `bun run typecheck` passes.

---

### Step 3: Wire into `daemon/app.ts`

**Modified file:** `daemon/app.ts`

Two changes:

**3a. Add `gitLore` to `AppDeps`** (after the `artifacts?` field):

```ts
import { createGitLoreRoutes, type GitLoreDeps } from "./routes/git-lore";

export interface AppDeps {
  // ... existing fields ...
  gitLore?: GitLoreDeps;
}
```

**3b. Mount conditionally in `createApp`** (after the `artifacts` block at line 124):

```ts
if (deps.gitLore) {
  mount(createGitLoreRoutes({ ...deps.gitLore }));
}
```

**3c. Wire in `createProductionApp`** (within the `createApp(...)` call, after the `artifacts` wiring at line 563):

```ts
gitLore: {
  config,
  guildHallHome,
  gitOps: git,
},
```

No new infrastructure: `config`, `guildHallHome`, and `git` are the same instances used by `admin` and `artifacts`.

**Verify:** `bun run typecheck` passes. `bun test` passes.

---

### Step 4: Update `web/app/projects/[name]/page.tsx`

**Modified file:** `web/app/projects/[name]/page.tsx`

**4a. Add import** at the top with the other component imports:

```ts
import CommitLoreButton from "@/web/components/project/CommitLoreButton";
```

**4b. Extend the `Promise.all` block** (currently lines 39-45). Add the lore status fetch as the fifth entry:

```ts
const [artifactsResult, meetingsResult, commissionsResult, graphResult, loreStatusResult] =
  await Promise.all([
    fetchDaemon<{ artifacts: Artifact[] }>(`/workspace/artifact/document/list?projectName=${encoded}`),
    fetchDaemon<{ meetings: Artifact[] }>(`/meeting/request/meeting/list?projectName=${encoded}&view=artifacts`),
    fetchDaemon<{ commissions: CommissionMeta[] }>(`/commission/request/commission/list?projectName=${encoded}`),
    fetchDaemon<DependencyGraph>(`/commission/dependency/project/graph?projectName=${encoded}`),
    fetchDaemon<{ hasPendingChanges: boolean; fileCount: number }>(
      `/workspace/git/lore/status?projectName=${encoded}`
    ),
  ]);
```

Add extractions below the existing ones (lines 47-50):

```ts
const hasPendingChanges = loreStatusResult.ok ? loreStatusResult.data.hasPendingChanges : false;
const pendingFileCount = loreStatusResult.ok ? loreStatusResult.data.fileCount : 0;
```

**4c. Wrap the artifacts tab** (currently line 57-59: just `<ArtifactList>`). Replace with:

```tsx
{tab === "artifacts" && (
  <div className={styles.artifactTab}>
    <div className={styles.artifactActions}>
      <CommitLoreButton
        projectName={projectName}
        hasPendingChanges={hasPendingChanges}
        pendingFileCount={pendingFileCount}
      />
    </div>
    <ArtifactList artifacts={artifacts} projectName={projectName} />
  </div>
)}
```

**Verify:** `bun run typecheck` passes. Page renders without error when the daemon is not running (lore status gracefully defaults to `false`/`0`).

---

### Step 5: Add CSS classes to `page.module.css`

**Modified file:** `web/app/projects/[name]/page.module.css`

Append after the existing `.meetingActions` block (line 35):

```css
.artifactTab {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.artifactActions {
  display: flex;
  justify-content: flex-start;
}
```

Identical shape to `.commissionTab`/`.commissionActions` and `.meetingTab`/`.meetingActions`.

---

### Step 6: Create the Next.js API proxy route

**New file:** `web/app/api/git/lore/commit/route.ts`

Client components cannot call the daemon directly (it's on a Unix socket). All client-side mutations go through Next.js API routes that proxy to the daemon. Follow the pattern in `web/app/api/artifacts/route.ts`.

```ts
import { NextRequest, NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(request: NextRequest) {
  const projectName = request.nextUrl.searchParams.get("projectName");
  if (!projectName) {
    return NextResponse.json({ error: "Missing required query parameter: projectName" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message } = body as { message?: string };
  if (!message || message.trim() === "") {
    return NextResponse.json({ error: "Commit message is required" }, { status: 400 });
  }

  const result = await daemonFetch(
    `/workspace/git/lore/commit?projectName=${encodeURIComponent(projectName)}`,
    {
      method: "POST",
      body: JSON.stringify({ message: message.trim() }),
    },
  );

  if (isDaemonError(result)) {
    return NextResponse.json({ error: "Daemon is not running" }, { status: 503 });
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
```

The API route applies its own `message` validation before forwarding. This means an empty message is rejected at the Next.js layer, consistent with how the daemon would reject it too.

`CommitLoreButton` calls `POST /api/git/lore/commit?projectName=X` with `{ message }`. The response shape mirrors the daemon: `{ committed: boolean, message: string }` or `{ error: string }`.

**Verify:** `bun run typecheck` passes.

---

### Step 7: Create `CommitLoreButton`

**New file:** `web/components/project/CommitLoreButton.tsx`
**New file:** `web/components/project/CommitLoreButton.module.css`

`CommitLoreButton` is a `"use client"` component. Props:

```ts
interface CommitLoreButtonProps {
  projectName: string;
  hasPendingChanges: boolean;
  pendingFileCount: number;
}
```

**State model:**
- `showForm: boolean` — whether the inline form is expanded
- `message: string` — the commit message input value
- `submitting: boolean` — prevents double-submit
- `validationError: string | null` — shown below the input when message is empty on submit
- `result: { kind: "success" | "nothing" | "error"; text: string } | null` — feedback after submit

**Render logic:**

The button is always rendered in one of two states:
- `hasPendingChanges === false`: muted button (visually dimmed opacity), `title="No uncommitted .lore changes"`, not disabled (clicking opens the form anyway so users understand the capability)
- `hasPendingChanges === true`: full brass-toned button

Clicking the button sets `showForm = true` and clears any previous result.

When `showForm` is true, render an inline form below the button:
- A labeled `<input type="text">` for the commit message, bound to `message`
- A file count annotation: "`{pendingFileCount} file(s) pending`" (show even if zero so the user knows what they're committing)
- A "Commit" submit button, disabled when `submitting` or when `message.trim() === ""`
- A cancel link/button that sets `showForm = false`
- `validationError` rendered inline below the input if non-null

**Submit handler:**
1. If `message.trim() === ""`, set `validationError = "A commit message is required"`, return early (do not call daemon).
2. Set `submitting = true`, clear `validationError`.
3. `POST /workspace/git/lore/commit?projectName=${encodeURIComponent(projectName)}` with `{ message: message.trim() }` via `fetch` to the daemon socket path. The daemon runs on a Unix socket; use the same base URL pattern as other client-side API calls in the codebase. Check how `web/lib/daemon-api.ts` exposes the base URL for fetch calls from client components.
4. On success with `committed: true`: set `result = { kind: "success", text: "Committed." }`, `showForm = false`, `message = ""`. The result text is shown briefly (a few seconds via `setTimeout` → clear result), then fades.
5. On `committed: false`: set `result = { kind: "nothing", text: "Nothing to commit." }`, `showForm = false`.
6. On non-2xx or network error: set `result = { kind: "error", text: error message }`. Do NOT collapse the form — the user should be able to correct and retry.
7. Set `submitting = false`.

**API call pattern.** `fetchDaemon` in `web/lib/daemon-api.ts` is server-only. Client components call Next.js API routes via `fetch`. `CommitLoreButton` calls `POST /api/git/lore/commit?projectName=${encodeURIComponent(projectName)}` with `Content-Type: application/json` and body `{ message }`. This is the same pattern as `CreateMeetingButton.tsx:37-41`.

**CSS (`CommitLoreButton.module.css`):**

```css
.commitButton {
  padding: var(--space-sm) var(--space-md);
  background-color: rgba(184, 134, 11, 0.15);
  border: 1px solid var(--color-brass);
  color: var(--color-brass);
  font-family: var(--font-body);
  font-size: 0.9rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.commitButton:hover {
  background-color: rgba(184, 134, 11, 0.25);
}

.commitButtonMuted {
  composes: commitButton;
  opacity: 0.45;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: var(--space-xs);
}

.inputRow {
  display: flex;
  gap: var(--space-sm);
  align-items: flex-start;
  flex-wrap: wrap;
}

.messageInput {
  flex: 1;
  min-width: 240px;
  padding: var(--space-xs) var(--space-sm);
  font-family: var(--font-body);
  font-size: 0.9rem;
  background-color: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(184, 134, 11, 0.4);
  border-radius: 4px;
  color: var(--color-parchment, #e8d5b0);
}

.messageInput:focus {
  outline: none;
  border-color: var(--color-brass);
}

.fileCount {
  font-size: 0.8rem;
  opacity: 0.65;
  align-self: center;
}

.validationError {
  font-size: 0.8rem;
  color: #c97070;
}

.formActions {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

.submitButton {
  padding: var(--space-xs) var(--space-md);
  background-color: rgba(184, 134, 11, 0.2);
  border: 1px solid var(--color-brass);
  color: var(--color-brass);
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
}

.submitButton:disabled {
  opacity: 0.4;
  cursor: default;
}

.cancelLink {
  font-size: 0.85rem;
  opacity: 0.6;
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
  padding: 0;
  text-decoration: underline;
}

.cancelLink:hover {
  opacity: 1;
}

.resultText {
  font-size: 0.85rem;
  opacity: 0.8;
}

.resultError {
  font-size: 0.85rem;
  color: #c97070;
}
```

**Verify:** `bun run typecheck` passes. Component renders without crashing when `hasPendingChanges` is false.

---

### Step 8: Tests

**New file:** `tests/daemon/routes/git-lore.test.ts`

Use the same structure as `tests/daemon/routes/artifacts.test.ts`: mock `GitOps`, wire through `createApp`, use `app.request()`. All tests follow the DI pattern — no real git subprocess calls.

Required test cases (from the spec's AI Validation section):

1. **`GET /workspace/git/lore/status` with no pending changes** — mock `lorePendingChanges` returns `{ hasPendingChanges: false, fileCount: 0 }`. Expect 200, `{ hasPendingChanges: false, fileCount: 0 }`.

2. **`GET /workspace/git/lore/status` with 3 pending files** — mock `lorePendingChanges` returns `{ hasPendingChanges: true, fileCount: 3 }`. Expect 200, `{ hasPendingChanges: true, fileCount: 3 }`.

3. **`GET /workspace/git/lore/status` with unknown project** — project not in config. Expect 404.

4. **`POST /workspace/git/lore/commit` with empty `message`** — Expect 400, `{ error: "Commit message is required" }`. The `commitLore` mock must NOT be called.

5. **`POST /workspace/git/lore/commit` with missing `message`** — body `{}`. Same expectation as above.

6. **`POST /workspace/git/lore/commit` when git returns nothing to commit** — mock `commitLore` returns `{ committed: false }`. Expect 200, `{ committed: false, message: "Nothing to commit" }`.

7. **`POST /workspace/git/lore/commit` successful commit** — mock `commitLore` returns `{ committed: true }`. Expect 200, `{ committed: true, message: <the message> }`.

8. **`POST /workspace/git/lore/commit` with unknown project** — Expect 404.

9. **Verify `git add -- .lore/` staging boundary** — Use a `commitLore` spy that captures its arguments. Call the commit endpoint with a valid message, verify the spy received the correct `worktreePath` (integration worktree for the project) and that `git add -- .lore/` is what the `commitLore` implementation calls (verify via the real `createGitOps` implementation in a separate unit test, not via the route test).

For the staging boundary test (item 9), write a unit test directly on `createGitOps().commitLore` using a real git repo in a temp directory. Create a file in `.lore/` and a file outside `.lore/`. Call `commitLore`. Verify only the `.lore/` file appears in `git log -1 --name-only`.

**Component tests.** `CommitLoreButton` depends on `fetch` and React state. Verify at minimum:
- Submit button is disabled when `message` is empty (prop-threading test using JSX inspection or bun:test with JSDOM if available).
- The validation error renders when submit is clicked with empty message (requires JSDOM or manual review).

If JSDOM is not available in the test suite, note the component tests as manual verification items and document the expected behaviors clearly in the component file comments.

**Verify:** `bun test tests/daemon/routes/git-lore.test.ts` passes. Full `bun test` passes.

---

### Step 9: Full verification

1. `bun run typecheck` — clean
2. `bun run lint` — clean
3. `bun test` — all passing (current suite: 2,624 + new tests)
4. `bun run build` — production build clean

Manual smoke test (from spec's AI Validation section):
- Edit a `.lore/` file from the web UI. Navigate to the Artifacts tab. Confirm the "Commit .lore" button appears active.
- Click it. Confirm the inline form expands (not a modal). Confirm the file count annotation matches expectation.
- Enter a commit message. Click Commit. Confirm the form collapses and "Committed." text appears briefly.
- Check the integration worktree with `git log -1 --stat` — confirm only `.lore/` files appear in the commit, and the commit message matches what was entered.
- With no pending changes, confirm the button renders in a muted state with the tooltip "No uncommitted .lore changes".
- Enter an empty message and click Commit — confirm the validation message appears and no API call is made (check network tab).

---

## Delegation Guide

| Step | Who | Notes |
|------|-----|-------|
| Steps 1–4 | Implementation agent | Pure TypeScript/DI work; no UI required |
| Step 5 | Implementation agent | CSS only |
| Step 6 | Implementation agent | Thin Next.js API proxy; mirrors `web/app/api/artifacts/route.ts` pattern exactly |
| Step 7 | Implementation agent | Client component; API path is `/api/git/lore/commit` per Step 6 |
| Step 8 | Implementation agent | Daemon route tests are straightforward DI; git staging boundary test requires a real temp git repo |
| Step 9 | Fresh-eyes review agent | Verify spec compliance and staging boundary correctness |

## Constraints and Decisions

- **`git add -- .lore/` is not overridable.** The staging command lives in `commitLore` in `createGitOps()`. The route passes the worktree path and message; it has no access to the add path. This is the right place to enforce the boundary.

- **Do NOT re-register `"workspace.git"` in `git-lore.ts` descriptions.** That key is already owned by `admin.ts`. Only add `"workspace.git.lore"`.

- **No router refresh after commit.** The `hasPendingChanges` prop is server-rendered and becomes stale after a commit until the next page navigation. This is acceptable per the spec. Do not call `router.refresh()` on success.

- **Daemon fetch from client components.** Check `web/lib/daemon-api.ts` and existing form components before implementing the `fetch` call in `CommitLoreButton`. The daemon runs on a Unix socket proxied via Next.js API routes. Client-side calls likely go to `/api/daemon/[...path]` or similar — verify before assuming a direct URL works.

- **`runGit` is private.** The two new `GitOps` methods (`lorePendingChanges`, `commitLore`) are the only correct way to add git behavior reachable from route handlers. Do not export `runGit` or try to use it from outside `git.ts`.
