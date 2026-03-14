---
title: Meetings List Preview Text
date: 2026-03-10
status: resolved
tags: [brainstorm, ux, meetings]
related:
  - .lore/issues/meetings-list-no-preview.md
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/meetings/meeting-rename.md
---

# Brainstorm: Meetings List Preview Text

## The Actual Problem, Stated Plainly

The meetings tab for guild-hall shows entries like this:

```
● closed  Audience with Guild Master  2026-03-10  Guild Master
● closed  Audience with Guild Master  2026-03-10  Guild Master
● closed  Audience with Guild Master  2026-03-09  Guild Master
● closed  Audience with Guild Master  2026-03-09  Guild Master
```

You cannot distinguish them without clicking into each one. The date alone is not enough when multiple meetings happen the same day. The issue file notes one exception: a meeting titled "Commission dependency graph unreadable on project page" - that one stands out because its title carries context.

The real question is: what data could make each entry self-describing, and how much does it cost to surface it?

---

## What Data Exists in the Artifact

Reading the actual meeting files reveals:

```yaml
title: "Audience with Guild Master"      # default, or renamed by worker
agenda: "Review open lore/issues"        # always present, set at creation
worker: Guild Master                     # always present
workerDisplayTitle: "Guild Master"       # always present
date: 2026-03-10                         # always present
status: closed                           # always present
linked_artifacts: []                     # sometimes populated
meeting_log:                             # always present
  - event: renamed
    reason: "Renamed to: ..."            # appears only if worker renamed
```

The markdown body (after frontmatter) is the meeting notes summary - written on close, rich text, can be hundreds of words.

**Key data availability facts:**
- `agenda` is set at creation time and is always present. For user-initiated meetings, it's what the user typed. For worker-requested meetings, it's the worker's stated reason.
- `title` defaults to "Audience with [Worker]" but changes if the worker calls `rename_meeting`. The rename shows in `meeting_log` as a `renamed` event.
- Meeting notes (body) are generated on close. Open meetings have an empty body.
- There is no "first message" stored in the artifact. The transcript lives in `~/.guild-hall/meetings/<id>.md` and is ephemeral - deleted on meeting close.

### The Type Mismatch: Artifact vs MeetingMeta

There are two ways meetings are read:

1. `scanArtifacts()` → returns `Artifact[]` with `meta.extras` containing `agenda`, `worker`, `workerDisplayTitle` etc. as unknown extra frontmatter fields
2. `scanMeetings()` / `readMeetingMeta()` → returns `MeetingMeta[]` with typed `agenda`, `worker`, etc. fields

The `MeetingList` component receives `Artifact[]` (from `scanArtifacts` on the meetings directory). It accesses `meeting.meta.extras?.worker` for the worker name. Agenda is not currently extracted - it's buried in `meeting.meta.extras?.agenda`, accessible but ignored.

`MeetingRequestCard` (on the dashboard) receives `MeetingMeta` and already renders `request.agenda` prominently. That's why meeting requests show useful context but the list doesn't: different data shapes, different components, different fields being rendered.

---

## Option Analysis

### Option A: Renamed Title as Primary Display Signal

**What it does:** When `meeting.meta.title` is not the default "Audience with [Worker]" pattern, it's a renamed title. Display it prominently. Otherwise fall back to the default.

**What's already in place:** The `meetingTitle()` function in `MeetingList.tsx` already reads `meeting.meta.title` and falls back to the filename stem. The `rename_meeting` tool already writes a new value into `title` frontmatter. This path is essentially built - just not visible because the title slot currently treats default and renamed values identically.

**The gap:** For user-initiated meetings that were never renamed, you still get "Audience with Guild Master" repeated. Rename only fires when a worker chooses to call it (and workers need posture-level guidance to do this reliably). There's no guarantee of rename for every meeting.

**What would help alongside this:** If the title has been changed from default (detectable by checking if `title === "Audience with [workerDisplayTitle]"`), render it in a visually distinct way - larger text, different color, or without the redundant worker badge. This rewards workers that rename and makes renamed meetings immediately findable.

**Cost:** Nearly zero. The data is already there. It's a CSS/rendering change at most.

---

### Option B: Agenda as Subtitle (Strongest Practical Fix)

**What it does:** Extract `meeting.meta.extras?.agenda` from each artifact and render it as a secondary line under the title.

**Reliability:** Agenda is set at meeting creation and is always present - both for user-initiated meetings (agenda = user's initial prompt text) and worker-requested meetings (agenda = worker's stated reason). Looking at real data:

- `"Work through some of the issues."` - vague, but better than nothing
- `"Review open lore/issues"` - useful
- `"I want to improve memory-injector.ts"` - immediately tells you what the meeting was about
- `".lore/specs/ui/graph-scrollable-container.md"` - a spec path, which is a meaningful reference
- The long agenda from the brainstorm request - very descriptive

The quality varies. User-initiated meeting agendas are whatever the user typed when starting the meeting. Worker-requested agendas are the worker's stated purpose, which tends to be more structured (the worker is writing for future context, not just typing a prompt). Short agenda strings like "Review open lore/issues" are acceptable as subtitles - they're better than nothing.

**Access cost:** `meeting.meta.extras?.agenda` is already in the `Artifact` type via the `extras` catch-all. No new file reads needed. It's parsed as part of `scanArtifacts` already.

**Truncation:** Agendas can be long (the brainstorm request agenda is 400+ characters). The subtitle needs a character limit, maybe 120 chars, with ellipsis.

**Cost:** Low. Add one line of data extraction and one `<p>` element in `MeetingList.tsx`. Add a `.subtitle` CSS class. Done.

---

### Option C: First Message Preview

**What it does:** Read the transcript file and extract the first user message or first assistant response as a preview.

**Why this is the wrong path:**

1. Transcripts are ephemeral. They live at `~/.guild-hall/meetings/<id>.md` and are deleted when a meeting closes. For closed meetings (which are the ones you need to distinguish in a long list), the transcript is gone. You would be previewing nothing for the majority of entries.

2. For open meetings, the transcript exists but reading it adds a file read per meeting on page load. The project page already does multiple filesystem reads (artifacts, meetings from integration worktree, meetings from active worktrees). Adding transcript reads for each open meeting compounds the cost.

3. Meeting notes (the markdown body of the artifact) are written to the artifact on close. These exist for closed meetings and could serve as a preview. But they're often hundreds of words of dense summary. The first sentence of a meeting notes summary is not necessarily the right preview - it might be "The session reviewed recent work on the manager toolbox, a coordination layer exclusive to the Guild Master worker."

**If you really want preview text from notes:** Truncate `meeting.content` (the body parsed by `scanArtifacts`) to 120 chars and show it as a subtitle only when no agenda is present. This avoids the transcript problem since notes are in the artifact itself. But `scanArtifacts` currently does not read body content for use in list rendering - it parses it but the list only uses `meta`.

**Verdict:** First message preview is not viable for the common case (closed meetings). Notes preview is viable but noisier than agenda text. Agenda is cleaner.

---

### Option D: Unifying Around Renamed Title (The Clean Design)

**The insight:** The rename spec says workers should give meetings descriptive names. Meeting requests already get their purpose from the filename slug (e.g., `meeting-request-20260310-200437-quick-brainstorm-on-lore-issues-meetings`). The issue is that most ordinary audience meetings never get renamed.

**What if renamed title replaced the worker name when present?**

Current layout:
```
[gem]  Audience with Guild Master          2026-03-10  Guild Master
```

Proposed layout when title has been renamed:
```
[gem]  Commission dependency graph unreadable  2026-03-10
```
The worker name is redundant when the title already carries meaning. Drop or demote it.

Proposed layout when title is still the default:
```
[gem]  Audience with Guild Master          2026-03-10
       Review open lore/issues                            ← agenda subtitle
```

This is a two-tier approach: renamed meetings surface their title prominently, un-renamed meetings fall back to the agenda. Neither requires reading any file that isn't already being read.

**Detection logic for "is this still a default title":**
```typescript
function isDefaultTitle(meeting: Artifact): boolean {
  const title = meeting.meta.title;
  const worker = meeting.meta.extras?.workerDisplayTitle as string | undefined;
  if (!worker) return false;
  return title === `Audience with ${worker}`;
}
```
This gives you a clean flag for "this meeting was never renamed."

---

### Option E: Sort and Group Strategies

Grouping by worker won't help when most meetings are with the same worker (the Guild Master scenario described in the issue). But a few strategies could complement preview text:

**By date bucket:** Add a visual separator or section header for "Today", "This week", "Older". This reduces the collision surface - even if two Guild Master meetings look identical in their titles, they'd be in different temporal sections. Low implementation cost (a pure rendering change), moderate UX improvement.

**By named vs unnamed:** Sort or visually separate renamed meetings (which have real titles) from default-titled meetings. Helps users find previously named meetings faster.

**Neither replaces preview text for un-renamed meetings.** They're complementary, not substitutes.

---

## The Data Flow Gap: Artifact vs MeetingMeta

This is worth calling out explicitly because it affects any fix.

`MeetingList` receives `Artifact[]`. The `agenda` field is not in `ArtifactMeta` - it's an extras field. Accessing it requires `meeting.meta.extras?.agenda` with a type cast.

`MeetingRequestCard` receives `MeetingMeta`. The `agenda` field is typed, directly accessible as `request.agenda`.

**Fix options for the data gap:**

1. **Access extras directly in MeetingList.** `const agenda = typeof meeting.meta.extras?.agenda === "string" ? meeting.meta.extras.agenda : undefined`. Verbose but works without changing types.

2. **Add `agenda` to `ArtifactMeta`.** Add it to the typed fields in `parseMeta()`. This is cleaner but adds meeting-specific knowledge to a generic type. The `KNOWN_KEYS` set in `artifacts.ts` currently doesn't include `agenda` - it goes to `extras`. Moving it to known keys would mean it's extracted and typed.

3. **Switch MeetingList to use MeetingMeta instead of Artifact.** The project page already has `scanMeetings` available. Switch the meetings tab to use `MeetingMeta[]` instead of `Artifact[]`. MeetingMeta has `agenda`, `title`, `worker`, `workerDisplayTitle` all typed. The tradeoff: `MeetingMeta` doesn't include `content` (the notes body) or `relativePath` in the same shape.

Option 1 is the path of least resistance for a targeted fix. Option 3 is the cleaner architecture but requires more plumbing changes.

---

## Decision

**Agenda as truncated subtitle.** Extract `meeting.meta.extras?.agenda`, truncate at ~120 chars, render as a muted secondary line under the title in `MeetingList`. This is the load-bearing fix.

Options B (agenda subtitle) was selected. Options A (renamed title distinction), D (two-tier renamed + agenda), and E (grouping) remain valid complements but are not part of this decision. Option C (first message preview) is rejected: transcripts are deleted on close.

**What not to do:**

- Do not pursue first-message preview. Transcripts are gone for closed meetings.
- Do not add date-bucket grouping as the primary fix. It helps but doesn't solve the identity problem.
- Do not switch to MeetingMeta wholesale unless you're ready to refactor the whole data path.

---

## Why Meeting Requests Already Look Better

`MeetingRequestCard` renders `request.agenda` as `<p className={styles.agenda}>{request.agenda}</p>`. It uses `MeetingMeta` which has `agenda` as a typed field. The card also shows the worker portrait, worker name, and linked artifacts.

The meetings list uses `Artifact[]` with none of that richness surfaced. The fix is simply applying the same display logic to the list that already exists in the request card.

---

## Risk Inventory

| Risk | Likelihood | Impact |
|------|------------|--------|
| Agendas are too short/vague to be useful subtitles | Medium | Low - even "Review lore issues" is better than nothing |
| extras casting breaks with malformed frontmatter | Low | Low - defensive casting with fallback to undefined |
| Long agendas overflow the layout | Medium | Low - truncation handles it |
| Rename is unreliable if workers don't do it | High | Medium - reason agenda fallback is the actual load-bearing fix |
| Switching to MeetingMeta introduces sort-order bugs | Low if done carefully | High - the sort logic for meetings uses Artifact[] currently |

---

## Summary of Options by Cost and Value

| Option | Cost | Value | Verdict |
|--------|------|-------|---------|
| Agenda as subtitle | Very low | High | Do it |
| Renamed title visual distinction | Very low | Medium | Do it alongside agenda |
| Worker name as conditional | Low | Low | Optional, good polish |
| Date bucket grouping | Low | Medium | Nice-to-have, not primary fix |
| First message preview | High (transcript issues) | Low (missing for closed) | Don't do it |
| Notes body preview | Medium | Medium | Do if agenda absent, but notes are verbose |
| Switch to MeetingMeta | Medium | Medium | Better architecture, separate task |

The fix that moves the needle the most for the least work: add `agenda` as a subtitle line. That alone takes "Audience with Guild Master, 2026-03-10" and makes it "Audience with Guild Master, 2026-03-10 / Review open lore/issues" - which is enough to distinguish entries.
