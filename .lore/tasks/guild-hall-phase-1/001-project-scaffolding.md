---
title: Scaffold Next.js project with core dependencies
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 1
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/guild-hall-phase-1.md
---

# Task: Scaffold Next.js project with core dependencies

## What

Create the Next.js application using `bunx create-next-app@latest` with App Router and TypeScript. Configure:

- `tsconfig.json` with strict mode and `@/` path alias
- `eslint.config.mjs` with typescript-eslint flat config and projectService
- `.gitignore` for Next.js, bun, `.env`, `sessions/` contents, `guild-members/` contents
- CLAUDE.md with project conventions (bun, no mock.module(), dependency injection, testing patterns)

Install dependencies:
- Production: `@anthropic-ai/claude-agent-sdk`, `zod`
- Dev: `typescript`, `bun-types`, `typescript-eslint`, `eslint`, `prettier`

Create placeholder `app/layout.tsx` and `app/page.tsx`. Create empty `guild-members/` and `sessions/` directories with `.gitkeep` files.

Use CSS modules for styling (no Tailwind).

## Validation

- `bun run dev` starts the Next.js dev server without errors
- `bun run lint` passes with no warnings
- TypeScript strict mode is enabled and `bun run tsc --noEmit` passes
- CLAUDE.md exists with project conventions documented
- `.gitignore` excludes `.env`, `node_modules`, `.next`, `sessions/*` (but not sessions/.gitkeep), `guild-members/*/` runtime artifacts

## Why

REQ-GH1-1: "The application is a Next.js app with API routes serving as the backend. Single TypeScript codebase for frontend and backend."

REQ-GH1-4: "The application runs on localhost only. No authentication."

## Files

- `package.json` (create)
- `tsconfig.json` (create)
- `next.config.ts` (create)
- `eslint.config.mjs` (create)
- `.gitignore` (modify)
- `CLAUDE.md` (create)
- `app/layout.tsx` (create)
- `app/page.tsx` (create)
