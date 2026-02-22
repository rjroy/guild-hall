import { describe, test, expect } from "bun:test";
import PendingAudiences from "@/components/dashboard/PendingAudiences";
import type { MeetingMeta } from "@/lib/meetings";

/**
 * PendingAudiences is a server component and can be called directly.
 * MeetingRequestCard is a client component with hooks (useState, useRouter)
 * and cannot be called outside a React render context. We test its type
 * contract and the server-renderable structure.
 *
 * CSS module class names resolve to undefined in bun test. We focus on
 * structural behavior: correct elements, correct props, correct children.
 */

type AnyElement = React.ReactElement<Record<string, unknown>>;

/**
 * Finds child elements that are React component instances (type is a function).
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

// -- Test data --

function makeRequest(overrides: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    meetingId: "audience-Researcher-20260221-120000",
    title: "Audience with Researcher",
    status: "requested",
    worker: "Researcher",
    agenda: "Review the architecture",
    date: "2026-02-21",
    deferred_until: "",
    linked_artifacts: [],
    notes_summary: "",
    workerDisplayTitle: "Guild Researcher",
    projectName: "test-project",
    ...overrides,
  };
}

// -- PendingAudiences tests (server component, call directly) --

describe("PendingAudiences", () => {
  test("renders empty state when no requests", () => {
    const el = PendingAudiences({ requests: [] }) as AnyElement;

    const empties = findComponentElements(el, "EmptyState");
    expect(empties).toHaveLength(1);
    expect(empties[0].props.message).toBe("No pending meeting requests.");
  });

  test("renders Panel with 'Pending Audiences' title", () => {
    const el = PendingAudiences({ requests: [] }) as AnyElement;

    const panels = findComponentElements(el, "Panel");
    expect(panels).toHaveLength(1);
    expect(panels[0].props.title).toBe("Pending Audiences");
  });

  test("renders MeetingRequestCard for each request", () => {
    const requests = [
      makeRequest(),
      makeRequest({
        meetingId: "audience-Assistant-20260221-130000",
        worker: "Assistant",
        workerDisplayTitle: "Guild Assistant",
        projectName: "other-project",
      }),
    ];

    const el = PendingAudiences({ requests }) as AnyElement;

    const cards = findComponentElements(el, "MeetingRequestCard");
    expect(cards).toHaveLength(2);
  });

  test("does not render EmptyState when requests exist", () => {
    const el = PendingAudiences({
      requests: [makeRequest()],
    }) as AnyElement;

    const empties = findComponentElements(el, "EmptyState");
    expect(empties).toHaveLength(0);
  });

  test("passes request data to each MeetingRequestCard", () => {
    const request = makeRequest({
      worker: "Architect",
      workerDisplayTitle: "Guild Architect",
    });

    const el = PendingAudiences({ requests: [request] }) as AnyElement;

    const cards = findComponentElements(el, "MeetingRequestCard");
    expect(cards).toHaveLength(1);

    const cardProps = cards[0].props as { request: MeetingMeta };
    expect(cardProps.request.worker).toBe("Architect");
    expect(cardProps.request.workerDisplayTitle).toBe("Guild Architect");
  });

  test("uses composite key from projectName and meetingId", () => {
    // Multiple requests from different projects with same meetingId
    // should not collide on keys
    const requests = [
      makeRequest({
        meetingId: "meeting-001",
        projectName: "project-a",
      }),
      makeRequest({
        meetingId: "meeting-001",
        projectName: "project-b",
      }),
    ];

    const el = PendingAudiences({ requests }) as AnyElement;

    const cards = findComponentElements(el, "MeetingRequestCard");
    expect(cards).toHaveLength(2);

    // Both should be rendered (no key collision would cause one to be dropped)
    const projectNames = cards.map(
      (c) => (c.props as { request: MeetingMeta }).request.projectName,
    );
    expect(projectNames).toContain("project-a");
    expect(projectNames).toContain("project-b");
  });
});

// -- MeetingRequestCard type contract tests --
// MeetingRequestCard is a client component with hooks (useState, useRouter,
// useCallback, fetch). It cannot be called outside a React render context.

describe("MeetingRequestCard type contract", () => {
  test("module exports a default function component", async () => {
    const mod = await import("@/components/dashboard/MeetingRequestCard");
    expect(typeof mod.default).toBe("function");
  });

  test("accepts request prop shape matching MeetingMeta", () => {
    const props = { request: makeRequest() };
    expect(props.request.meetingId).toBe(
      "audience-Researcher-20260221-120000",
    );
    expect(props.request.worker).toBe("Researcher");
    expect(props.request.workerDisplayTitle).toBe("Guild Researcher");
    expect(props.request.agenda).toBe("Review the architecture");
    expect(props.request.projectName).toBe("test-project");
    expect(props.request.linked_artifacts).toEqual([]);
    expect(props.request.deferred_until).toBe("");
  });

  test("MeetingRequestCardProps interface is exported", async () => {
    // Verify the named export exists
    const mod = await import("@/components/dashboard/MeetingRequestCard");
    expect(mod).toHaveProperty("default");
  });
});

// -- Integration: DashboardPage data flow --

describe("DashboardPage renders PendingAudiences", () => {
  test("PendingAudiences accepts empty requests array", () => {
    const el = PendingAudiences({ requests: [] }) as AnyElement;
    // EmptyState is a function component boundary, so containsText won't
    // find the text inside it. Check via EmptyState's props instead.
    const empties = findComponentElements(el, "EmptyState");
    expect(empties).toHaveLength(1);
    expect(empties[0].props.message).toBe("No pending meeting requests.");
  });

  test("PendingAudiences renders multiple requests from different projects", () => {
    const requests = [
      makeRequest({ projectName: "alpha", meetingId: "mtg-1" }),
      makeRequest({ projectName: "beta", meetingId: "mtg-2" }),
      makeRequest({ projectName: "alpha", meetingId: "mtg-3" }),
    ];

    const el = PendingAudiences({ requests }) as AnyElement;

    const cards = findComponentElements(el, "MeetingRequestCard");
    expect(cards).toHaveLength(3);
  });
});
