---
name: progressive-discovery
description: Reorganizes a flat directory of reference documents into layered subdirectories that support progressive discovery. Use when a single directory has accumulated enough docs that "all in one place" is hindering navigation rather than helping it, when readers can't tell where to start, or when the user explicitly asks to "stratify", "layer", "rearrange for progressive discovery", or "split this directory into categories". Triggers include phrases like "too many files in one directory", "no clear entry point", "hard to find the why", "where do I start reading".
---

# Progressive Discovery

Take a flat directory of reference docs and reorganize it into layered subdirectories so a reader can drill from "what is this system" down to specific detail without reading everything.

## When this fits

- A reference directory has roughly 12+ docs at one level.
- Files cover overlapping but distinguishable concerns (architecture vs surfaces vs orchestration vs services).
- Readers ask "where do I start?" and there's no obvious answer.
- Cross-doc references exist but the dependency direction is implicit.

If the directory has fewer than ~10 files or every file covers the same concern, do not split. Subdirectories with one or two files create more friction than they save.

## The shape of the result

Reference docs sort into **layers** where each layer depends on the one below it:

1. **Foundation** — what the system *is*. Process model, data primitives, repository structure.
2. **Surfaces** — how anything reaches the system. Clients, routes, UIs, public APIs.
3. **Orchestration** — the long-running flows the system manages.
4. **Components** — who or what does the work (workers, modules, plugins).
5. **Services** — background subsystems that run out-of-band.

Not every project hits all five. Pick the layers that match the codebase's actual seams. Two layers is fine; six is suspicious.

The directory names should be the layer names, not numbered prefixes. `architecture/` reads better than `01-foundation/`. The reading order belongs in the index, not the directory name.

## Process

### 1. Survey

`ls` the target directory. Get a line count per file (`wc -l <dir>/*.md`) — wildly different sizes hint at distinct concerns.

Read every file. Skim is fine; you need the topic and the cross-references, not memorized content. Note for each file:

- The dominant concern (what subsystem or boundary does it document?).
- Outbound references to other files in the directory.
- Whether it's foundational (other docs depend on it) or leaf-level (nothing else depends on it).

### 2. Group

Sort files into 3–6 layers using the dependency rule: a file goes one layer above its highest dependency. If `commissions.md` references `daemon-infrastructure.md`, commissions is one layer above architecture.

When grouping is ambiguous, prefer the layer where a reader would *look for* the doc, not the layer that's technically most accurate. `git-and-branches.md` could be "operations" or "architecture" — readers looking for branch strategy think of it as foundational, so it's architecture.

Aim for 3–5 files per layer. A single-file layer is a smell — fold it into an adjacent one.

### 3. Verify cross-references

Grep the directory for `\.md` mentions. Determine whether references are:

- **Bare prose mentions** (`see commissions.md`) — these survive any move; readers grep.
- **Markdown links** (`[X](commissions.md)`) — these break when paths change. Decide whether to update them or leave them as bare names.

Leave bare prose references alone. If markdown links exist and are load-bearing, plan to update them after the move.

### 4. Move

Create subdirectories. `git mv` each file to its new home. Doing this with `git mv` (not plain `mv`) preserves rename detection in history — a future `git log --follow` works.

Batch moves into one commit's worth of work. Don't reorganize halfway.

### 5. Write the index

Create `README.md` (or `index.md`, matching project convention) at the top of the reorganized directory. The index is the load-bearing artifact — without it, the directories are just nested storage.

Index content:

- **Reading order**: one paragraph per layer, in dependency order, with "start here if…" guidance for each.
- **Layer dependencies**: state explicitly which layers depend on which. This is the rule that future moves must preserve.
- **What each directory holds**: bullet list per layer with a one-line description of every file. The description should answer "why would I open this" not "what's in this."
- **Conventions**: frontmatter expectations, cross-reference style, status discipline.

Keep the index under ~150 lines. If it grows past that, the reorganization has too many layers.

### 6. Verify

`find <dir> -type f` and confirm every file landed in a layer. `git status` and confirm rename detection caught the moves (look for "renamed:" not "deleted:" + "new file:").

Don't claim the reorganization is done until the index exists and reads cleanly top-to-bottom.

## Anti-patterns

- **Numbered directories** (`01-foundation/`, `02-surfaces/`). Forces a reading order that should live in the index. Renaming is also painful when a layer gets inserted between two others.
- **Single-file directories**. If a layer has one file, it isn't a layer. Fold it.
- **Topic-based grouping disguised as layering**. "Commissions and meetings each get their own directory" isn't layering — it's just nested topics. Layers come from dependency direction, not subject matter.
- **Skipping the index**. The directories are infrastructure; the index is the doc. Without it, readers face the same "where do I start" problem one level deeper.
- **Reorganizing without reading**. Pattern-matching on filenames produces incoherent groupings. Read the files.

## Done means

- Subdirectories exist and reflect dependency layers.
- Every file is in exactly one layer.
- The index reads top-to-bottom and tells a reader where to start.
- Cross-references still resolve (bare names grep cleanly; markdown links updated if they existed).
- `git status` shows renames, not delete+create pairs.
