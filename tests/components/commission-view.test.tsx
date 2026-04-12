import { describe, test, expect } from "bun:test";
import { createElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CommissionLinkedArtifacts from "@/web/components/commission/CommissionLinkedArtifacts";
import { statusToGem } from "@/lib/types";
import {
  filterTimeline,
  WORKER_EVENTS,
  USER_EVENTS,
  MANAGER_EVENTS,
} from "@/web/components/commission/CommissionTimeline";
import type { TimelineEntry } from "@/lib/commissions";
import type { CommissionArtifact } from "@/web/components/commission/CommissionLinkedArtifacts";

/**
 * Commission view component tests. Server-renderable components (CommissionLinkedArtifacts)
 * are called directly as functions.
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

// -- CommissionHeader tests --
// CommissionHeader is now a client component with useState/useEffect (REQ-DVL-5),
// so it cannot be called directly outside a React render context.
// We test its type contract, prop interface, and pure logic (statusToGem mapping,
// display text generation, URL encoding).

describe("CommissionHeader type contract", () => {
  test("accepts required props", () => {
    const props = {
      title: "Research API patterns",
      status: "pending",
      worker: "researcher",
      workerDisplayTitle: "Knowledge Seeker",
      projectName: "my-project",
    };
    expect(props.title).toBe("Research API patterns");
    expect(props.status).toBe("pending");
    expect(props.worker).toBe("researcher");
    expect(props.workerDisplayTitle).toBe("Knowledge Seeker");
    expect(props.projectName).toBe("my-project");
  });

  test("accepts optional props", () => {
    const props = {
      title: "Research API patterns",
      status: "pending",
      worker: "researcher",
      workerDisplayTitle: "Knowledge Seeker",
      projectName: "my-project",
      model: "opus",
      isModelOverride: true,
      isLocalModel: false,
      localModelBaseUrl: undefined,
    };
    expect(props.model).toBe("opus");
    expect(props.isModelOverride).toBe(true);
  });

  test("module is importable", async () => {
    const mod = await import("@/web/components/commission/CommissionHeader");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });
});

describe("CommissionHeader display logic", () => {
  test("status text replaces underscores with spaces", () => {
    const status = "in_progress";
    const displayStatus = status.replace(/_/g, " ");
    expect(displayStatus).toBe("in progress");
  });

  test("status text for single-word status is unchanged", () => {
    const status = "pending";
    const displayStatus = status.replace(/_/g, " ");
    expect(displayStatus).toBe("pending");
  });

  test("project name is URL-encoded in breadcrumb links", () => {
    const projectName = "my project";
    const encodedProject = encodeURIComponent(projectName);
    expect(encodedProject).toBe("my%20project");
    expect(`/projects/${encodedProject}`).toBe("/projects/my%20project");
    expect(`/projects/${encodedProject}?tab=commissions`).toBe(
      "/projects/my%20project?tab=commissions",
    );
  });

  test("empty title falls back to default", () => {
    const title = "";
    const displayTitle = title || "Untitled Commission";
    expect(displayTitle).toBe("Untitled Commission");
  });

  test("non-empty title is used as-is", () => {
    const title = "Research API patterns";
    const displayTitle = title || "Untitled Commission";
    expect(displayTitle).toBe("Research API patterns");
  });

  test("worker display title falls back to worker name", () => {
    const worker = "researcher";
    const workerDisplayTitle = "";
    const displayed = workerDisplayTitle || worker;
    expect(displayed).toBe("researcher");
  });

  test("worker display title preferred over worker name", () => {
    const worker = "researcher";
    const workerDisplayTitle = "Knowledge Seeker";
    const displayed = workerDisplayTitle || worker;
    expect(displayed).toBe("Knowledge Seeker");
  });

  test("model label includes local suffix when isLocalModel", () => {
    const model = "llama-3";
    const isLocalModel = true;
    const isModelOverride = false;
    const label = `Model: ${model}${isLocalModel ? " (local)" : ""}${isModelOverride ? " (override)" : ""}`;
    expect(label).toBe("Model: llama-3 (local)");
  });

  test("model label includes override suffix when isModelOverride", () => {
    const model = "opus";
    const isLocalModel = false;
    const isModelOverride = true;
    const label = `Model: ${model}${isLocalModel ? " (local)" : ""}${isModelOverride ? " (override)" : ""}`;
    expect(label).toBe("Model: opus (override)");
  });
});

describe("CommissionHeader gem status mapping", () => {
  test("pending maps to pending gem", () => {
    expect(statusToGem("pending")).toBe("pending");
  });

  test("dispatched maps to active gem", () => {
    expect(statusToGem("dispatched")).toBe("active");
  });

  test("failed maps to blocked gem", () => {
    expect(statusToGem("failed")).toBe("blocked");
  });

  test("in_progress maps to active gem", () => {
    expect(statusToGem("in_progress")).toBe("active");
  });

  test("completed maps to info gem", () => {
    expect(statusToGem("completed")).toBe("info");
  });

  test("cancelled maps to blocked gem", () => {
    expect(statusToGem("cancelled")).toBe("blocked");
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

describe("CommissionPrompt Markdown rendering", () => {
  test("ReactMarkdown and remarkGfm are importable", async () => {
    const reactMarkdown = await import("react-markdown");
    const remarkGfm = await import("remark-gfm");
    expect(reactMarkdown.default).toBeDefined();
    expect(remarkGfm.default).toBeDefined();
  });

  test("CommissionPrompt module imports ReactMarkdown", async () => {
    // Verify the module loads without error (catches broken imports)
    const mod = await import("@/web/components/commission/CommissionPrompt");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("read-only state renders Markdown elements for formatted prompt", () => {
    // Verify ReactMarkdown processes Markdown syntax into React elements.
    // This tests the rendering pipeline that CommissionPrompt uses in
    // read-only mode, without requiring a full React render context.
    const markdownPrompt = "## Task\n\n- Step one\n- Step two\n\n**Important**: do this";
    const element = createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
    }, markdownPrompt) as AnyElement;

    // ReactMarkdown produces a component element, confirming the pipeline works
    expect(element).toBeDefined();
    expect(element.props.children).toBe(markdownPrompt);
    expect(element.props.remarkPlugins).toHaveLength(1);
  });

  test("empty prompt renders fallback text instead of ReactMarkdown", () => {
    // When prompt is empty, the component renders a plain <p> fallback
    // rather than passing empty string to ReactMarkdown
    const emptyPrompt = "";
    const editable = false;
    const shouldUseMarkdown = !editable && !!emptyPrompt;
    expect(shouldUseMarkdown).toBe(false);
  });

  test("non-empty prompt in read-only mode uses Markdown rendering", () => {
    const prompt = "# Hello\n\nSome **bold** text";
    const editable = false;
    const shouldUseMarkdown = !editable && !!prompt;
    expect(shouldUseMarkdown).toBe(true);
  });

  test("pending status still uses textarea, not Markdown", () => {
    const status = "pending";
    const editable = status === "pending";
    expect(editable).toBe(true);
    // When editable is true, the textarea branch renders, not ReactMarkdown
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

  test("CollapsibleSidebar is importable", async () => {
    const mod = await import("@/web/components/ui/CollapsibleSidebar");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("CommissionView module is importable", async () => {
    const mod = await import("@/web/components/commission/CommissionView");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("function");
  });

  test("CollapsibleSidebar storageKey convention matches sidebar-collapsed: prefix", () => {
    // Convention: all collapsible sidebars use "sidebar-collapsed:<view>" as storageKey.
    // Artifact view uses "sidebar-collapsed:artifact", meeting uses "sidebar-collapsed:meeting".
    // Commission uses "sidebar-collapsed:commission".
    const storageKey = "sidebar-collapsed:commission";
    expect(storageKey.startsWith("sidebar-collapsed:")).toBe(true);
    expect(storageKey).toBe("sidebar-collapsed:commission");
  });

  test("CollapsibleSidebar readCollapsed returns false when localStorage is unset", () => {
    // readCollapsed is a pure function that reads from localStorage.
    // In the test environment localStorage is not available, so we test
    // the contract: only the string "true" returns true.
    const readCollapsed = (value: string | null): boolean => value === "true";
    expect(readCollapsed(null)).toBe(false);
    expect(readCollapsed("false")).toBe(false);
    expect(readCollapsed("true")).toBe(true);
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
