---
title: "Cross-Commission Artifact Graph"
date: 2026-03-20
status: open
author: Celeste
tags: [brainstorm, artifacts, provenance, daemon-api, ui]
parent: whats-missing-2026-03-20.md
---

# Cross-Commission Artifact Graph

## Evidence

Commissions declare `linked_artifacts` in their frontmatter, listing paths to files they consumed or produced. The commission record ops at `daemon/services/commission/record.ts` track this. The web UI shows linked artifacts as a list in the commission detail view.

What's missing is the reverse lookup: given an artifact, which commissions created it, modified it, or consumed it? And by extension: given a commission, what was its full upstream and downstream artifact chain?

This matters because the spec/plan/implement/review chain is the system's primary workflow. A spec artifact is consumed by a plan commission, which produces a plan artifact consumed by an implementation commission. But nothing links these together beyond the user's memory. The commission detail page shows "this commission linked these artifacts" but not "these other commissions also reference this artifact."

The artifact detail page (`web/app/projects/[name]/artifacts/[...path]/page.tsx`) shows the artifact content but has no "Referenced by" section. The earlier brainstorm (`whats-next-2026-03-17.md`, Proposal 4) proposed `created_by` frontmatter stamping. This proposal goes further: not just "who created this" but "what chain of work produced and consumed this artifact."

## Proposal

Build a reverse index from artifacts to commissions:

1. **At commission completion**, the orchestrator already knows `linked_artifacts`. Emit this as part of the `commission_result` event (already emitted). No new data needed.

2. **Add `GET /workspace/artifacts/:path/references`** that scans commission artifacts for any that link to the given path. Return commission IDs, worker names, and whether the commission created or consumed the artifact.

3. **Show a "Referenced by" section in the artifact detail web view.** Below the artifact content, list commissions that link to this artifact with their status and worker.

4. **In the commission detail view, make linked artifacts bidirectional.** Each linked artifact shows its own references, so the user can trace the chain: "this spec was consumed by these plan and implementation commissions."

## Rationale

Vision Principle 1 says artifacts are the work. But artifacts in isolation are documents. Artifacts connected by the commissions that produced and consumed them are a knowledge graph. The user can trace how a brainstorm became a spec, became a plan, became code, was reviewed, and was fixed. That provenance chain is the story of how the system worked. Right now, reconstructing it requires reading each commission's frontmatter manually.

## Vision Alignment

1. **Anti-goal check:** No conflict.
2. **Principle alignment:** Principle 1 (Artifacts Are the Work) is the primary alignment. Artifacts become navigable as a graph, not just a directory tree. Principle 3 (Files Are Truth) is preserved: the index is derived from existing frontmatter, not a separate store.
3. **Tension resolution:** Files (3) vs. Performance: scanning all commissions per artifact query is O(n). For projects with hundreds of commissions, an in-memory index built from event emissions (like the briefing cache pattern) avoids repeated scans.
4. **Constraint check:** All data exists. Commission artifacts already contain `linked_artifacts`. The reverse lookup is a new read pattern over existing data.

## Scope

Medium. Route handler, reverse index, web UI component. The index could be as simple as a Map built at daemon startup from a commission scan.
