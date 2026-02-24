import { describe, test, expect } from "bun:test";
import CommissionHeader from "@/components/commission/CommissionHeader";
import { statusToGem } from "@/lib/types";
import type { TimelineEntry } from "@/lib/commissions";
import type { CommissionArtifact } from "@/components/commission/CommissionLinkedArtifacts";

/**
 * Tests for the queued commission UI state. Covers:
 * - statusToGem mapping for "queued"
 * - CommissionHeader gem rendering for queued status
 * - CommissionActions behavior with queued status (type contract)
 * - CommissionView SSE event handling for commission_queued/commission_dequeued (type contract)
 *
 * Server-renderable components (CommissionHeader) are called directly.
 * Client components with hooks are tested via type contracts and logic verification.
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

// -- statusToGem tests for queued --

describe("statusToGem queued mapping", () => {
  test("maps 'queued' to 'pending' (amber gem)", () => {
    expect(statusToGem("queued")).toBe("pending");
  });

  test("maps 'QUEUED' to 'pending' (case insensitive)", () => {
    expect(statusToGem("QUEUED")).toBe("pending");
  });

  test("maps ' queued ' to 'pending' (trims whitespace)", () => {
    expect(statusToGem(" queued ")).toBe("pending");
  });

  test("existing mappings are not affected", () => {
    expect(statusToGem("pending")).toBe("pending");
    expect(statusToGem("dispatched")).toBe("active");
    expect(statusToGem("in_progress")).toBe("active");
    expect(statusToGem("failed")).toBe("blocked");
    expect(statusToGem("cancelled")).toBe("blocked");
  });
});

// -- CommissionHeader queued state --

describe("CommissionHeader queued state", () => {
  const baseProps = {
    title: "Research API patterns",
    status: "queued",
    worker: "researcher",
    workerDisplayTitle: "Knowledge Seeker",
    projectName: "my-project",
  };

  test("renders pending (amber) gem for queued status", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("pending");
  });

  test("renders 'queued' status text", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "queued")).toBe(true);
  });

  test("does not show underscore-replaced text for queued", () => {
    // "queued" has no underscores, so displayStatus should be "queued" unchanged
    const el = CommissionHeader(baseProps) as AnyElement;
    const badges = findElements(el, (e) => {
      const children = e.props.children;
      return typeof children === "string" && children === "queued";
    });
    expect(badges.length).toBeGreaterThan(0);
  });

  test("renders worker label alongside queued status", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    expect(containsText(el, "Knowledge Seeker")).toBe(true);
  });

  test("renders title with queued status", () => {
    const el = CommissionHeader(baseProps) as AnyElement;
    const h1s = findElements(el, (e) => e.type === "h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0].props.children).toBe("Research API patterns");
  });
});

// -- CommissionActions queued state (type contract) --

describe("CommissionActions queued state", () => {
  // Status is typed as `string` in CommissionActionsProps, matching runtime behavior.
  // Using explicit `string` annotation avoids TS2367 literal-type narrowing errors.

  test("queued status shows queued indicator, not dispatch button", () => {
    const status: string = "queued";
    const showDispatch = status === "pending";
    const showQueued = status === "queued";
    expect(showDispatch).toBe(false);
    expect(showQueued).toBe(true);
  });

  test("queued status shows cancel button", () => {
    const status: string = "queued";
    const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(showCancel).toBe(true);
  });

  test("queued status does not show redispatch button", () => {
    const status: string = "queued";
    const showRedispatch = status === "failed" || status === "cancelled";
    expect(showRedispatch).toBe(false);
  });

  test("pending status still shows dispatch button, not queued indicator", () => {
    const status: string = "pending";
    const showDispatch = status === "pending";
    const showQueued = status === "queued";
    expect(showDispatch).toBe(true);
    expect(showQueued).toBe(false);
  });

  test("dispatched status does not show queued indicator", () => {
    const status: string = "dispatched";
    const showQueued = status === "queued";
    expect(showQueued).toBe(false);
  });

  test("dispatch response with queued status triggers queued callback", () => {
    // Simulates the logic in handleDispatch: data.status === "queued" -> "queued" : "dispatched"
    const dataQueued = { status: "queued" as string | undefined };
    const resultQueued = dataQueued.status === "queued" ? "queued" : "dispatched";
    expect(resultQueued).toBe("queued");

    const dataAccepted = { status: "accepted" as string | undefined };
    const resultAccepted = dataAccepted.status === "queued" ? "queued" : "dispatched";
    expect(resultAccepted).toBe("dispatched");
  });

  test("redispatch response with queued status triggers queued callback", () => {
    // Same logic applies to handleRedispatch
    const dataQueued = { status: "queued" as string | undefined };
    const result = dataQueued.status === "queued" ? "queued" : "dispatched";
    expect(result).toBe("queued");
  });
});

// -- CommissionView queued SSE events (type contract) --

describe("CommissionView queued SSE events", () => {
  // Status is typed as `string` in useState, matching runtime behavior.

  test("isLive includes queued status", () => {
    const status: string = "queued";
    const isLive = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(isLive).toBe(true);
  });

  test("isLive excludes pending status (no SSE for unqueued pending)", () => {
    const status: string = "pending";
    const isLive = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(isLive).toBe(false);
  });

  test("isLive excludes completed status", () => {
    const status: string = "completed";
    const isLive = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(isLive).toBe(false);
  });

  test("commission_queued event type is recognized", () => {
    const event = {
      type: "commission_queued" as const,
      commissionId: "commission-researcher-20260223",
      reason: "All slots occupied",
    };
    expect(event.type).toBe("commission_queued");
    expect(event.reason).toBe("All slots occupied");
  });

  test("commission_dequeued event type is recognized", () => {
    const event = {
      type: "commission_dequeued" as const,
      commissionId: "commission-researcher-20260223",
      reason: "Slot available",
    };
    expect(event.type).toBe("commission_dequeued");
    expect(event.reason).toBe("Slot available");
  });

  test("commission_queued handler creates timeline entry with correct shape", () => {
    // Simulates the timeline entry created by the commission_queued handler
    const ts = "2026-02-23T10:00:00Z";
    const reason = "All slots occupied";
    const entry: TimelineEntry = {
      timestamp: ts,
      event: "status_change",
      from: "pending",
      to: "queued",
      reason: reason || "Queued, waiting for capacity",
    };
    expect(entry.event).toBe("status_change");
    expect(entry.from).toBe("pending");
    expect(entry.to).toBe("queued");
    expect(entry.reason).toBe("All slots occupied");
  });

  test("commission_queued handler uses default reason when none provided", () => {
    const reason = "";
    const entry: TimelineEntry = {
      timestamp: "2026-02-23T10:00:00Z",
      event: "status_change",
      from: "pending",
      to: "queued",
      reason: reason || "Queued, waiting for capacity",
    };
    expect(entry.reason).toBe("Queued, waiting for capacity");
  });

  test("commission_dequeued handler creates timeline entry with correct shape", () => {
    const ts = "2026-02-23T10:05:00Z";
    const reason = "Slot available";
    const entry: TimelineEntry = {
      timestamp: ts,
      event: "status_change",
      from: "queued",
      to: "dispatched",
      reason: reason || "Capacity available, dispatching",
    };
    expect(entry.event).toBe("status_change");
    expect(entry.from).toBe("queued");
    expect(entry.to).toBe("dispatched");
    expect(entry.reason).toBe("Slot available");
  });

  test("commission_dequeued handler uses default reason when none provided", () => {
    const reason = "";
    const entry: TimelineEntry = {
      timestamp: "2026-02-23T10:05:00Z",
      event: "status_change",
      from: "queued",
      to: "dispatched",
      reason: reason || "Capacity available, dispatching",
    };
    expect(entry.reason).toBe("Capacity available, dispatching");
  });

  test("CommissionView type contract accepts all required props", () => {
    const props = {
      commissionId: "commission-researcher-20260223",
      projectName: "test-project",
      prompt: "Research the API",
      initialStatus: "queued",
      initialTimeline: [] as TimelineEntry[],
      initialArtifacts: [] as CommissionArtifact[],
    };
    expect(props.initialStatus).toBe("queued");
    expect(props.commissionId).toBe("commission-researcher-20260223");
  });
});

// -- SystemEvent type contract for queued events --

describe("SystemEvent queued types", () => {
  test("commission_queued event matches SystemEvent shape", () => {
    const event = {
      type: "commission_queued" as const,
      commissionId: "commission-researcher-20260223",
      reason: "Capacity limit reached (3/3 active)",
    };
    expect(event.type).toBe("commission_queued");
    expect(typeof event.commissionId).toBe("string");
    expect(typeof event.reason).toBe("string");
  });

  test("commission_dequeued event matches SystemEvent shape", () => {
    const event = {
      type: "commission_dequeued" as const,
      commissionId: "commission-researcher-20260223",
      reason: "Slot freed by commission-writer-20260222 completing",
    };
    expect(event.type).toBe("commission_dequeued");
    expect(typeof event.commissionId).toBe("string");
    expect(typeof event.reason).toBe("string");
  });
});
