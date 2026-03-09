---
name: cleanup-commissions
description: Review completed commission artifacts as a batch, extract loose threads into a retro, and delete the commission files. Use after a feature's implement-review-fix cycle completes, before creating a PR, or when .lore/commissions/ has accumulated files that no longer represent active work. Triggers include "clean up commissions", "commission cleanup", "review commissions", "batch cleanup".
---

# Cleanup Commissions

Review completed commission artifacts as a batch, extract loose threads into a retro, and delete the commission files. Git history preserves the originals.

## Core Principle

Commissions form work chains: issue, spec, plan, implement, review, fix. A finding in one commission is usually consumed by the next in the chain. Don't extract things that were already addressed. The only value worth preserving is:

1. **Loose threads** - findings that fell off the chain (deferred and never picked up)
2. **Infrastructure patterns** - systemic issues in the commission system itself
3. **Cross-cutting lessons** - patterns visible only when reviewing the full batch

## Process

### 1. Inventory

Scan all files in `.lore/commissions/`. For each, capture:
- Worker name, date, title, status, type (from frontmatter)
- Whether it completed, failed, or was abandoned

**Skip artifacts with `type: scheduled`.** Scheduled commission artifacts are recurring schedule definitions, not individual work units. Only `type: one-shot` (or no type field, which defaults to one-shot) artifacts are eligible for cleanup.

Spawned commissions (one-shot artifacts with a `source_schedule` field) are eligible for cleanup. The `source_schedule` field provides provenance context, which is useful for grouping spawned commissions by their parent schedule when reviewing the batch.

Group by chronological order. Commissions dispatched within minutes of each other are typically a batch from the Guild Master.

### 2. Read the Sequence

Read commissions in chronological order, grouped by feature chain. A chain is a set of commissions working on the same feature (linked by shared artifacts, sequential timestamps, or explicit references).

For each chain, track:
- What was the goal?
- What findings were raised?
- Which findings were addressed by later commissions in the chain?
- Which findings were explicitly triaged (marked "skip", "low priority", "track separately")?
- Which findings have no follow-up at all?

Use sub-agents to parallelize reading across workers when the batch is large (10+ commissions). Split by worker name since each worker's commissions are semi-independent. Instruct agents to look for loose threads specifically, not to summarize every commission.

### 3. Cross-Reference

For findings marked "track separately" or "file as issue", check if:
- An issue exists in `.lore/issues/` covering that finding
- The finding was incorporated into a spec (check `.lore/specs/`)
- A later commission in a different chain addressed it

This step prevents false positives. Many "loose threads" were actually handled through a different path.

### 4. Identify Infrastructure Issues

Look for patterns across the batch that indicate commission system bugs:
- Duplicate timeline events (e.g., double `status_completed`)
- Result body truncation (body doesn't match `result_submitted` event)
- Duplicate `linked_artifacts` entries
- Failed commissions with no diagnostics
- Duplicate dispatches (same work commissioned twice)

These are worth noting even if individual instances are minor.

### 5. Write Retro

Produce a single retro for the entire batch at `.lore/retros/commission-cleanup-[date].md`.

Structure:

```markdown
---
title: Commission batch cleanup ([date range])
date: [today]
status: complete
tags: [retro, commissions, cleanup]
---

## Context

[How many commissions, which workers, what time span. One paragraph.]

## What Worked

[Patterns that produced good results. Keep brief.]

## Loose Threads

[Findings that fell off work chains. Group by feature or theme. Include enough context to act on each one.]

## Infrastructure Issues

[Commission system bugs observed. Skip if none.]

## Lessons

[Cross-cutting insights.]
```

Omit any section that has no content. A batch where everything was consumed cleanly should have a short retro.

### 6. Confirm and Delete

Present the retro summary to the user. Ask for confirmation before deleting.

On confirmation, delete all commission files in `.lore/commissions/`. Remove the files, not the directory.

### 7. File Issues (Optional)

If the retro surfaces loose threads that need tracking, ask the user which ones warrant issues. For each confirmed one, write directly to `.lore/issues/`.

## What This Skill Does NOT Do

- **Does not extract every finding.** Most findings were consumed by subsequent commissions. Extracting them would duplicate work that already landed in code, specs, or issues.
- **Does not archive.** Git history is the archive. Keeping old commission files in an archive directory adds clutter without value.
- **Does not run automatically.** Commission cleanup requires judgment about what's a loose thread vs. what was intentionally deferred.

## Scaling

For small batches (under 10 commissions), read them sequentially.

For larger batches (10+), dispatch parallel sub-agents by worker name. Each agent reads its worker's commissions and returns: addressed findings (brief), loose threads (detailed), failures, and patterns. Synthesize agent results before writing the retro.
