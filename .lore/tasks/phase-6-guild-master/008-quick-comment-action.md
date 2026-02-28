---
title: Add Quick Comment compound action to meeting request cards
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/foundation/phase-6-guild-master.md
related: [.lore/specs/guild-hall-views.md]
sequence: 8
modules: [guild-hall-ui, next-api]
---

# Task: Add Quick Comment Compound Action to Meeting Request Cards

## What

Compound UI action: user clicks Quick Comment on a meeting request, writes a prompt, and the system declines the meeting and creates a commission from its artifacts.

**MeetingRequestCard.tsx update:**

Add a fourth action button: "Quick Comment." Clicking it reveals an inline text input (prompt textarea) and a "Send" button, following the same reveal pattern as the defer date picker already in the component. User writes a commission prompt and clicks Send.

**app/api/meetings/[meetingId]/quick-comment/route.ts (new):**

POST handler that performs the compound operation atomically:
1. Read the meeting request artifact to get `worker` and `linked_artifacts`.
2. POST to daemon `POST /commissions` with: title derived from first ~50 chars of prompt, worker from the meeting request, prompt from the user, dependencies from the meeting's linked_artifacts.
3. POST to daemon `POST /meetings/<meetingId>/decline` with the project name.
4. Return `{ commissionId }`.

**Atomicity**: If commission creation fails, do NOT decline the meeting. If decline fails after commission creation, log a warning but return the commission ID (the commission is the valuable output; the meeting request can be manually declined).

**Client behavior:** On success, navigate to the new commission view.

**No new daemon endpoints.** The API route calls existing daemon endpoints (`POST /commissions` and `POST /meetings/:id/decline`). The compound logic lives in the Next.js API route.

## Validation

- MeetingRequestCard renders a "Quick Comment" button alongside Open, Defer, Ignore
- Clicking Quick Comment reveals an inline prompt textarea and Send button
- Submitting calls the `/api/meetings/<id>/quick-comment` endpoint with prompt and project name
- API route creates a commission with the correct worker and linked artifacts from the meeting request
- API route declines the meeting request after successful commission creation
- Commission creation failure: meeting request is NOT declined (atomicity)
- Decline failure after commission creation: logs warning, returns commission ID anyway
- Client navigates to the new commission view on success
- All tests pass, linting clean, commit created (triggers pre-commit hook validation)

## Why

From `.lore/specs/guild-hall-views.md`:
- REQ-VIEW-13: "Quick Comment: Convert the request into a commission. The user provides a prompt; the system declines the meeting and creates a commission with the prompt and the meeting request's referenced artifacts as dependencies."

## Files

- `components/dashboard/MeetingRequestCard.tsx` (modify)
- `components/dashboard/MeetingRequestCard.module.css` (modify)
- `app/api/meetings/[meetingId]/quick-comment/route.ts` (create)
- `tests/components/dashboard/MeetingRequestCard.test.tsx` (modify)
- `tests/app/api/meetings/quick-comment.test.ts` (create)
