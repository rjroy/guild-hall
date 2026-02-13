---
title: Session delete with confirmation dialog
date: 2026-02-13
status: executed
tags: [feature, crud, dialog, session-management]
modules: [session-store, api-routes, board-panel, confirm-dialog]
related: [.lore/retros/session-delete.md]
---

# Plan: Session Delete with Confirmation Dialog

## Context

Sessions accumulate over time and users need a way to clean up old ones. This adds a delete button to each session card on the Board, protected by a reusable confirmation dialog. The confirmation dialog is extracted from the existing `CreateSessionDialog` pattern (backdrop, escape-to-close, click-outside, aria attributes) but generalized to: title, message, two configurable buttons.

## Changes

### 1. ConfirmDialog component

New file: `components/ui/ConfirmDialog.tsx` and `components/ui/ConfirmDialog.module.css`

Props:
- `open: boolean`
- `title: string`
- `message: string`
- `confirmLabel: string` (e.g. "Delete")
- `cancelLabel?: string` (defaults to "Cancel")
- `variant?: "default" | "destructive"` (controls confirm button color)
- `onConfirm: () => void`
- `onCancel: () => void`

Extracts the dialog shell from `CreateSessionDialog`: backdrop click-outside, Escape key, aria-modal, header/body/footer layout. CSS reuses the same variables (no new design tokens). Destructive variant uses `--error-text` / `--error-border` for the confirm button.

### 2. SessionStore.deleteSession

**`lib/session-store.ts`**: Add `rmdir(path: string): Promise<void>` to `SessionFileSystem` interface. Add `deleteSession(id: string): Promise<void>` method that removes the session directory. Throws if the session doesn't exist (verified via `access` check first).

**`lib/node-session-store.ts`**: Implement `rmdir` as `fs.rm(path, { recursive: true, force: true })`.

**`tests/helpers/mock-session-fs.ts`**: Add `rmdir` to the mock that removes the directory and all files with that path prefix from the maps.

### 3. DELETE API route

**`app/api/sessions/[id]/route.ts`**: Add `DELETE` handler alongside the existing `GET`. Calls `sessionStore.deleteSession(id)`. Returns 204 on success, 404 if session not found. Guard against path traversal (reject IDs containing `..` or `/`).

### 4. Delete button on SessionCard

**`components/board/SessionCard.tsx`**: Add optional `onDelete?: (id: string) => void` prop. When provided, render a delete button (small, right-aligned in the top row or as a subtle icon). The button's click handler calls `e.preventDefault()` + `e.stopPropagation()` to prevent the Link from navigating, then invokes `onDelete(session.id)`.

**`components/board/SessionCard.module.css`**: Style the delete button: subtle by default, visible on card hover. Uses existing `--foreground-muted` / `--error-text` variables.

### 5. Wire it up in BoardPanel

**`components/board/BoardPanel.tsx`**:
- Add state: `deleteTarget: SessionMetadata | null` (session pending confirmation)
- Pass `onDelete` to each `SessionCard` that sets the target
- Render `ConfirmDialog` with title "Delete session?", message including session name, confirm "Delete", variant "destructive"
- On confirm: call `DELETE /api/sessions/{id}`, refresh session list, clear target
- On cancel: clear target

### 6. Tests

**`tests/lib/session-store.test.ts`**: Add `deleteSession` tests:
- Deletes directory and all contents (verify files/dirs removed from mock)
- Created session is gone from `listSessions` after delete
- Throws for nonexistent session
- Does not affect other sessions

**`tests/api/sessions.test.ts`**: Add delete-equivalent tests via store:
- Delete returns successfully (204 equivalent)
- Delete of nonexistent session fails (404 equivalent)
- Deleted session no longer appears in list

## Files to modify
- `lib/session-store.ts` (add `rmdir` to interface, add `deleteSession`)
- `lib/node-session-store.ts` (implement `rmdir`)
- `tests/helpers/mock-session-fs.ts` (add `rmdir` to mock)
- `app/api/sessions/[id]/route.ts` (add DELETE handler)
- `components/board/SessionCard.tsx` (add delete button)
- `components/board/SessionCard.module.css` (delete button styling)
- `components/board/BoardPanel.tsx` (delete state + ConfirmDialog wiring)

## Files to create
- `components/ui/ConfirmDialog.tsx`
- `components/ui/ConfirmDialog.module.css`

## Verification
1. `bun test` passes (existing + new tests)
2. Manual: Board shows delete button on session cards, click shows confirm dialog, confirm deletes and refreshes list, cancel dismisses
3. Manual: Escape key and backdrop click dismiss the dialog
4. Manual: Deleting a session removes its directory from `sessions/`
