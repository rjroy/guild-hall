---
title: "Commission: Wire up Create Commission from Artifact"
date: 2026-02-26
status: pending
tags: [commission]
worker: Developer
workerDisplayTitle: "Guild Developer"
prompt: "Wire up the stubbed \"Create Commission from Artifact\" section in `components/artifact/MetadataSidebar.tsx` (lines 98-105). Two pieces of work:

## 1. Associated Commissions List

Replace the hardcoded `EmptyState` with actual commission matches. The MetadataSidebar is rendered inside a server component (the artifact detail page), so you can scan commissions server-side.

- In the artifact detail page (`app/projects/[name]/artifacts/[...path]/page.tsx`), use `scanCommissions()` from `lib/commissions.ts` to find commissions whose `linked_artifacts` include the current artifact path. Pass matches as a prop to MetadataSidebar.
- Render matched commissions as links to their commission detail pages, with status gems.
- Keep the `EmptyState` as fallback when no commissions match.

## 2. Create Commission from Artifact Button

When clicked, navigate to the project page with query params that pre-populate the commission form:
- `?newCommission=true` to auto-open the `CreateCommissionButton` inline form
- `&dep=<artifact-path>` to pre-fill the dependencies field with the current artifact's `.lore/`-relative path

This means:
- The button in MetadataSidebar becomes a `Link` (or uses `useRouter`) pointing to the project page with those query params.
- `CreateCommissionButton.tsx` reads the `newCommission` search param to auto-expand the form on mount.
- `CommissionForm.tsx` reads the `dep` search param to pre-populate the dependencies field.

**Key constraints:**
- MetadataSidebar is currently a server component. If you need client interactivity for the button, extract just the button into a small client component or convert to a client component with the data passed as props.
- The artifact path prop should be the `.lore/`-relative path (e.g., `specs/my-spec.md`), matching what commission `linked_artifacts` use.
- Write tests for: commission matching logic, query param pre-population, and the link generation.
- Run `bun test` and `bun run typecheck` before declaring done."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-26T16:34:57.323Z
    event: created
    reason: "Commission created"
current_progress: ""
result_summary: ""
projectName: guild-hall
---
