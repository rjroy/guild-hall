# Meetings and Audiences

Guild Hall uses the word **audience** for a live meeting with a worker. In practice, the UI uses both terms: the project tab is called `Meetings`, while the dashboard panel is called `Pending Audiences`.

## Starting from pending audiences

New worker requests show up on the dashboard as cards in the `Pending Audiences` panel.

Each card can include:

- the worker identity and portrait
- the meeting agenda
- linked artifacts
- a deferred-until badge when the request was postponed

From the card, you can choose one of four actions:

- **Open** to accept the audience and jump into the live meeting
- **Defer** to schedule it for a later date
- **Ignore** to decline it
- **Quick Comment** to write a prompt that becomes a commission instead

<img src="../screenshots/gh-start-audience.webp" alt="Pending audience card with worker context and action buttons for opening or redirecting the request." width="1200">

## Meetings tab

Inside a project, the `Meetings` tab shows the audience history for that project. This is the place to review earlier sessions or reopen context around a current one.

<img src="../screenshots/gh-meetings.webp" alt="Project meetings tab listing audiences for a project." width="1200">

## Live meeting view

Opening an audience takes you to a dedicated meeting page. The header shows the project, worker, agenda, and model information. The main layout combines a chat area with a sidebar for linked artifacts and the close action.

<img src="../screenshots/gh-meeting-active-top.webp" alt="Top section of an active audience showing the meeting header and conversation area." width="1200">

As the session continues, the lower portion of the page keeps the linked artifacts visible and lets you close the audience when the conversation is complete.

<img src="../screenshots/gh-meeting-active-bottom.webp" alt="Lower section of an active audience showing linked artifacts and the Close Audience action." width="1200">

## What happens when you close an audience

Closing a meeting ends the live interaction and transitions the UI to a notes display. That gives you a clean handoff back to the project once the audience is finished.

If you later open the meeting artifact from the project, Guild Hall can route you back to the live audience while it is still open.

## Best use cases for audiences

Use an audience when you need:

- back-and-forth clarification
- fast exploration with a specialist worker
- a conversation that might link new artifacts while it runs

If the work is better described as a standalone task with a durable lifecycle, use a commission instead.

## Code references

- Pending audience card actions: [`web/components/dashboard/MeetingRequestCard.tsx`](../../web/components/dashboard/MeetingRequestCard.tsx)
- Meeting route: [`web/app/projects/[name]/meetings/[id]/page.tsx`](../../web/app/projects/[name]/meetings/[id]/page.tsx)
- Meeting view composition: [`web/components/meeting/MeetingView.tsx`](../../web/components/meeting/MeetingView.tsx)
- Project hub route: [`web/app/projects/[name]/page.tsx`](../../web/app/projects/[name]/page.tsx)
