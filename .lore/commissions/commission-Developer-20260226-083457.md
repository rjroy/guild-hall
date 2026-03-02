---
title: "Commission: Wire up Create Commission from Artifact"
date: 2026-02-26
status: completed
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
linked_artifacts:
  - components/artifact/MetadataSidebar.tsx

  - components/artifact/MetadataSidebar.module.css
  - app/projects/[name]/artifacts/[...path]/page.tsx
  - app/projects/[name]/page.tsx
  - components/commission/CreateCommissionButton.tsx
  - components/commission/CommissionForm.tsx
  - tests/components/metadata-sidebar.test.ts
  - tests/components/commission-form.test.tsx
  - components/artifact/MetadataSidebar.module.css
  - app/projects/[name]/artifacts/[...path]/page.tsx
  - app/projects/[name]/page.tsx
  - components/commission/CreateCommissionButton.tsx
  - components/commission/CommissionForm.tsx
  - tests/components/metadata-sidebar.test.ts
  - tests/components/commission-form.test.tsx
activity_timeline:
  - timestamp: 2026-02-26T16:34:57.323Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-26T16:34:57.359Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-26T16:34:57.361Z
    event: status_in_progress
    reason: "Worker process started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-26T16:35:03.501Z
    event: progress_report
    reason: "Starting work: reading key files to understand current implementation before making changes."
  - timestamp: 2026-02-26T16:36:10.838Z
    event: progress_report
    reason: "Read all key files. Starting implementation: MetadataSidebar updates first, then wiring the artifact page, project page, and form components."
  - timestamp: 2026-02-26T16:38:08.449Z
    event: progress_report
    reason: "All source changes complete. Now writing tests for: commission matching logic, createCommissionHref link generation, query param pre-population in CreateCommissionButton/CommissionForm."
  - timestamp: 2026-02-26T16:40:17.855Z
    event: result_submitted
    reason: "Wired up the \"Create Commission from Artifact\" section in MetadataSidebar with both features:\n\n**1. Associated Commissions List:**\n- Artifact detail page (`app/projects/[name]/artifacts/[...path]/page.tsx`) now calls `scanCommissions()` and filters by `linked_artifacts.includes(relativePath)`, passing matches to MetadataSidebar\n- MetadataSidebar renders matched commissions as links with status gems (GemIndicator), falling back to EmptyState when none match\n- Each commission links to `/projects/<name>/commissions/<id>`\n\n**2. Create Commission from Artifact Button:**\n- Replaced the disabled stub button with a `Link` to the project page with query params: `?tab=commissions&newCommission=true&dep=<encoded-artifact-path>`\n- `CreateCommissionButton` accepts `defaultOpen` prop (read from `newCommission` search param by the project page) to auto-expand the form\n- `CommissionForm` accepts `initialDependencies` prop (passed through from `dep` search param) to pre-populate the dependencies field\n- Pure `createCommissionHref()` function exported for testability\n\n**Tests:** 1527 pass, 0 fail. New tests cover: `createCommissionHref` link generation (4 tests), MetadataSidebar commission rendering (7 tests), commission matching by linked_artifacts (4 tests), and updated type contracts for CreateCommissionButton/CommissionForm props.\n\n**Typecheck:** Clean pass."
  - timestamp: 2026-02-26T16:40:32.270Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-02-26T16:40:32.316Z
    event: status_completed
    reason: "Worker completed successfully"
current_progress: "All source changes complete. Now writing tests for: commission matching logic, createCommissionHref link generation, query param pre-population in CreateCommissionButton/CommissionForm."
result_summary: "Wired up the \"Create Commission from Artifact\" section in MetadataSidebar with both features:\n\n**1. Associated Commissions List:**\n- Artifact detail page (`app/projects/[name]/artifacts/[...path]/page.tsx`) now calls `scanCommissions()` and filters by `linked_artifacts.includes(relativePath)`, passing matches to MetadataSidebar\n- MetadataSidebar renders matched commissions as links with status gems (GemIndicator), falling back to EmptyState when none match\n- Each commission links to `/projects/<name>/commissions/<id>`\n\n**2. Create Commission from Artifact Button:**\n- Replaced the disabled stub button with a `Link` to the project page with query params: `?tab=commissions&newCommission=true&dep=<encoded-artifact-path>`\n- `CreateCommissionButton` accepts `defaultOpen` prop (read from `newCommission` search param by the project page) to auto-expand the form\n- `CommissionForm` accepts `initialDependencies` prop (passed through from `dep` search param) to pre-populate the dependencies field\n- Pure `createCommissionHref()` function exported for testability\n\n**Tests:** 1527 pass, 0 fail. New tests cover: `createCommissionHref` link generation (4 tests), MetadataSidebar commission rendering (7 tests), commission matching by linked_artifacts (4 tests), and updated type contracts for CreateCommissionButton/CommissionForm props.\n\n**Typecheck:** Clean pass."
projectName: guild-hall
---
