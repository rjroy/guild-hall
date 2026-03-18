---
title: "Plan: Steward Worker MVP"
date: 2026-03-10
status: executed
tags: [workers, steward, email, packages, content]
modules: [packages]
related:
  - .lore/specs/workers/guild-hall-steward-worker.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/workers/guild-hall-worker-roster.md
  - .lore/specs/workers/worker-identity-and-personality.md
  - .lore/specs/workers/guild-hall-mail-reader-toolbox.md
  - .lore/specs/workers/worker-communication.md
---

# Plan: Steward Worker MVP

## Spec Reference

**Spec**: `.lore/specs/workers/guild-hall-steward-worker.md`

Requirements addressed:

- REQ-STW-1: Package structure → Step 1
- REQ-STW-2: `package.json` guildHall block → Step 1
- REQ-STW-3: Sparse checkout scope → Step 1
- REQ-STW-4: `domainToolboxes: ["guild-hall-email"]` → Step 1
- REQ-STW-5: `builtInTools` declaration → Step 1
- REQ-STW-6: `maxTurns: 80` resource default → Step 1
- REQ-STW-7: `soul.md` with Character, Voice, Vibe → Step 2
- REQ-STW-8: `posture.md` with Principles, Workflow, Quality Standards → Step 3
- REQ-STW-9: Inbox triage capability → Step 3 (encoded in posture)
- REQ-STW-10: Meeting prep capability → Step 3 (encoded in posture)
- REQ-STW-11: Email research capability → Step 3 (encoded in posture)
- REQ-STW-12: Advisory posture (no write actions) → Steps 1, 3
- REQ-STW-13: Commission results are artifacts, not actions → Step 3
- REQ-STW-14: `contacts.md` memory convention → Step 3
- REQ-STW-15: `preferences.md` memory convention → Step 3
- REQ-STW-16: `active-threads.md` memory convention → Step 3
- REQ-STW-17: Memory update timing → Step 3
- REQ-STW-18: Guild Master escalation via `send_mail` → Step 3
- REQ-STW-19: Conservative escalation criteria → Step 3
- REQ-STW-20: Guild Master is the only escalation target → Step 3
- Portrait asset → Step 4

## Codebase Context

### What already exists

Everything this plan requires is already built. No infrastructure changes, no new types, no toolbox resolver changes.

**`packages/guild-hall-email/`**: The domain toolbox the Steward declares. Four read-only tools: `search_emails`, `read_email`, `list_mailboxes`, `get_thread`. Loaded automatically by the toolbox resolver when a worker declares `domainToolboxes: ["guild-hall-email"]`. `packages/guild-hall-email/package.json` confirms the toolbox name is `"guild-hall-email"`.

**`packages/shared/worker-activation.ts`**: The `activateWorkerWithSharedPattern()` function all workers call. The Steward's `index.ts` is one line. System prompt assembly order is already soul → identity → posture → memory → commission context.

**`lib/packages.ts`**: Discovery loads `soul.md` and `posture.md` from the package directory. A missing `soul.md` warns but doesn't skip the worker. A missing `posture.md` skips the worker. Both files are loaded for the Steward.

**`send_mail` tool**: Available in commission toolboxes since the worker-communication implementation. The Steward can call it to escalate to the Guild Master. Validation against discovered worker names happens in the toolbox; the Steward needs no special wiring.

**Worker memory**: Workers receive their accumulated memory injected at session start via `context.injectedMemory`. The Steward reads this at commission start. Memory writes happen via the `Write` tool (included in `builtInTools`). Memory file paths follow worker-scoped conventions; the posture must tell the Steward where to write them.

### Key files for reference

| File | Role | How Steward mirrors it |
|------|------|------------------------|
| `packages/guild-hall-researcher/package.json` | Sparse-checkout worker with no domain toolboxes | Same shape; add `domainToolboxes: ["guild-hall-email"]` |
| `packages/guild-hall-researcher/index.ts` | One-line activate | Identical |
| `packages/guild-hall-researcher/soul.md` | Character/Voice/Vibe structure | Same three-section format |
| `packages/guild-hall-researcher/posture.md` | Principles/Workflow/Quality Standards | Same three-section format |
| `packages/guild-hall-email/index.ts` | Confirms toolbox name and tool set | Reference for advisory boundary test |

### Test files that need updating

| File | Why |
|------|-----|
| `tests/packages/worker-roster.test.ts` | `expectedRosterPackageNames` and `expectedRoleProfiles` don't include the Steward yet |
| `tests/packages/worker-role-smoke.test.ts` | No Steward import or smoke test |
| `tests/packages/worker-routing-validation.test.ts` | Routing signals and type union don't include `"steward"` |

### Portrait directory

Existing portraits live at `web/public/images/portraits/`. The Steward's portrait path in `package.json` is `/images/portraits/edmund-steward.webp`. A placeholder must exist at `web/public/images/portraits/edmund-steward.webp` before the UI will display the worker without a broken image.

## Implementation Steps

### Step 1: Package scaffold (package.json + index.ts)

**Files**: `packages/guild-hall-steward/package.json`, `packages/guild-hall-steward/index.ts`
**Addresses**: REQ-STW-1, REQ-STW-2, REQ-STW-3, REQ-STW-4, REQ-STW-5, REQ-STW-6
**Delegate**: Dalton

Create the package directory. Two files in this step; all content is determined by the spec.

**`package.json`**: Exactly the metadata from REQ-STW-2. No interpretation required:

```json
{
  "name": "guild-hall-steward",
  "version": "0.1.0",
  "guildHall": {
    "type": "worker",
    "identity": {
      "name": "Edmund",
      "description": "Manages the guild's household affairs and correspondence. Reads the inbox so you don't have to wade through it yourself.",
      "displayTitle": "Guild Steward",
      "portraitPath": "/images/portraits/edmund-steward.webp"
    },
    "domainToolboxes": ["guild-hall-email"],
    "builtInTools": ["Read", "Glob", "Grep", "Write", "Edit"],
    "checkoutScope": "sparse",
    "resourceDefaults": {
      "maxTurns": 80
    }
  }
}
```

**`index.ts`**: Identical to `packages/guild-hall-researcher/index.ts`:

```typescript
import type { ActivationContext, ActivationResult } from "@/lib/types";
import { activateWorkerWithSharedPattern } from "@/packages/shared/worker-activation";

export function activate(context: ActivationContext): ActivationResult {
  return activateWorkerWithSharedPattern(context);
}
```

**Test strategy**: No tests at this step. Discovery validation happens in Step 5. The schema validation in `lib/packages.ts` will catch any metadata errors when the discovery test runs.

**Verification**: Run `bun test tests/packages/worker-roster.test.ts` after Step 5. For early validation: `node -e "import('./packages/guild-hall-steward/package.json', {assert:{type:'json'}}).then(m=>console.log(m.default.guildHall))"` confirms the JSON is valid and the shape is correct.

---

### Step 2: Soul file

**File**: `packages/guild-hall-steward/soul.md`
**Addresses**: REQ-STW-7
**Delegate**: Dalton

Three sections: Character, Voice, Vibe. The spec provides complete example content in REQ-STW-7 that satisfies all sub-requirements. Dalton should use that content as-is; no creative work required.

**Structure requirements** (from REQ-WID-2, verified in `tests/packages/worker-roster.test.ts`):
- Three `##`-level sections: `## Character`, `## Voice`, `## Vibe`
- Voice section contains `### Anti-examples` and `### Calibration pairs` subsections
- Total under 80 lines
- No content matching posture section headers (`Principles:`, `Workflow:`, `Quality Standards:`)

**Content requirements** (REQ-STW-7):
- Character establishes: managing what arrives (not what is created), thorough non-judgmental approach, advisory boundary
- Anti-examples target: over-summarizing (losing specifics), false urgency, unrequested context padding
- Calibration pairs illustrate: vague inbox reporting vs. specific actionable findings
- Vibe conveys: organized before you ask, tells you what you need, no editorializing

The spec's example content at REQ-STW-7 fulfills all these requirements and should be the source of truth for the file content.

**Test strategy** (executed in Step 5):
- `soul.md` exists and is loadable
- Three section headers present
- Under 80 lines
- No posture content leakage

**Verification**: `bun test tests/packages/worker-roster.test.ts` after Step 5 runs soul file structure checks for all roster workers including the Steward.

---

### Step 3: Posture file

**File**: `packages/guild-hall-steward/posture.md`
**Addresses**: REQ-STW-8 through REQ-STW-20
**Delegate**: Dalton

This is the largest content step. The posture file encodes everything the Steward does operationally: how it approaches email work, how it uses its memory files, when it escalates, and what quality looks like.

Three `##` sections: `## Principles`, `## Workflow`, `## Quality Standards`. No personality content (that lives in `soul.md`).

**Principles section** (REQ-STW-8, REQ-STW-12, REQ-STW-13):
- Read before summarizing: pull actual email content before forming conclusions, subject lines are not summaries
- Maintain the advisory boundary: the Steward reads, categorizes, and surfaces — no replies, no flagging, no inbox actions
- Calibrate urgency from `preferences.md`, not from sender's self-assessment
- Write for retrieval: use specific names, dates, subjects, email IDs so summaries are useful weeks later

**Workflow section** (REQ-STW-8, REQ-STW-9 through REQ-STW-11, REQ-STW-14 through REQ-STW-20):

The workflow must encode the commission execution sequence from REQ-STW-8 in five numbered steps. Each step must be actionable enough to drive Claude's behavior without further clarification:

1. **Read memory** (REQ-STW-14, REQ-STW-17): At commission start, read three files from worker-scoped memory. State the paths explicitly so the Steward knows where to look. For example: `~/.claude/projects/<project>/memory/contacts.md`, `preferences.md`, `active-threads.md`. If `preferences.md` is absent, create it from the template in REQ-STW-15 before making any email calls.

2. **Execute the commissioned task** using email tools. The posture must describe all three task modes in enough detail that the Steward produces the correct output structure for each:

   - **Inbox triage** (REQ-STW-9): Scan emails in the specified time window (default 7 days) and mailboxes (default Inbox). Apply urgency criteria from `preferences.md`. Output five sections — Urgent, Action needed, FYI, Active threads, Quiet — each present even if empty. Each Urgent and Action needed item includes: sender, date, subject, one-sentence summary, urgency reasoning.

   - **Meeting prep** (REQ-STW-10): Search by attendee name/email, topic, or project name using `search_emails`. Read full threads via `get_thread`. Output three parts: Context (1-3 paragraphs of discussion history), Open items (pending questions/decisions with email references), Recommended reading (up to 5 email IDs with rationale).

   - **Email research** (REQ-STW-11): For a given thread ID, sender, or topic, read full email bodies via `read_email` and synthesize across threads. Output: Summary (3-5 sentences), Timeline (key messages with one-line summaries), Participants (roles and positions), Status (where things stand), Open questions.

3. **Check escalation criteria** (REQ-STW-18, REQ-STW-19): After gathering email findings, before updating memory, evaluate whether anything meets escalation criteria. Criteria (all three must be checked explicitly):
   - Deadline pressure: email requests response or decision within 24-48 hours
   - Commission blocker: email affects active Guild Hall work
   - Explicit urgency from a known contact flagged as high-priority in `preferences.md`

   If any criterion is met, send mail to the Guild Master via `send_mail` with the specific finding and why it qualifies. Wait for reply and incorporate the Guild Master's assessment into the commission result. If no criterion is met, do not send mail (REQ-STW-20).

4. **Update memory** (REQ-STW-14 through REQ-STW-17): After email work is complete, update all three files:
   - Add new significant contacts to `contacts.md` (appear in multiple threads or flagged as relevant). Never delete entries; update `Last Seen` and Notes when new context is available.
   - Record explicit preferences to `preferences.md` if the commission prompt reveals one. Append to the Notes section; do not overwrite existing criteria.
   - Add or update thread entries in `active-threads.md` for ongoing conversations worth watching. Update Status when a thread's state changes.

   Note when any file exceeds ~50 rows or ~500 lines and suggest a memory cleanup commission.

5. **Submit result** via `submit_result` with findings structured for the task type.

**Quality Standards section** (REQ-STW-8):
- Every email reference includes sender name, date received, and subject
- Urgency ratings carry explicit reasoning: "High — asking for a decision by [date]"
- Meeting prep output contains exactly three parts: context summary, open items, recommended reading
- Memory updates are additive and timestamped; never overwrite without recording what changed

**Test strategy** (executed in Step 5):
- Section structure verified by `worker-roster.test.ts` pattern
- Key operational phrases verified in Steward-specific posture content test
- Advisory boundary (no write tool calls in email toolbox) verified via toolbox introspection

**Verification**: `bun test tests/packages/worker-roster.test.ts` confirms section structure. `bun test tests/packages/guild-hall-steward/` confirms content tests.

---

### Step 4: Portrait placeholder

**File**: `web/public/images/portraits/edmund-steward.webp`
**Addresses**: REQ-STW-2 (portraitPath references this file)
**Delegate**: Dalton

Create a placeholder `.webp` file so the UI doesn't display a broken image for the Steward. Copy an existing portrait as a placeholder; the creative portrait is a separate deliverable not in scope for this plan.

```bash
cp web/public/images/portraits/guild-master.webp web/public/images/portraits/edmund-steward.webp
```

The portrait can be replaced later with a proper Edmund image without any code changes. The `portraitPath` in `package.json` points to the correct path regardless of the image content.

**Verification**: File exists at `web/public/images/portraits/edmund-steward.webp`. The worker card in the UI displays without a broken image placeholder.

---

### Step 5: Update roster and routing tests

**Files**: `tests/packages/worker-roster.test.ts`, `tests/packages/worker-role-smoke.test.ts`, `tests/packages/worker-routing-validation.test.ts`
**Addresses**: Success criteria — discoverable by roster, visible for commission assignment, manager routes correctly
**Delegate**: Sable
**Depends on**: Step 1 complete (package.json must exist for schema validation)

**`worker-roster.test.ts` changes**:

Add `"guild-hall-steward"` to `expectedRosterPackageNames`.

Add the Steward to `expectedRoleProfiles`:
```typescript
"guild-hall-steward": {
  identityName: "Edmund",
  descriptionIntent: /inbox|correspondence|household/i,
  checkoutScope: "sparse",
  builtInTools: ["Read", "Glob", "Grep", "Write", "Edit"],
},
```

Add the Steward to `expectedPostureGuardrails`. The Steward's key guardrails are the advisory boundary and memory read-before-act pattern:
```typescript
"guild-hall-steward": [
  /read before summarizing/i,
  /advisory boundary/i,
  /contacts\.md|preferences\.md|active-threads\.md/i,
  /submit_result/i,
],
```

The existing tests for soul file structure (three sections, under 80 lines, no operational content) and posture structure (three sections, no personality content) automatically cover the Steward once it's in `expectedRosterPackageNames`.

**`worker-role-smoke.test.ts` changes**:

Add `import { activate as activateSteward } from "@/packages/guild-hall-steward";` alongside the other five worker imports.

Add a Steward smoke test:
```typescript
test("steward posture enforces advisory-only behavior", async () => {
  const metadata = await readWorkerMetadata("guild-hall-steward");
  const result = activateSteward(makeActivationContext(metadata.posture, metadata.soul));

  expect(result.systemPrompt).toContain("advisory boundary");
  expect(result.systemPrompt).toContain("submit_result");
  expect(metadata.builtInTools).not.toContain("WebSearch");
  expect(metadata.builtInTools).not.toContain("WebFetch");
  expect(metadata.builtInTools).not.toContain("Bash");
});
```

**`worker-routing-validation.test.ts` changes**:

The routing validation test (`RoleLabel` type, `roleOrder` array, `rolePackageMap`, `routingSignals`) currently covers five workers. Add `"steward"` to the `RoleLabel` union, `roleOrder`, and `rolePackageMap`. Add routing signals for the Steward. Then update the fixture files (or generate them) to include steward routing intents.

Steward routing signals:
```typescript
steward: [
  { pattern: /\binbox|email|correspondence|triage\b/i, weight: 4 },
  { pattern: /\bmeeting prep|briefing|thread\b/i, weight: 3 },
  { pattern: /\bsender|mailbox|digest\b/i, weight: 2 },
],
```

Update `fixtures/worker-routing-intents.json` to include representative and adversarial steward intents. Representative: "Triage my inbox for the past week", "Prepare me for my meeting with Sarah tomorrow". Adversarial: "Research how the email encryption library works" (should route to researcher, not steward).

**Test strategy**: These are updates to existing tests that extend existing patterns. No new test infrastructure needed.

**Verification**: `bun test tests/packages/worker-roster.test.ts tests/packages/worker-role-smoke.test.ts tests/packages/worker-routing-validation.test.ts` all pass with the Steward included.

---

### Step 6: Steward integration tests

**File**: `tests/packages/guild-hall-steward/integration.test.ts` (new)
**Addresses**: AI Validation criteria — package discovery, toolbox resolution, advisory boundary, posture content verification
**Delegate**: Sable
**Depends on**: Steps 1-3 complete

This test file validates the Steward package against its spec requirements without running actual Claude sessions.

**Test suite outline**:

```typescript
describe("guild-hall-steward package", () => {
  describe("package discovery", () => {
    test("Steward is discovered as a valid worker");
    // discoverPackages([PACKAGES_DIR]) returns a package named "guild-hall-steward"
    // metadata.identity.name === "Edmund"
    // metadata.identity.displayTitle === "Guild Steward"

    test("discovery populates soul and posture from filesystem");
    // metadata.soul is defined and non-empty
    // metadata.posture is defined and non-empty

    test("metadata validates against workerMetadataSchema");
    // packageMetadataSchema.safeParse(pkg.guildHall).success === true
  });

  describe("toolbox resolution", () => {
    test("guild-hall-email appears in resolved tool set for the Steward");
    // resolveToolSet(stewardWorkerMeta, ...) includes "guild-hall-email" in mcpServers
    // allowedTools includes "mcp__guild-hall-email__*" entries

    test("Steward without email toolbox package fails cleanly");
    // resolveToolSet with no email package in discoveredPackages
    // follows REQ-WKR-13 behavior (worker fails activation if required toolbox missing)
    // This verifies the resolver enforces declared domain toolbox requirements

    test("advisory boundary: no email write tools in resolved set");
    // email toolbox's MCP server exports only: search_emails, read_email, list_mailboxes, get_thread
    // No send, reply, flag, move, or delete tools are present
    // Verify by checking the email toolbox's tool definitions
  });

  describe("posture content verification", () => {
    test("posture workflow describes all five execution steps");
    // Checks for: memory read, email task execution, escalation check, memory update, submit_result

    test("posture encodes triage output structure");
    // Checks for: "Urgent", "Action needed", "FYI", "Active threads", "Quiet"
    // These are the five required triage sections from REQ-STW-9

    test("posture encodes meeting prep output structure");
    // Checks for: "Context", "Open items", "Recommended reading"
    // These are the three required meeting prep parts from REQ-STW-10

    test("posture encodes email research output structure");
    // Checks for: "Summary", "Timeline", "Participants", "Status", "Open questions"
    // These are the five research sections from REQ-STW-11

    test("posture names all three memory files");
    // Checks for: "contacts.md", "preferences.md", "active-threads.md"
    // Verifies memory files are identified explicitly in the posture

    test("posture describes Guild Master escalation criteria");
    // Checks for: "send_mail", "Guild Master", and at least two escalation signals
    // (deadline, commission blocker, or known contact urgency)

    test("posture prohibits web tools");
    // Checks that posture does not describe WebSearch or WebFetch usage
    // Complements the builtInTools check in roster tests
  });
});
```

The toolbox resolution test (second test) requires knowing whether REQ-WKR-13 causes activation failure or graceful degradation. Check `daemon/services/toolbox-resolver.ts` behavior when a declared domain toolbox is missing before implementing this test. If the resolver logs a warning and continues (soft failure), adjust the test expectation accordingly.

**Verification**: `bun test tests/packages/guild-hall-steward/integration.test.ts` passes. `bun test` full suite passes.

---

### Step 7: Code review and spec validation

**Files**: None (review only)
**Addresses**: All REQ-STW-* via fresh-context validation
**Delegate**: Thorne (via `pr-review-toolkit:code-reviewer`) or fresh sub-agent

After Steps 1-6 pass the full test suite, launch a fresh-context review.

**The reviewer should check**:

1. **Posture completeness**: Does the posture tell the Steward enough to produce the correct output for each of the three task types? Test: read the posture cold and attempt to follow it. Are there ambiguities that would let the Steward skip a required output section?

2. **Advisory boundary enforcement**: The Steward's toolbox contains no email write operations. Verify this by examining the email toolbox's tool definitions directly. No behavioral prohibition can prevent a tool from being called if the tool exists; the spec's read-only constraint (REQ-STW-12) is structural, not just posture-level.

3. **Escalation criteria specificity**: The posture must define escalation criteria concretely enough that "important-sounding" emails don't trigger escalation. Review whether the posture language matches REQ-STW-19's exact criteria: 24-48 hours for deadline pressure, commission-affecting for blockers, known contact from `preferences.md` for explicit urgency.

4. **Memory file format completeness**: The posture must tell the Steward the exact table structure for `contacts.md` and `active-threads.md`, and the template structure for `preferences.md`. Without this, the Steward may create files in an ad-hoc format that doesn't accumulate correctly across commissions.

5. **Soul/posture boundary**: No methodology content in `soul.md`. No personality content in `posture.md`. Run the boundary check from the spec: "If the Steward changed specializations, would this soul content still apply?" Character (organized, discrete, thorough) is portable. Workflow steps and quality standards are not.

6. **Roster integration**: The Steward's description must be distinctive enough that the Guild Master routes inbox/correspondence commissions to it rather than to the Researcher. The Researcher's description ("ventures beyond the guild walls") and the Steward's description ("reads the inbox so you don't have to wade through it yourself") should be non-overlapping for common triage/email commission prompts.

## Delegation Guide

This is a content-first plan. No infrastructure changes, no new types, no toolbox resolver changes. The entire MVP is four files in a new package directory plus test updates.

**Dalton (Implementation) — Steps 1-4**

All four files are self-contained. Dalton can build them in any order. Steps 1 and 4 are mechanical (JSON metadata, file copy). Steps 2 and 3 are content writing.

For Step 3 (posture), the posture must encode enough operational detail to drive actual behavior — not just reference the spec. If a content section reads "see REQ-STW-9" rather than describing the triage output structure, the worker will not produce correct output. Dalton should treat the posture as the Steward's instruction set, not a pointer to documentation.

**Sable (Testing) — Steps 5-6**

Step 5 updates existing test files. Follow the patterns already in each file. The roster test additions are mechanical — add to the arrays, add the guardrail patterns. The routing test additions require creating fixture intents, which involves some judgment about what makes a steward-routed commission distinct from a researcher-routed one.

Step 6 creates a new test file. Pattern it after `tests/packages/guild-hall-email/integration.test.ts`. The posture content verification tests are straightforward regex checks; the toolbox resolution test may require checking the resolver behavior first.

**Dependency**: Sable's work (Steps 5-6) depends on Dalton's work (Steps 1-3) being complete. Sable cannot run roster tests against a missing package. Sequence strictly.

**Thorne (Review) — Step 7**

Review only. No code changes. The most important review targets are posture completeness (does the workflow tell the Steward enough to produce the correct outputs?) and soul/posture boundary (are they clean?). Secondary targets are advisory boundary verification and escalation criteria specificity.

### Commission structure

| Commission | Worker | Steps | Can start when |
|-----------|--------|-------|----------------|
| A: Package files | Dalton | 1-4 | Now |
| B: Tests | Sable | 5-6 | Commission A complete |
| C: Review | Thorne | 7 | Commission B complete |

## Open Questions

1. **REQ-WKR-13 behavior for missing domain toolboxes**: The spec says "activation fails cleanly if the toolbox is missing." Whether this means the resolver throws an error or returns a degraded activation context is not confirmed by reading `lib/packages.ts` alone — the behavior lives in `daemon/services/toolbox-resolver.ts`. Sable should check the resolver before writing the "Steward without email toolbox" test in Step 6. If the resolver soft-fails (warning + continues), the test expectation changes.

2. **Memory file paths**: Worker-scoped memory paths are injected via `context.injectedMemory` from the SDK session setup. The posture in Step 3 should name the memory files explicitly. Confirm how the memory path is surfaced in `context` — whether as a directory path the Steward uses with `Write`, or as a pre-loaded string. This affects how the workflow step describes "read memory at commission start."

3. **Portrait quality**: The placeholder portrait (Step 4) is a copy of an existing image. If the Steward is actively used, this will be visually confusing. A proper Edmund portrait is a separate deliverable — either AI-generated using the art-gen tooling or commissioned separately. This plan only ensures the path doesn't 404.

4. **Routing separation from Researcher**: The Steward and Researcher share a sparse checkout scope and both handle information tasks. The description must be distinctive for routing. The current spec description ("Reads the inbox so you don't have to wade through it yourself") is concrete. Confirm during review (Step 7) that the routing validation test in Step 5 includes adversarial cases where an email-adjacent commission should route to Researcher (e.g., "research how email encryption works") rather than Steward.
