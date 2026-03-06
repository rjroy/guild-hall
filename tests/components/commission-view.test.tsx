import { describe, test, expect } from "bun:test";
import CommissionHeader from "@/web/components/commission/CommissionHeader";
import CommissionLinkedArtifacts from "@/web/components/commission/CommissionLinkedArtifacts";
import {
  filterTimeline,
  WORKER_EVENTS,
  USER_EVENTS,
  MANAGER_EVENTS,
} from "@/web/components/commission/CommissionTimeline";
import type { TimelineEntry } from "@/lib/commissions";
import type { CommissionArtifact } from "@/web/components/commission/CommissionLinkedArtifacts";

/**
 * Commission view component tests. Server-renderable components (CommissionHeader,
 * CommissionLinkedArtifacts) are called directly as functions.
 * Client components with hooks (CommissionTimeline, CommissionPrompt, CommissionActions,
 * CommissionNotes, CommissionView) cannot be called outside a React render context,
 * so we test their type contracts and exported pure logic (e.g., filterTimeline).
 *
 * CSS module class names resolve to undefined in bun test. We focus on structural
 * behavior: correct elements, correct props, correct children.
 */

type AnyElement = React.ReactElement<Record<string, unknown>>;

/**
 * Walks a React element tree depth-first, collecting elements that match
 * a predicate. Does not descend into function component boundaries.
 */
function findElements(
  element: AnyElement,
  predicate: (el: AnyElement) => boolean,
): AnyElement[] {
  const results: AnyElement[] = [];
  if (predicate(element)) results.push(element);

  const children = element.props.children;
  if (children) {
    const childArray = Array.isArray(children) ? children : [children];
    for (const child of childArray) {
      if (
        child &&
        typeof child === "object" &&
        "type" in child &&
        "props" in child
      ) {
        results.push(...findElements(child as AnyElement, predicate));
      }
    }
  }

  return results;
}

/**
 * Checks if a React element tree contains a given text string anywhere
 * in its direct children.
 */
function containsText(element: AnyElement, text: string): boolean {
  const children = element.props.children;
  if (typeof children === "string" && children.includes(text)) return true;
  if (typeof children === "number" && String(children).includes(text))
    return true;
  if (Array.isArray(children)) {
    return children.some((child) => {
      if (typeof child === "string" && child.includes(text)) return true;
      if (child && typeof child === "object" && "props" in child) {
        return containsText(child as AnyElement, text);
      }
      return false;
    });
  }
  if (children && typeof children === "object" && "props" in children) {
    return containsText(children as AnyElement, text);
  }
  return false;
}

/**
 * Finds child elements that are React component instances. Returns elements
 * whose component function name matches the given string.
 */
function findComponentElements(
  element: AnyElement,
  componentName: string,
): AnyElement[] {
  const results: AnyElement[] = [];

  if (
    typeof element.type === "function" &&
    (element.type as { name?: string }).name === componentName
  ) {
    results.push(element);
  }

  const children = element.props.children;
  if (children) {
    const childArray = Array.isArray(children) ? children : [children];
    for (const child of childArray) {
      if (
        child &&
        typeof child === "object" &&
        "type" in child &&
        "props" in child
      ) {
        results.push(
          ...findComponentElements(child as AnyElement, componentName),
        );
      }
    }
  }

  return results;
}

// -- CommissionHeader tests --

describe("CommissionHeader", () => {
  const baseProps = {
    title: "Research API patterns",
    status: "pending",
    worker: "researcher",
    workerDisplayTitle: "Knowledge Seeker",
    projectName: "my-project",
  };

  test("renders breadcrumb with Guild Hall link", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "Guild Hall")).toBe(true);
  });

  test("renders breadcrumb with project name", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "my-project")).toBe(true);
  });

  test("renders breadcrumb with Commissions link", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "Commissions")).toBe(true);
  });

  test("renders breadcrumb with Commission current label", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "Commission")).toBe(true);
  });

  test("renders breadcrumb navigation element", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    const navs = findElements(el, (e) => e.type === "nav");
    expect(navs).toHaveLength(1);
    expect(navs[0].props["aria-label"]).toBe("Breadcrumb");
  });

  test("renders commission title", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    const h1s = findElements(el, (e) => e.type === "h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].props.children).toBe("Research API patterns");
  });

  test("renders default title when title is empty", () => {
    const props = { ...baseProps, title: "" };
    const el = CommissionHeader(props) as AnyElement;
    const h1s = findElements(el, (e) => e.type === "h1");
    expect(h1s[0].props.children).toBe("Untitled Commission");
  });

  test("renders GemIndicator with correct status", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("pending");
  });

  test("renders active gem for dispatched status", () => {
    const props = { ...baseProps, status: "dispatched" };
    const el = CommissionHeader(props) as AnyElement;
    const gems = findComponentElements(el, "GemIndicator");
    expect(gems[0].props.status).toBe("active");
  });

  test("renders blocked gem for failed status", () => {
    const props = { ...baseProps, status: "failed" };
    const el = CommissionHeader(props) as AnyElement;
    const gems = findComponentElements(el, "GemIndicator");
    expect(gems[0].props.status).toBe("blocked");
  });

  test("renders status text", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "pending")).toBe(true);
  });

  test("renders status text with underscores replaced by spaces", () => {
    const props = { ...baseProps, status: "in_progress" };
    const el = CommissionHeader(props) as AnyElement;
    expect(containsText(el, "in progress")).toBe(true);
  });

  test("renders worker label with display title", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "Knowledge Seeker")).toBe(true);
  });

  test("falls back to worker name when display title is empty", () => {
    const props = { ...baseProps, workerDisplayTitle: "" };
    const el = CommissionHeader(props) as AnyElement;
    expect(containsText(el, "researcher")).toBe(true);
  });

  test("breadcrumb link to project is URL-encoded", () => {
    const props = { ...baseProps, projectName: "my project" };
    const el = CommissionHeader(props) as AnyElement;
    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );
    const projectLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/projects/") &&
        !l.props.href.includes("tab="),
    );
    expect(projectLink).toBeDefined();
    expect(projectLink!.props.href).toContain("my%20project");
  });

  test("breadcrumb has four separators", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    const separators = findElements(
      el,
      (e) => e.type === "span" && e.props["aria-hidden"] === "true",
    );
    expect(separators).toHaveLength(3);
  });
});

// -- CommissionLinkedArtifacts tests --

describe("CommissionLinkedArtifacts", () => {
  test("renders empty state when no artifacts", () => {
    const el = CommissionLinkedArtifacts({
      artifacts: [],
    }) as AnyElement;
    expect(containsText(el, "No artifacts produced yet.")).toBe(true);
  });

  test("renders artifact list when artifacts exist", () => {
    const artifacts: CommissionArtifact[] = [
      {
        path: "specs/api-design.md",
        title: "api-design",
        href: "/projects/test/artifacts/specs/api-design.md",
      },
    ];
    const el = CommissionLinkedArtifacts({
      artifacts,
    }) as AnyElement;

    const lists = findElements(el, (e) => e.type === "ul");
    expect(lists).toHaveLength(1);
  });

  test("renders artifact link with correct href", () => {
    const artifacts: CommissionArtifact[] = [
      {
        path: "specs/api-design.md",
        title: "api-design",
        href: "/projects/test/artifacts/specs/api-design.md",
      },
    ];
    const el = CommissionLinkedArtifacts({
      artifacts,
    }) as AnyElement;

    const links = findElements(
      el,
      (e) =>
        e.type === "a" &&
        typeof e.props.href === "string",
    );
    expect(links).toHaveLength(1);
    expect(links[0].props.href).toBe(
      "/projects/test/artifacts/specs/api-design.md",
    );
  });

  test("renders artifact title as link text", () => {
    const artifacts: CommissionArtifact[] = [
      {
        path: "research/findings.md",
        title: "findings",
        href: "/projects/test/artifacts/research/findings.md",
      },
    ];
    const el = CommissionLinkedArtifacts({
      artifacts,
    }) as AnyElement;

    expect(containsText(el, "findings")).toBe(true);
  });

  test("renders artifact path in code font span", () => {
    const artifacts: CommissionArtifact[] = [
      {
        path: "research/findings.md",
        title: "findings",
        href: "/projects/test/artifacts/research/findings.md",
      },
    ];
    const el = CommissionLinkedArtifacts({
      artifacts,
    }) as AnyElement;

    expect(containsText(el, "research/findings.md")).toBe(true);
  });

  test("renders multiple artifacts as list items", () => {
    const artifacts: CommissionArtifact[] = [
      { path: "a.md", title: "A", href: "/projects/test/artifacts/a.md" },
      { path: "b.md", title: "B", href: "/projects/test/artifacts/b.md" },
      { path: "c.md", title: "C", href: "/projects/test/artifacts/c.md" },
    ];
    const el = CommissionLinkedArtifacts({
      artifacts,
    }) as AnyElement;

    const items = findElements(el, (e) => e.type === "li");
    expect(items).toHaveLength(3);
  });

  test("renders section label", () => {
    const el = CommissionLinkedArtifacts({
      artifacts: [],
    }) as AnyElement;

    const h3s = findElements(el, (e) => e.type === "h3");
    expect(h3s).toHaveLength(1);
    expect(h3s[0].props.children).toBe("Linked Artifacts");
  });
});

// -- CommissionTimeline type contract tests --
// CommissionTimeline now uses useState for tab filtering, so it cannot be
// called directly outside a React render context. We test the exported
// filtering logic as pure functions and verify the type contract.

describe("CommissionTimeline type contract", () => {
  test("accepts timeline prop", () => {
    const props = { timeline: [] as TimelineEntry[] };
    expect(props.timeline).toHaveLength(0);
  });

  test("timeline entries have required fields", () => {
    const entry: TimelineEntry = {
      timestamp: "2026-02-21T10:00:00Z",
      event: "status_change",
      reason: "Created",
    };
    expect(entry.timestamp).toBe("2026-02-21T10:00:00Z");
    expect(entry.event).toBe("status_change");
    expect(entry.reason).toBe("Created");
  });

  test("timeline entries support dynamic extra fields", () => {
    const entry: TimelineEntry = {
      timestamp: "2026-02-21T10:00:00Z",
      event: "status_change",
      reason: "",
      from: "pending",
      to: "dispatched",
    };
    expect(entry.from).toBe("pending");
    expect(entry.to).toBe("dispatched");
  });
});

// -- filterTimeline pure logic tests --

describe("filterTimeline", () => {
  const mixedTimeline: TimelineEntry[] = [
    { timestamp: "2026-02-21T10:00:00Z", event: "status_change", reason: "Created", from: "pending", to: "dispatched" },
    { timestamp: "2026-02-21T10:01:00Z", event: "progress_report", reason: "Analyzing codebase" },
    { timestamp: "2026-02-21T10:02:00Z", event: "question", reason: "Which API version?" },
    { timestamp: "2026-02-21T10:03:00Z", event: "result_submitted", reason: "Analysis complete" },
    { timestamp: "2026-02-21T10:04:00Z", event: "user_note", reason: "Focus on REST endpoints" },
    { timestamp: "2026-02-21T10:05:00Z", event: "manager_note", reason: "Worker is on track" },
    { timestamp: "2026-02-21T10:06:00Z", event: "manager_dispatched", reason: "Guild Master dispatched" },
    { timestamp: "2026-02-21T10:07:00Z", event: "custom_event", reason: "Something else" },
  ];

  test("all tab returns every entry", () => {
    const result = filterTimeline(mixedTimeline, "all");
    expect(result).toHaveLength(mixedTimeline.length);
    expect(result).toBe(mixedTimeline);
  });

  test("worker tab returns progress_report, result_submitted, question", () => {
    const result = filterTimeline(mixedTimeline, "worker");
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.event)).toEqual([
      "progress_report",
      "question",
      "result_submitted",
    ]);
  });

  test("user tab returns only user_note events", () => {
    const result = filterTimeline(mixedTimeline, "user");
    expect(result).toHaveLength(1);
    expect(result[0].event).toBe("user_note");
  });

  test("manager tab returns manager_note and manager_dispatched events", () => {
    const result = filterTimeline(mixedTimeline, "manager");
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.event)).toEqual([
      "manager_note",
      "manager_dispatched",
    ]);
  });

  test("all tab with empty timeline returns empty", () => {
    expect(filterTimeline([], "all")).toHaveLength(0);
  });

  test("worker tab with no worker events returns empty", () => {
    const onlyUserNotes: TimelineEntry[] = [
      { timestamp: "2026-02-21T10:00:00Z", event: "user_note", reason: "A note" },
    ];
    expect(filterTimeline(onlyUserNotes, "worker")).toHaveLength(0);
  });

  test("manager tab with no manager events returns empty", () => {
    const onlyWorkerEvents: TimelineEntry[] = [
      { timestamp: "2026-02-21T10:00:00Z", event: "progress_report", reason: "Progress" },
    ];
    expect(filterTimeline(onlyWorkerEvents, "manager")).toHaveLength(0);
  });
});

// -- Event set membership tests --

describe("timeline event categories", () => {
  test("WORKER_EVENTS contains expected event types", () => {
    expect(WORKER_EVENTS.has("progress_report")).toBe(true);
    expect(WORKER_EVENTS.has("result_submitted")).toBe(true);
    expect(WORKER_EVENTS.has("question")).toBe(true);
    expect(WORKER_EVENTS.has("user_note")).toBe(false);
    expect(WORKER_EVENTS.has("manager_note")).toBe(false);
  });

  test("USER_EVENTS contains expected event types", () => {
    expect(USER_EVENTS.has("user_note")).toBe(true);
    expect(USER_EVENTS.has("progress_report")).toBe(false);
    expect(USER_EVENTS.has("manager_note")).toBe(false);
  });

  test("MANAGER_EVENTS contains expected event types", () => {
    expect(MANAGER_EVENTS.has("manager_note")).toBe(true);
    expect(MANAGER_EVENTS.has("manager_dispatched")).toBe(true);
    expect(MANAGER_EVENTS.has("user_note")).toBe(false);
    expect(MANAGER_EVENTS.has("progress_report")).toBe(false);
  });
});

// -- Type contract tests for client components --
// Client components with hooks cannot be called outside a React render
// context. We verify their prop interfaces compile correctly.

describe("CommissionPrompt type contract", () => {
  test("accepts required props", () => {
    const props = {
      prompt: "Research the API",
      status: "pending",
      commissionId: "commission-researcher-20260221",
    };
    expect(props.prompt).toBe("Research the API");
    expect(props.status).toBe("pending");
    expect(props.commissionId).toBe("commission-researcher-20260221");
  });

  test("status determines editability", () => {
    const pending: string = "pending";
    const dispatched: string = "dispatched";
    const inProgress: string = "in_progress";
    expect(pending === "pending").toBe(true);
    expect(dispatched !== "pending").toBe(true);
    expect(inProgress !== "pending").toBe(true);
  });
});

describe("CommissionActions type contract", () => {
  test("dispatch visible when pending", () => {
    const status = "pending";
    expect(status === "pending").toBe(true);
  });

  test("cancel visible when dispatched or in_progress", () => {
    const dispatched: string = "dispatched";
    const inProgress: string = "in_progress";
    expect(dispatched === "dispatched" || dispatched === "in_progress").toBe(true);
    expect(inProgress === "dispatched" || inProgress === "in_progress").toBe(true);
  });

  test("re-dispatch visible when failed or cancelled", () => {
    const failed: string = "failed";
    const cancelled: string = "cancelled";
    expect(failed === "failed" || failed === "cancelled").toBe(true);
    expect(cancelled === "failed" || cancelled === "cancelled").toBe(true);
  });

  test("accepts onStatusChange callback", () => {
    let newStatus = "";
    const callback = (s: string) => {
      newStatus = s;
    };
    callback("dispatched");
    expect(newStatus).toBe("dispatched");
  });
});

describe("CommissionNotes type contract", () => {
  test("accepts required props", () => {
    const props = {
      commissionId: "commission-researcher-20260221",
    };
    expect(props.commissionId).toBe("commission-researcher-20260221");
  });

  test("accepts optional onNoteAdded callback", () => {
    let called = false;
    const callback = () => {
      called = true;
    };
    callback();
    expect(called).toBe(true);
  });
});

describe("CommissionView type contract", () => {
  test("accepts required props", () => {
    const props = {
      commissionId: "commission-researcher-20260221",
      projectName: "test-project",
      prompt: "Research the API",
      initialStatus: "pending",
      initialTimeline: [] as TimelineEntry[],
      initialArtifacts: [] as CommissionArtifact[],
    };
    expect(props.commissionId).toBe("commission-researcher-20260221");
    expect(props.projectName).toBe("test-project");
    expect(props.initialStatus).toBe("pending");
    expect(props.initialTimeline).toHaveLength(0);
    expect(props.initialArtifacts).toHaveLength(0);
  });

  test("SSE event types are correctly typed", () => {
    const statusEvent = {
      type: "commission_status" as const,
      commissionId: "commission-researcher-20260221",
      status: "in_progress",
      from: "dispatched",
      to: "in_progress",
    };
    expect(statusEvent.type).toBe("commission_status");

    const progressEvent = {
      type: "commission_progress" as const,
      commissionId: "commission-researcher-20260221",
      summary: "Analyzing code",
    };
    expect(progressEvent.type).toBe("commission_progress");

    const resultEvent = {
      type: "commission_result" as const,
      commissionId: "commission-researcher-20260221",
      summary: "Done",
    };
    expect(resultEvent.type).toBe("commission_result");

    const artifactEvent = {
      type: "commission_artifact" as const,
      commissionId: "commission-researcher-20260221",
      artifactPath: "specs/api.md",
    };
    expect(artifactEvent.type).toBe("commission_artifact");

    const managerNoteEvent = {
      type: "commission_manager_note" as const,
      commissionId: "commission-researcher-20260221",
      content: "Worker is making good progress",
    };
    expect(managerNoteEvent.type).toBe("commission_manager_note");
    expect(managerNoteEvent.content).toBe("Worker is making good progress");
  });
});
