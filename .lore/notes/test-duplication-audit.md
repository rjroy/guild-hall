---
title: "Test Duplication Audit: Routes vs Services"
date: 2026-03-14
status: complete
tags: [testing, audit]
---

# Test Duplication Audit: Routes vs Services

Audit of test overlap between `tests/daemon/routes/` and `tests/daemon/services/`. Scope: commission, meeting, and briefing domains audited in full. Remaining domains catalogued.

## Summary

Duplication is low. The route tests and service tests are well-separated by layer concern. Route tests mock the service interface and verify HTTP wiring. Service tests verify business logic through the actual service layer. The two suites complement each other rather than repeating each other.

One structural overlap exists in the read-path route tests, documented below.

## Methodology

Each test case was classified as:

- **Layer boundary**: Tests something unique to that layer. Not a duplicate.
- **Logic verification**: Re-tests service behavior already covered by service tests. A duplicate.

## Domain: Commissions

### Route files
- `tests/daemon/routes/commissions.test.ts` (write operations)
- `tests/daemon/routes/commissions-read.test.ts` (read operations)

### Service files
- `tests/daemon/services/commission/orchestrator.test.ts` (Layer 5)
- `tests/daemon/services/commission/lifecycle.test.ts` (Layer 2)
- `tests/daemon/services/commission/record.test.ts` (Layer 1)
- `tests/daemon/services/commission/capacity.test.ts`

### Classification: commissions.test.ts (write routes)

All 27 test cases are **layer boundary**. The route test mocks `CommissionSessionForRoutes` and records calls via a `calls` array. Every test verifies one of:

- HTTP status code mapping (201, 400, 404, 409, 500)
- Request body parsing and field validation
- Error classification (which error type maps to which status)
- Parameter forwarding to the service interface
- JSON response shape

No test re-verifies state transitions, lifecycle rules, or filesystem operations. The mock service interface is a pure call recorder; it has no logic.

### Classification: commissions-read.test.ts (read routes)

| Test | Classification | Notes |
|------|---------------|-------|
| returns 400 when projectName missing | Layer boundary | HTTP validation |
| returns 404 for unknown project | Layer boundary | Project resolution |
| returns empty array when no commissions | Layer boundary | Response shape |
| lists commissions with parsed metadata | **Partial overlap** | Reads filesystem artifacts and parses frontmatter. Overlaps with `record.test.ts` which also tests `readStatus` on real artifacts. See "Structural overlap" below. |
| sorts commissions by status group | Layer boundary | Sorting is route-layer logic |
| reads a single commission with metadata | **Partial overlap** | Same frontmatter parsing overlap as above |
| returns 404 for nonexistent commission | Layer boundary | HTTP status |
| content-type is application/json | Layer boundary | HTTP header |
| response wraps commissions in object | Layer boundary | Response shape |

### Classification: service tests (commission)

All service test cases are **layer boundary**. They test:
- `record.test.ts`: Filesystem I/O, YAML frontmatter manipulation, field escaping
- `lifecycle.test.ts`: State machine transitions, event emission, Layer 1 call verification
- `orchestrator.test.ts`: Dispatch-through-completion wiring, crash recovery, merge conflicts, dependency transitions
- `capacity.test.ts`: Pure capacity calculation functions

No service test constructs HTTP requests or checks status codes.

## Domain: Meetings

### Route files
- `tests/daemon/routes/meetings.test.ts` (write operations)
- `tests/daemon/routes/meetings-read.test.ts` (read operations)

### Service files
- `tests/daemon/services/meeting/orchestrator.test.ts`
- `tests/daemon/services/meeting/record.test.ts`

### Classification: meetings.test.ts (write routes)

All 26 test cases are **layer boundary**. The test mocks `MeetingSessionForRoutes` and verifies:

- SSE streaming format (via `parseSSEResponse()` helper)
- HTTP status codes and error mapping
- Request body validation
- Parameter forwarding to mock session
- Content-type headers

No test re-verifies workspace preparation, registry lifecycle, artifact writing, or state management.

### Classification: meetings-read.test.ts (read routes)

| Test | Classification | Notes |
|------|---------------|-------|
| returns 400 when projectName missing | Layer boundary | HTTP validation |
| returns 404 for unknown project | Layer boundary | Project resolution |
| returns empty array when no requests exist | Layer boundary | Response shape |
| lists only meeting requests (status: requested) | **Partial overlap** | Reads real filesystem artifacts, filters by status. The status-reading logic is also covered by `record.test.ts` (`readArtifactStatus`). |
| response wraps meetings in object | Layer boundary | Response shape |
| content-type is application/json | Layer boundary | HTTP header |
| returns 400 when projectName missing (read) | Layer boundary | HTTP validation |
| returns 404 for unknown project (read) | Layer boundary | Project resolution |
| returns 404 for nonexistent meeting | Layer boundary | HTTP status |
| reads meeting detail with metadata | **Partial overlap** | Parses frontmatter fields from real artifacts. Same parsing tested in `record.test.ts`. |
| includes transcript when file exists | Layer boundary | Transcript loading is route-layer feature |
| returns empty transcript when no file | Layer boundary | Transcript loading |

### Classification: service tests (meeting)

All service test cases are **layer boundary**. They test:
- `orchestrator.test.ts`: Open/close/decline/defer flows, workspace prep, registry lifecycle, cap enforcement, event emission
- `record.test.ts`: Artifact I/O functions, YAML escaping, frontmatter preservation, body content management

No service test constructs HTTP requests.

## Domain: Briefings

### Route file
- `tests/daemon/routes/briefing.test.ts`

### Service file
- `tests/daemon/services/briefing-generator.test.ts`

### Classification: briefing.test.ts (route)

All 6 test cases are **layer boundary**. The test mocks `BriefingGenerator` and verifies:

- Response metadata shape
- Cached briefing pass-through
- HTTP 500 when generator throws
- URL-encoded project name handling
- Content-type header

### Classification: briefing-generator.test.ts (service)

All test cases are **layer boundary**. Tests cover:
- Full SDK session path, single-turn path, template fallback
- Cache behavior (HEAD-based + TTL), file-based persistence
- System model configuration

Zero overlap. The route test never tests caching, SDK path selection, or fallback logic. The service test never tests HTTP status codes or response shape.

## Structural Overlap Pattern

The read-path route tests (`commissions-read.test.ts`, `meetings-read.test.ts`) read from a real filesystem and parse YAML frontmatter. The service record tests (`commission/record.test.ts`, `meeting/record.test.ts`) also read from a real filesystem and parse YAML frontmatter.

This is the only area where the two layers touch the same behavior. However, these tests are not strict duplicates:

- The route tests verify that the **HTTP endpoint** returns parsed metadata in the correct JSON shape. They test the full path: HTTP request -> project resolution -> filesystem read -> frontmatter parse -> JSON response.
- The service tests verify that the **record functions** correctly read/write YAML frontmatter. They test: function call -> filesystem read -> parsed result.

The overlap is in the middle of the chain (filesystem read + frontmatter parse). Both layers exercise this logic because the read routes call record functions directly rather than going through a service interface. This is a design choice, not a testing deficiency. The route tests would be weaker if they mocked the filesystem read, because the parsing is where bugs actually live.

**Verdict**: This overlap is defensible. Neither layer's tests are redundant. Removing either would leave a gap.

## Domains with No Cross-Layer Overlap

These route test files have no corresponding service test file, so duplication is structurally impossible:

| Route test file | What it tests |
|----------------|---------------|
| `artifacts.test.ts` | Artifact CRUD routes (list, read, write), path traversal protection, git commit integration |
| `events.test.ts` | SSE event streaming from EventBus |
| `help.test.ts` | Hierarchical help/discovery routes from OperationsRegistry |
| `models.test.ts` | Model catalog listing (built-in + local) |
| `package-operations.test.ts` | Package operation route generation, parameter extraction, Zod validation, context validation, streaming |
| `workers.test.ts` | Worker metadata listing |
| `config.test.ts` | Config read and dependency graph |
| `admin.test.ts` | Admin operations (reload, register, validate, rebase, sync) |

## Service Files with No Route Counterpart

These service test files have no corresponding route test, so they are not part of the duplication analysis:

- `git-admin.test.ts`, `mail/*.test.ts`, `manager*.test.ts`, `scheduler/*.test.ts`
- `sdk-logging.test.ts`, `sdk-runner.test.ts`, `skill-*.test.ts`
- `transcript.test.ts`, `workspace.test.ts`, `memory-compaction.test.ts`
- `meeting/notes-generator.test.ts`, `meeting/recovery.test.ts`, `meeting/registry.test.ts`

## Conclusion

The test suite has minimal duplication. The route/service separation is clean:

- **Write-path route tests** mock the service interface entirely. Zero logic verification.
- **Read-path route tests** share filesystem/parsing behavior with record service tests. This overlap is structural (the read routes call record functions directly) and defensible (both layers need their own coverage).
- **Service tests** never touch HTTP. They test business logic, state machines, and filesystem I/O.

No test cases need removal. The partial overlap in read-path tests is the cost of testing two layers that share a dependency without an abstraction boundary between them. Introducing a mock there would make the route tests weaker, not stronger.
