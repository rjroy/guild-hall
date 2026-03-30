---
title: "Quick Add Issues"
date: 2026-03-29
status: draft
tags: [ui, issues, web-ui, cli, daemon, artifacts]
modules: [daemon/routes/workspace-issue, daemon/app, "web/app/projects/[name]/page", web/components/project/NewIssueButton, web/app/api/issues/create, cli/index]
related:
  - .lore/specs/ui/quick-add-issues.md
  - .lore/plans/ui/commit-lore-from-web.md
  - .lore/brainstorm/quick-add-issues.md
---

# Plan: Quick Add Issues

## Goal

Add a one-gesture issue capture path on three surfaces. The daemon gets `POST /workspace/issue/create` — a dedicated endpoint that owns slug generation, conflict resolution, and commit. The web UI gets a "New Issue" button in the artifact tab action bar, expanding an inline form identical in shape to `CommitLoreButton`. The CLI inherits the command automatically via the operations registry, with one small addition to support `--body -` stdin reading.

## Spec Gaps and Ambiguities

These were discovered during code review and affect the implementation.

**Gap 1 — Missing Next.js API proxy route.** The spec's exit points list `web/components/project/NewIssueButton.tsx` but not a Next.js API route. Client components cannot call the daemon directly (Unix socket, server-only). A proxy at `web/app/api/issues/create/route.ts` is architecturally required, following the `web/app/api/git/lore/commit/route.ts` pattern established by `commit-lore-from-web`. Phase 3 adds it.

**Gap 2 — `context` field missing from REQ-QAI-10.** Every existing project-scoped `OperationDefinition` includes `context: { project: true }`. REQ-QAI-10 doesn't mention this field. Without it the CLI's context-aware help won't flag `projectName` correctly. The plan adds `context: { project: true }` to the operation definition.

**Gap 3 — REQ-QAI-21 and REQ-QAI-22 are in tension.** REQ-QAI-21 says "no CLI-specific code is required." REQ-QAI-22 requires `--body -` to read from stdin. The current `cli/index.ts` has no stdin reading and `buildBody` in `cli/resolve.ts` maps positional args by index with no special treatment of `-`. REQ-QAI-22 needs a small targeted change in the CLI command handler: before building the request, detect when the `body` arg value is the literal `-` string and replace it with `process.stdin` content. Phase 7 covers this.

**Gap 4 — Named flag syntax vs. positional CLI.** REQ-QAI-21 shows `--title "Title text"` as the CLI invocation. The current CLI uses positional args mapped by index, not named flags. The positional form works automatically: `guild-hall workspace issue create <project> <title> [body]`. The `--title` flag form requires a larger CLI refactor outside this spec's scope. The plan uses the positional form. The spec examples should be read as illustrative, not prescriptive — the generated CLI shape follows the parameter order in the `OperationDefinition`.

## Codebase Context

**`commitAll` is the right method.** REQ-QAI-9 says to use `gitOps.commitAll`. The implementation at `daemon/lib/git.ts:252-263` does `git add -A && git commit --no-verify`. Integration worktrees are sparse checkouts of `.lore/` only — `git add -A` on them stages only `.lore/` files, making the boundary safe. The `artifacts.ts` write handler at line 175-180 uses exactly this pattern (non-fatal commit after write). Follow it.

**`artifacts.ts` is the DO NOT extend model.** `POST /workspace/artifact/document/write` at `daemon/routes/artifacts.ts:138` is a low-level write with no semantic understanding. The new route lives in a separate file and does not call `writeRawArtifactContent` or any artifact lib function. It uses `node:fs/promises` directly.

**`AppDeps` optional field pattern.** `daemon/app.ts:32-50` defines `AppDeps`. Twelve optional fields already exist (`meetingSession?`, `admin?`, `artifacts?`, `gitLore?`, etc.) and are conditionally mounted via `if (deps.X)` at lines 81-136. Add `workspaceIssue?: IssueRouteDeps` after `gitLore?` and mount it the same way.

**`createProductionApp` wiring.** The `createApp(...)` call at line 600 wires all deps. The `admin`, `artifacts`, and `gitLore` entries (lines 612-630) use the same `config`, `guildHallHome`, and `git` instances. No new infrastructure needed for `workspaceIssue`.

**`CommitLoreButton` is the component model.** The inline form pattern at `web/components/project/CommitLoreButton.tsx` is exactly what `NewIssueButton` follows: `"use client"`, `showForm` toggle, submit with loading state, collapse on success with timed confirmation, stay open on failure. The state model maps directly.

**Turbopack does not support CSS Modules `composes`.** The CLAUDE.md documents this explicitly. Use TSX-side class composition (`className={`${styles.base} ${styles.extra}`}`) for any variant styling, not `composes:`.

**Page already has `artifactActions`.** `web/app/projects/[name]/page.tsx:62-68` already has the `<div className={styles.artifactActions}>` container with `CommitLoreButton` inside it. Adding `NewIssueButton` is a one-line insertion before `CommitLoreButton`. No new CSS wrapper needed.

## Implementation Phases

### Phase 1: Daemon route (`daemon/routes/workspace-issue.ts`)

**New file:** `daemon/routes/workspace-issue.ts`

REQs covered: QAI-1, QAI-2, QAI-5, QAI-6, QAI-7, QAI-8, QAI-9, QAI-10, QAI-11

**Step 1a — Imports and deps interface.**

Follow `git-lore.ts` exactly:

```ts
import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { nullLog } from "@/daemon/lib/log";
import type { Log } from "@/daemon/lib/log";
import type { GitOps } from "@/daemon/lib/git";
import { integrationWorktreePath } from "@/lib/paths";
import type { AppConfig, RouteModule, OperationDefinition } from "@/lib/types";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";

export interface IssueRouteDeps {
  config: AppConfig;
  guildHallHome: string;
  gitOps: GitOps;
  log?: Log;
}
```

**Step 1b — Slug generation function (pure, exported for testing).**

```ts
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

The three spec examples in REQ-QAI-6 must all pass. Export it so the test file can test it directly without an HTTP roundtrip.

**Step 1c — Conflict resolution (inline in the handler, but extract for testability).**

```ts
export async function resolveSlug(
  issuesDir: string,
  baseSlug: string,
): Promise<string> {
  let slug = baseSlug;
  let counter = 2;
  while (true) {
    try {
      await fs.access(nodePath.join(issuesDir, `${slug}.md`));
      // File exists — try next suffix
      slug = `${baseSlug}-${counter}`;
      counter++;
    } catch {
      // File does not exist — slug is free
      return slug;
    }
  }
}
```

Export for direct unit testing of the conflict suffix sequence (REQ-QAI-7 / AI Validation requirement).

**Step 1d — Handler body.**

```ts
export function createWorkspaceIssueRoutes(deps: IssueRouteDeps): RouteModule {
  const log = deps.log ?? nullLog("workspace-issue");
  const routes = new Hono();

  routes.post("/workspace/issue/create", async (c) => {
    // 1. Parse and validate JSON body
    let body: { projectName?: string; title?: string; body?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { projectName, title, body: issueBody } = body;

    // 2. Validate title
    if (!title || title.trim() === "") {
      return c.json({ error: "Title is required" }, 400);
    }
    if (title.trim().length > 200) {
      return c.json({ error: "Title must be 200 characters or fewer" }, 400);
    }

    // 3. Validate project
    const project = deps.config.projects.find((p) => p.name === projectName);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // 4. Generate slug and resolve path
    const baseSlug = slugify(title.trim());
    const worktreePath = integrationWorktreePath(deps.guildHallHome, projectName!);
    const issuesDir = nodePath.join(worktreePath, ".lore", "issues");

    // Ensure directory exists
    await fs.mkdir(issuesDir, { recursive: true });

    // 5. Conflict resolution
    const slug = await resolveSlug(issuesDir, baseSlug);
    const filePath = nodePath.join(issuesDir, `${slug}.md`);

    // 6. Build file content
    const today = new Date().toISOString().split("T")[0];
    const titleValue = title.trim().includes('"')
      ? title.trim().replace(/"/g, '\\"')
      : title.trim();
    let content = `---\ntitle: "${titleValue}"\ndate: ${today}\nstatus: open\n---`;
    if (issueBody && issueBody.trim() !== "") {
      content += `\n\n${issueBody}`;
    }

    // 7. Write the file
    try {
      await fs.writeFile(filePath, content, "utf-8");
    } catch (err: unknown) {
      log.error("issue write failed:", errorMessage(err));
      return c.json({ error: errorMessage(err) }, 500);
    }

    // 8. Commit (non-fatal)
    try {
      await deps.gitOps.commitAll(worktreePath, `Add issue: ${slug}`);
    } catch (err: unknown) {
      log.warn("issue commit failed (non-fatal):", errorMessage(err));
    }

    // 9. Return 201 with path and slug
    const relativePath = `.lore/issues/${slug}.md`;
    return c.json({ path: relativePath, slug }, 201);
  });
```

**Step 1e — Operation definition and descriptions.**

```ts
  const operations: OperationDefinition[] = [
    {
      operationId: "workspace.issue.create",
      version: "1",
      name: "create",
      description: "Create an issue in .lore/issues/ and commit it to the integration worktree",
      invocation: { method: "POST", path: "/workspace/issue/create" },
      sideEffects: "Creates an issue file in .lore/issues/ and commits it to the integration worktree",
      context: { project: true },
      idempotent: false,
      hierarchy: { root: "workspace", feature: "issue", object: "create" },
      parameters: [
        { name: "projectName", required: true, in: "body" as const },
        { name: "title", required: true, in: "body" as const },
        { name: "body", required: false, in: "body" as const },
      ],
    },
  ];

  const descriptions: Record<string, string> = {
    "workspace.issue": "Create and manage issues in .lore/issues/",
  };

  return { routes, operations, descriptions };
}
```

Note: `hierarchy` uses `{ root: "workspace", feature: "issue", object: "create" }`. The `object` is `"create"` here (the operation name) following the spec. This differs slightly from other ops where `object` is the noun — acceptable because the spec prescribes it explicitly in REQ-QAI-10.

**Verify after Phase 1:** `bun run typecheck` passes. No other changes yet.

---

### Phase 2: Wire into `daemon/app.ts`

REQs covered: QAI-3, QAI-4

**Step 2a — Add import and `AppDeps` field.**

In `daemon/app.ts`, add after the `gitLore` import:

```ts
import { createWorkspaceIssueRoutes, type IssueRouteDeps } from "./routes/workspace-issue";
```

Add `workspaceIssue?: IssueRouteDeps` to `AppDeps` after the `gitLore?` field.

**Step 2b — Conditional mount in `createApp`.**

After the `if (deps.gitLore)` block:

```ts
if (deps.workspaceIssue) {
  mount(createWorkspaceIssueRoutes(deps.workspaceIssue));
}
```

**Step 2c — Wire in `createProductionApp`.**

In the `createApp(...)` call (around line 625), after the `gitLore` entry:

```ts
workspaceIssue: {
  config,
  guildHallHome,
  gitOps: git,
},
```

**Verify after Phase 2:** `bun run typecheck` passes. `bun test` passes (no new tests yet).

---

### Phase 3: Next.js API proxy route

**New file:** `web/app/api/issues/create/route.ts`

This is a spec gap (see above). Client components need a Next.js API route to reach the daemon. The proxy is thin — validate, forward, return.

```ts
import { NextRequest, NextResponse } from "next/server";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectName, title, body: issueBody } = body as {
    projectName?: string;
    title?: string;
    body?: string;
  };

  if (!projectName) {
    return NextResponse.json({ error: "projectName is required" }, { status: 400 });
  }
  if (!title || title.trim() === "") {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (title.trim().length > 100) {
    return NextResponse.json({ error: "Title must be 100 characters or fewer" }, { status: 400 });
  }

  const payload: Record<string, string> = { projectName, title: title.trim() };
  if (issueBody && issueBody.trim() !== "") {
    payload.body = issueBody;
  }

  const result = await daemonFetch("/workspace/issue/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (isDaemonError(result)) {
    return NextResponse.json({ error: "Daemon is not running" }, { status: 503 });
  }

  const data = (await result.json()) as Record<string, unknown>;
  return NextResponse.json(data, { status: result.status });
}
```

Note: the proxy enforces the 100-character client limit, not the 200-character daemon limit. The daemon is the final authority — it applies its own 200-char validation. The proxy validates early to match the `NewIssueButton`'s client-side limit.

**Verify after Phase 3:** `bun run typecheck` passes.

---

### Phase 4: `NewIssueButton` component

REQs covered: QAI-13, QAI-14, QAI-15, QAI-16, QAI-17, QAI-18, QAI-19, QAI-20

**New file:** `web/components/project/NewIssueButton.tsx`

Follow `CommitLoreButton.tsx` as the structural model. Key differences:
- Two inputs (title + optional body), not one
- Always-active button (no `hasPendingChanges` gate)
- Success shows `"Issue created: <slug>"` for 4 seconds, then clears

```tsx
"use client";

import { useState, useCallback, useRef } from "react";
import styles from "./NewIssueButton.module.css";

interface NewIssueButtonProps {
  projectName: string;
}

type ResultState = { slug: string } | { error: string } | null;

export default function NewIssueButton({ projectName }: NewIssueButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggle = useCallback(() => {
    setShowForm(true);
    setResult(null);
    setTitleError(null);
  }, []);

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setTitleError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Client-side validation (REQ-QAI-16)
    const trimmedTitle = title.trim();
    if (trimmedTitle === "") {
      setTitleError("Title is required");
      return;
    }
    if (trimmedTitle.length > 100) {
      setTitleError("Title must be 100 characters or fewer");
      return;
    }

    setSubmitting(true);
    setTitleError(null);

    try {
      const payload: Record<string, string> = { projectName, title: trimmedTitle };
      if (body.trim() !== "") {
        payload.body = body;
      }

      const response = await fetch("/api/issues/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { slug?: string; path?: string; error?: string };

      if (!response.ok) {
        setResult({ error: data.error ?? `Request failed (${response.status})` });
        setSubmitting(false);
        return;
      }

      // Success (REQ-QAI-18): collapse form, show timed confirmation
      setShowForm(false);
      setTitle("");
      setBody("");
      setResult({ slug: data.slug ?? "" });
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      fadeTimer.current = setTimeout(() => setResult(null), 4000);
    } catch {
      setResult({ error: "Network error. Is the daemon running?" });
    }

    setSubmitting(false);
  }, [title, body, projectName]);

  return (
    <div>
      <button className={styles.newIssueButton} onClick={handleToggle}>
        New Issue
      </button>

      {showForm && (
        <div className={styles.form}>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="issue-title">Title</label>
            <input
              id="issue-title"
              type="text"
              className={styles.titleInput}
              maxLength={100}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              autoFocus
            />
            {titleError && (
              <span className={styles.validationError}>{titleError}</span>
            )}
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="issue-body">Body (optional)</label>
            <textarea
              id="issue-body"
              className={styles.bodyTextarea}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className={styles.formActions}>
            <button
              className={styles.submitButton}
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting ? "Creating..." : "Create Issue"}
            </button>
            <button className={styles.cancelLink} onClick={handleCancel}>
              Cancel
            </button>
          </div>
          {"error" in (result ?? {}) && result && "error" in result && (
            <span className={styles.resultError}>{(result as { error: string }).error}</span>
          )}
        </div>
      )}

      {!showForm && result && "slug" in result && (
        <span className={styles.resultText}>Issue created: {result.slug}</span>
      )}
    </div>
  );
}
```

**New file:** `web/components/project/NewIssueButton.module.css`

Follow the `CommitLoreButton.module.css` palette (brass tones, dark background inputs). Key classes: `.newIssueButton`, `.form`, `.fieldGroup`, `.label`, `.titleInput`, `.bodyTextarea`, `.validationError`, `.formActions`, `.submitButton`, `.cancelLink`, `.resultText`, `.resultError`.

Use TSX-side class composition for any variants — no `composes:` directives (Turbopack incompatible).

**Verify after Phase 4:** `bun run typecheck` passes. Component renders without crash.

---

### Phase 5: Page integration

REQs covered: QAI-12

**Modified file:** `web/app/projects/[name]/page.tsx`

**5a — Add import** at the top with the other project component imports:

```ts
import NewIssueButton from "@/web/components/project/NewIssueButton";
```

**5b — Insert `NewIssueButton` into the `artifactActions` bar** (currently lines 62-67). The bar is already a `<div className={styles.artifactActions}>`. Insert `NewIssueButton` before `CommitLoreButton`:

```tsx
<div className={styles.artifactActions}>
  <NewIssueButton projectName={projectName} />
  <CommitLoreButton
    projectName={projectName}
    hasPendingChanges={hasPendingChanges}
    pendingFileCount={pendingFileCount}
  />
</div>
```

No other page changes needed. `NewIssueButton` takes only `projectName`, which is already available from route params.

**Verify after Phase 5:** `bun run typecheck` passes. The artifacts tab renders both buttons without layout breakage.

---

### Phase 6: Tests

**New file:** `tests/daemon/routes/workspace-issue.test.ts`

Use the same structure as `tests/daemon/routes/git-lore.test.ts` and `tests/daemon/routes/artifacts.test.ts`: mock `GitOps`, wire through `createApp`, use `app.request()`.

**Required unit tests (slug and conflict resolution):**

These target the exported `slugify` and `resolveSlug` functions directly, without HTTP:

- `slugify("Quick Add Issues")` → `"quick-add-issues"`
- `slugify("Build fails on Linux (with spaces)")` → `"build-fails-on-linux-with-spaces"`
- `slugify("  leading spaces  ")` → `"leading-spaces"`
- `slugify("!@#$%")` → `""` (all-special produces empty slug — verify the handler handles this edge case; if empty, return 400 or generate a fallback slug like `"issue"`)
- `slugify("a--b___c")` → `"a-b-c"` (consecutive non-alphanumerics collapse to one hyphen)

For `resolveSlug`: use a temp directory, write `quick-add-issues.md` and `quick-add-issues-2.md`, call `resolveSlug(dir, "quick-add-issues")`, verify result is `"quick-add-issues-3"`.

**Required route tests (via `app.request()`):**

1. `POST /workspace/issue/create` with empty `title` → 400, `{ error: "Title is required" }`
2. `POST /workspace/issue/create` with `title` of 201 characters → 400, `{ error: "Title must be 200 characters or fewer" }`
3. `POST /workspace/issue/create` with unknown `projectName` → 404, `{ error: "Project not found" }`
4. `POST /workspace/issue/create` with valid title, no body → 201; verify the written file has correct YAML frontmatter (`title`, `date`, `status: open`) and no trailing content after the closing `---`
5. `POST /workspace/issue/create` with valid title and body → 201; verify file has frontmatter followed by blank line and body text
6. Commit failure (mock `gitOps.commitAll` to throw) → still returns 201 (commit is non-fatal)
7. `{ path, slug }` in 201 response — `path` is `.lore/issues/<slug>.md`, `slug` matches the generated slug

All route tests use a real temp directory for the integration worktree (the handler writes actual files). Mock `gitOps.commitAll` to return `true` unless the test is specifically testing commit failure.

**Component tests (via JSDOM if available, otherwise document as manual):**

- Submit button disabled while `submitting` is true; re-enabled on both success and failure (REQ-QAI-18 / AI Validation)
- Form stays open and error message visible after non-2xx response (REQ-QAI-19 / AI Validation)
- Empty title validation fires before API call; verify `fetch` is not called when title is empty

If JSDOM is not wired in the test suite, document these as manual verification items and add a comment in `NewIssueButton.tsx` listing expected behaviors.

**Verify after Phase 6:** `bun test tests/daemon/routes/workspace-issue.test.ts` passes. `bun test` full suite passes.

---

### Phase 7: CLI stdin support

REQs covered: QAI-21 (auto-inherited, no work), QAI-22 (small CLI change)

**Modified file:** `cli/index.ts`

In the `case "command"` handler, after building `resolvedArgs` and before calling `buildBody`, add a stdin-reading step. When a body parameter has the literal value `"-"`, replace it with content read from stdin:

```ts
// REQ-QAI-22: --body - reads body content from stdin.
// The operations registry passes all argv through as positional args.
// Detect "-" among resolved args and replace with stdin content before
// building the request body.
let finalArgs = resolvedArgs;
if (resolvedArgs.includes("-")) {
  const bodyParams = (skill.parameters ?? []).filter((p) => p.in === "body");
  const hyphenIndex = resolvedArgs.indexOf("-");
  const paramAtIndex = bodyParams[hyphenIndex];
  // Only trigger stdin if the param at this position is optional (body)
  // and the value is literally "-"
  if (paramAtIndex && resolvedArgs[hyphenIndex] === "-") {
    const stdinContent = await readStdin();
    finalArgs = [...resolvedArgs];
    finalArgs[hyphenIndex] = stdinContent;
  }
}
```

Add a `readStdin` helper above `main()`:

```ts
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
```

Replace `buildBody(skill, resolvedArgs)` with `buildBody(skill, finalArgs)` in the non-GET path.

**Note on invocation shape.** Because the current CLI uses positional args (not named flags), the actual invocation is:

```
guild-hall workspace issue create <project> <title> [body]
guild-hall workspace issue create <project> <title> -
```

The stdin form passes `-` as the body positional argument. This differs from the `--body -` syntax in the spec, which requires named flag support. The spec's named flag form is out of scope here — document this in a CLAUDE.md note or retro.

**Verify after Phase 7:** `bun run typecheck` passes. `echo "body content" | bun run cli/index.ts workspace issue create test-project "Test title" -` routes stdin correctly (manual verification).

---

### Phase 8: Full verification

1. `bun run typecheck` — clean
2. `bun run lint` — clean
3. `bun test` — all passing
4. `bun run build` — production build clean

**Manual smoke tests (from spec AI Validation):**

- Start daemon. Navigate to a project's Artifacts tab. Confirm "New Issue" button appears to the left of "Commit .lore".
- Click "New Issue". Confirm form expands inline (not a modal) with "Title" input and "Body (optional)" textarea.
- Submit with empty title. Confirm "Title is required" appears and no API call is made (check Network tab).
- Fill title, click "Create Issue". Confirm form collapses and "Issue created: `<slug>`" appears for ~4 seconds.
- Check the integration worktree: confirm `.lore/issues/<slug>.md` exists with correct YAML frontmatter and a git commit `"Add issue: <slug>"`.
- Submit with a duplicate slug (run creation twice with the same title). Confirm second file is `<slug>-2.md`.
- CLI: `guild-hall workspace issue create <project> "Test issue from CLI"`. Confirm file created.
- CLI stdin: `echo "Body from stdin" | guild-hall workspace issue create <project> "Stdin test" -`. Confirm body appears in the file.

---

## Delegation Guide

| Phase | Who | Notes |
|-------|-----|-------|
| Phase 1 | Implementation agent | Pure TypeScript; no UI. Export `slugify` and `resolveSlug` for testability. |
| Phase 2 | Implementation agent | Three-line change to `daemon/app.ts`. |
| Phase 3 | Implementation agent | Thin proxy, follows `git/lore/commit/route.ts` exactly. |
| Phase 4 | Implementation agent | Client component + CSS. Mirror `CommitLoreButton` structure. No `composes:` in CSS. |
| Phase 5 | Implementation agent | One import, one JSX line. |
| Phase 6 | Implementation agent | Daemon route tests use real temp dir for file writes; mock `gitOps`. Component tests mark as manual if JSDOM is absent. |
| Phase 7 | Implementation agent | Targeted addition to `cli/index.ts`; document the positional-vs-named-flag divergence. |
| Phase 8 | Fresh-eyes review agent | Verify spec compliance, file content correctness, commit message format, error states. |

## Constraints and Decisions

- **`commitAll` uses `git add -A`.** Safe for integration worktrees because they are sparse checkouts of `.lore/` only. No new `GitOps` method is needed. The artifacts write handler confirms this is the established pattern.

- **`workspace.issue` descriptions entry does not register `workspace`.** The `workspace` key is owned by `daemon/routes/artifacts.ts`. Only register `"workspace.issue"`.

- **Title is always quoted in YAML frontmatter.** The spec's example shows `title: "<title>"`. Always quote. Titles containing `"` must have the quote escaped as `\"`. Titles containing `:` would also break unquoted YAML — quoting everything avoids the edge case.

- **Empty slug edge case.** A title like `"!@#$%"` produces an empty slug after `slugify`. The handler should return 400 with `{ error: "Title must contain at least one alphanumeric character" }` for this case. The spec doesn't cover it; this is a defensive addition.

- **No SSE event on issue creation.** The spec is explicit (Constraints section). Do not add `eventBus.emit` to the handler.

- **No router refresh after create.** REQ-QAI-20 is explicit and reasoned. The `NewIssueButton` does not call `router.refresh()`.

- **The `NewIssueButton` is always active.** It receives no server-fetched state. No `hasPendingChanges` analog. The button enables itself unconditionally.

- **Phase 7 delivers positional stdin, not `--body -` named flag.** The named flag syntax in the spec is aspirational. Delivering the positional form (`<project> <title> -`) satisfies the pipeline use case with minimal code change. A full named flag system is a separate CLI infrastructure effort.
