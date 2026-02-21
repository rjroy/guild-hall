---
title: "Fix 1,030 ESLint errors from Phase 1"
date: 2026-02-21
status: draft
tags: [lint, typescript, testing, phase-1]
---

# Fix ESLint Errors

## Context

Phase 1 implementation produced 1,030 ESLint errors. 1,028 are in test files because bun's test globals (`describe`, `it`, `expect`, `beforeEach`, `afterEach`) aren't type-resolved. ESLint's `recommendedTypeChecked` rules flag every call as `no-unsafe-call`. The remaining 2 are real type issues in `components/artifact/ArtifactContent.tsx`.

## Breakdown

| Category | Count | Root Cause |
|----------|-------|-----------|
| `no-unsafe-call` in tests | 731 | Missing bun test type declarations |
| `no-unsafe-member-access` in tests | 285 | Missing bun test type declarations |
| `no-unsafe-assignment` in tests | 6 | Missing bun test type declarations |
| `no-unsafe-argument` in tests | 3 | Missing bun test type declarations |
| `no-unused-vars` in tests | 1 | Unused `Artifact` import |
| `require-await` in tests | 1 | Async function without await |
| `no-unsafe-assignment` in source | 1 | `response.json()` returns `any` |
| `no-misused-promises` in source | 1 | Async handler on `onClick` |

## Fix

### Step 1: Install `@types/bun` and add to tsconfig

```bash
bun add -D @types/bun
```

Add `"types": ["bun-types"]` to tsconfig.json `compilerOptions`. This gives TypeScript (and ESLint's type-checker) declarations for bun's test globals, `Bun` runtime API, and Node.js compatibility layer.

**Files**: package.json, tsconfig.json, bun.lock

### Step 2: Fix 2 source errors in ArtifactContent.tsx

**Line 56** (`no-unsafe-assignment`): `response.json()` returns `Promise<any>`. Fix by typing the catch fallback:

```tsx
const data: unknown = await response.json().catch(() => ({}));
const errorMessage = (data && typeof data === 'object' && 'error' in data)
  ? String((data as { error: unknown }).error)
  : 'Save failed';
throw new Error(errorMessage);
```

**Line 89** (`no-misused-promises`): `onClick={handleSave}` where `handleSave` is async. Fix by wrapping in a void-returning function:

```tsx
onClick={() => void handleSave()}
```

**File**: components/artifact/ArtifactContent.tsx

### Step 3: Fix remaining test file errors (if any survive Step 1)

After `@types/bun` resolves the test globals, check if any errors remain. Likely candidates:
- The `no-unused-vars` for `Artifact` import (probably a dead import in a test file from a refactor)
- The `require-await` for an async function without await (probably a test helper)

Fix each individually.

### Step 4: Verify

```bash
bun run lint    # should be 0 errors
bun test        # should still be 171 pass
bun run build   # should compile clean
```

## Files Modified

- `package.json` (add @types/bun dev dep)
- `tsconfig.json` (add types)
- `bun.lock` (updated)
- `components/artifact/ArtifactContent.tsx` (2 type fixes)
- Possibly 1-2 test files for straggler errors
