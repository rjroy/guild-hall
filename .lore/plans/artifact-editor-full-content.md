---
title: Show full file content in artifact editor
date: 2026-02-27
updated: 2026-03-03
status: implemented
tags: [bug-fix, ui, artifacts, editor, frontmatter]
modules: [artifact-content, api-artifacts, artifacts-lib]
related: [.lore/issues/artifact-editor-frontmatter.md]
---

# Plan: Show Full File Content in Artifact Editor

## Goal

The artifact editor at `/projects/[name]/artifacts/[...path]` should display and edit the full raw file content (frontmatter + body). Currently it only shows the markdown body after the closing `---`, which means frontmatter-only files (commissions, meetings) appear empty. Saving should write the raw text back directly, avoiding gray-matter reformatting noise in git diffs.

## Codebase Context

**Current data flow (read path):**

1. `readArtifact()` in `lib/artifacts.ts:131` reads the file, parses with `gray-matter`, returns `content` (body only) and `meta` (parsed frontmatter). The raw file string is available as a local variable but discarded.
2. The artifact page (`web/app/projects/[name]/artifacts/[...path]/page.tsx:67`) calls `readArtifact()`, passes `artifact.content` as the `body` prop to `ArtifactContent`.
3. `web/components/artifact/ArtifactContent.tsx:9` shows `body` in both view mode (ReactMarkdown) and edit mode (textarea). For frontmatter-only files, `body` is empty or whitespace.

**Current data flow (write path):**

1. `ArtifactContent.tsx` POSTs `{ projectName, artifactPath, content: editContent }` to `PUT /api/artifacts`. `editContent` is the body-only text.
2. `PUT /api/artifacts` (`web/app/api/artifacts/route.ts`) calls `writeArtifactContent()`.
3. `writeArtifactContent()` in `lib/artifacts.ts:170` uses `spliceBody()` to find the frontmatter delimiters in the existing file and replace only the body portion, preserving raw frontmatter bytes.

**Key types:**

| Location | Type | Relevant fields |
|----------|------|-----------------|
| `lib/types.ts:31` | `Artifact` | `content: string` (body only), `meta: ArtifactMeta` |
| `web/components/artifact/ArtifactContent.tsx:9` | `ArtifactContentProps` | `body: string` (body only) |

**Consumers of `readArtifact`:** The artifact page and the meeting page. The meeting page reads `meta` fields from the artifact but does not use `content` for editing. Changes to `readArtifact` won't affect it.

**Consumers of `writeArtifactContent`:** Only `PUT /api/artifacts`. Only consumer of `PUT /api/artifacts` is `ArtifactContent.tsx`. Single consumer chain, safe to change behavior.

**Consumers of `Artifact` interface:** `scanArtifacts`, `readArtifact`, `recentArtifacts`, `artifact-grouping.ts`, navigation tests, and both page components. Adding an optional field is non-breaking.

## Implementation Steps

### Step 1: Add `rawContent` to the `Artifact` interface

**File:** `lib/types.ts`

Add `rawContent?: string` to the `Artifact` interface. Optional because `scanArtifacts` doesn't need it (list views never edit), and making it required would force changes to every place that constructs an `Artifact`.

```typescript
export interface Artifact {
  meta: ArtifactMeta;
  filePath: string;
  relativePath: string;
  content: string;
  rawContent?: string;
  lastModified: Date;
}
```

### Step 2: Populate `rawContent` in `readArtifact`

**File:** `lib/artifacts.ts`

`readArtifact()` already reads the raw file into a local variable. Add `rawContent: raw` to the returned object. No second file read needed.

### Step 3: Add `writeRawArtifactContent` function

**File:** `lib/artifacts.ts`

Add a new export that writes the full raw content directly, bypassing `spliceBody()`. Keep `writeArtifactContent` intact for any future programmatic body-only updates.

```typescript
export async function writeRawArtifactContent(
  lorePath: string,
  relativePath: string,
  rawContent: string
): Promise<void> {
  const filePath = validatePath(lorePath, relativePath);
  await fs.writeFile(filePath, rawContent, "utf-8");
}
```

This is the simplest possible write function. Path validation guards against traversal. No parsing, no splicing, no reformatting. The editor sends the full file, the server writes it verbatim.

### Step 4: Update the API route to write raw content

**File:** `web/app/api/artifacts/route.ts`

Replace the call to `writeArtifactContent` with `writeRawArtifactContent`. The `content` field in the request body now carries the full raw file text instead of just the body.

No changes to the request schema (`{ projectName, artifactPath, content }`). The field name stays `content` but its semantics change from "body only" to "full raw file." Since the only consumer (`ArtifactContent.tsx`) changes in step 5 to send raw content, this is safe.

### Step 5: Update `ArtifactContent` to show full raw content

**File:** `web/components/artifact/ArtifactContent.tsx`

This is the core UI change. One new prop, behavior changes in both modes.

**Props change:**

```typescript
interface ArtifactContentProps {
  body: string;
  rawContent: string;
  projectName: string;
  artifactPath: string;
}
```

`body` is still needed for view mode's markdown rendering. `rawContent` is the full file for the editor.

**Edit mode changes:**

- Initialize `editContent` state from `rawContent` instead of `body`.
- Change detection compares `editContent` against `rawContent`.
- The textarea already uses monospace font (`var(--font-code)`), which is appropriate for editing raw frontmatter YAML.

**View mode changes:**

- When `body` has visible content (non-empty after trimming), render markdown as before. No change to the reading experience for normal artifacts.
- When `body` is empty or whitespace-only, show the raw content in a preformatted block. This handles commission artifacts and any frontmatter-only file. The user sees the frontmatter content instead of a blank page.

**Save changes:**

The `handleSave` function already sends `editContent` as `content`. Since `editContent` is now initialized from `rawContent`, the API receives the full raw file. No change needed in the fetch call itself.

### Step 6: Update the artifact page to pass `rawContent`

**File:** `web/app/projects/[name]/artifacts/[...path]/page.tsx`

Pass the new prop from the `readArtifact` result.

```tsx
<ArtifactContent
  body={artifact.content}
  rawContent={artifact.rawContent ?? ""}
  projectName={projectName}
  artifactPath={artifact.relativePath}
/>
```

The fallback to `""` handles the theoretical case where `rawContent` is undefined (shouldn't happen from `readArtifact`, but satisfies the type).

### Step 7: Update tests

**Files:** `tests/lib/artifacts.test.ts`, `tests/api/artifacts-route.test.ts`

**7a. `readArtifact` tests** (`tests/lib/artifacts.test.ts`):

Add assertions to the existing `readArtifact` describe block verifying `rawContent` contains the full file including frontmatter delimiters. Add a dedicated test for a frontmatter-only file (no body) confirming `rawContent` has the frontmatter and `content` is empty/whitespace.

**7b. `writeRawArtifactContent` tests** (`tests/lib/artifacts.test.ts`):

New describe block for `writeRawArtifactContent`:
- Writes full raw content including frontmatter and body, then reads back and verifies exact match.
- Overwrites existing file content completely (no splicing).
- Path traversal rejection (same as existing `writeArtifactContent` test).
- Handles files with no frontmatter (writes raw text directly).

**7c. API route tests** (`tests/api/artifacts-route.test.ts`):

Update the existing "saves artifact content preserving frontmatter" test. The request body's `content` field should now contain full raw text (frontmatter + body). After save, read the file back and verify it matches the sent content exactly. Add a test case for saving a frontmatter-only file (verifies round-trip: read raw, edit frontmatter, save, read back).

### Step 8: Validate

Run the full test suite (`bun test`) to confirm no regressions. Verify typecheck passes (`bun run typecheck`). The change surface is small (5 production files, 2 test files), so a full suite run is sufficient validation.

## Delegation Guide

No specialized expertise required. This is a straightforward data-flow change across library, API route, and UI component. All steps can be handled by a general-purpose implementation agent.

Steps 1-3 are pure library changes with no UI impact. Step 4 changes the API behavior. Step 5 is the user-facing fix. Steps 6-8 wire it together and verify. Implement in order; steps 1-3 can be done together, but step 4 depends on step 3, and step 5 depends on steps 1 and 4.

## Design Decisions

**Why add `rawContent` instead of changing `content`?** The `content` field (body-only) is used by `scanArtifacts` for artifact grouping and by the MetadataSidebar's markdown rendering. Changing its semantics would require auditing every consumer. An additive optional field is non-breaking.

**Why keep `writeArtifactContent`?** It's a useful primitive for programmatic body-only updates where the caller wants to preserve frontmatter untouched. Removing it would be premature; it costs nothing to keep.

**Why not add a `raw` flag to the API?** The only consumer is the editor component. Adding a flag implies two write modes that future developers must understand. Changing the single behavior is simpler and matches the single use case.

**Why show raw content in view mode for empty-body files?** The alternative is showing nothing with a "click Edit" hint. But the artifact editor's purpose is to be the escape hatch for any `.lore/` file. Showing the raw content in a preformatted block gives immediate visibility into the file's contents without requiring the user to enter edit mode. The metadata sidebar already displays parsed frontmatter fields in a structured way; the raw view is the complement for fields not in the typed set.
