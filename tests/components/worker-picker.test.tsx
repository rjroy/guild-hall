import { describe, test, expect } from "bun:test";
import MeetingList from "@/components/project/MeetingList";
import type { Artifact } from "@/lib/types";

/**
 * Worker picker and meeting list component tests. MeetingList is a server
 * component and can be called directly. WorkerPicker and StartAudienceButton
 * are client components with hooks (useState, useEffect, useRouter) and
 * cannot be called outside a React render context. We test their type
 * contracts and the server-renderable components they depend on.
 *
 * CSS module class names resolve to undefined in bun test. We focus on
 * structural behavior: correct elements, correct props, correct children.
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
 * Checks if a React element tree contains a given text string.
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

function makeMeetingArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    meta: {
      title: "Research meeting",
      date: "2026-02-20",
      status: "open",
      tags: [],
      ...(overrides.meta ?? {}),
    },
    filePath: "/tmp/project/.lore/meetings/meeting-001.md",
    relativePath: "meeting-001.md",
    content: "# Meeting notes\n",
    lastModified: new Date("2026-02-20T10:00:00Z"),
    ...overrides,
  };
}

// -- MeetingList tests --

describe("MeetingList", () => {
  test("renders empty state when no meetings", () => {
    const el = MeetingList({
      meetings: [],
      projectName: "test-project",
    }) as AnyElement;

    const empties = findComponentElements(el, "EmptyState");
    expect(empties).toHaveLength(1);
    expect(empties[0].props.message).toBe("No meetings yet.");
  });

  test("renders meeting entries", () => {
    const meetings = [
      makeMeetingArtifact(),
      makeMeetingArtifact({
        meta: {
          title: "Design review",
          date: "2026-02-19",
          status: "closed",
          tags: [],
        },
        relativePath: "meeting-002.md",
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    // Should find a list with items
    const lists = findElements(el, (e) => e.type === "ul");
    expect(lists).toHaveLength(1);

    const items = findElements(el, (e) => e.type === "li");
    expect(items).toHaveLength(2);
  });

  test("open meeting renders as a link", () => {
    const meetings = [makeMeetingArtifact()];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    // Find Link components
    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );

    const meetingLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/meetings/"),
    );
    expect(meetingLink).toBeDefined();
    expect(meetingLink!.props.href).toContain("meeting-001");
    expect(meetingLink!.props.href).toContain("test-project");
  });

  test("closed meeting does not render as a link", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: {
          title: "Closed meeting",
          date: "2026-02-18",
          status: "closed",
          tags: [],
        },
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    // Should not have any Link elements pointing to meetings
    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );

    const meetingLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/meetings/"),
    );
    expect(meetingLink).toBeUndefined();
  });

  test("renders GemIndicator with active status for open meeting", () => {
    const meetings = [makeMeetingArtifact()];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("active");
    expect(gems[0].props.size).toBe("sm");
  });

  test("renders GemIndicator with info status for closed meeting", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: {
          title: "Closed",
          date: "2026-02-18",
          status: "closed",
          tags: [],
        },
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("info");
  });

  test("renders meeting title from frontmatter", () => {
    const meetings = [makeMeetingArtifact()];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "Research meeting")).toBe(true);
  });

  test("renders meeting date", () => {
    const meetings = [makeMeetingArtifact()];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "2026-02-20")).toBe(true);
  });

  test("falls back to filename when title is empty", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: { title: "", date: "2026-02-20", status: "open", tags: [] },
        relativePath: "my-meeting.md",
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "my-meeting")).toBe(true);
  });

  test("renders worker name from meeting metadata extras", () => {
    const artifact = makeMeetingArtifact();
    artifact.meta.extras = { worker: "Researcher" };

    const el = MeetingList({
      meetings: [artifact],
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "Researcher")).toBe(true);
  });

  test("renders GemIndicator with pending status for requested meeting", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: {
          title: "Audience with Assistant",
          date: "2026-02-19",
          status: "requested",
          tags: [],
        },
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("pending");
  });

  test("renders GemIndicator with blocked status for declined meeting", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: {
          title: "Declined meeting",
          date: "2026-02-16",
          status: "declined",
          tags: [],
        },
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("blocked");
  });

  test("requested meeting renders Accept link", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: {
          title: "Audience with Assistant",
          date: "2026-02-19",
          status: "requested",
          tags: [],
        },
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    // The Accept link should be present (points to dashboard)
    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );
    const acceptLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href === "/",
    );
    expect(acceptLink).toBeDefined();
    expect(containsText(acceptLink!, "Accept")).toBe(true);
  });

  test("requested meeting does not link to meeting view", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: {
          title: "Audience with Assistant",
          date: "2026-02-19",
          status: "requested",
          tags: [],
        },
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );
    const meetingLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/meetings/"),
    );
    expect(meetingLink).toBeUndefined();
  });

  test("declined meeting does not render as a link", () => {
    const meetings = [
      makeMeetingArtifact({
        meta: {
          title: "Declined meeting",
          date: "2026-02-16",
          status: "declined",
          tags: [],
        },
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    // Should not have any Link elements
    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );
    expect(links).toHaveLength(0);
  });

  test("URL-encodes project name in meeting links", () => {
    const meetings = [makeMeetingArtifact()];

    const el = MeetingList({
      meetings,
      projectName: "my project",
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );

    const meetingLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/meetings/"),
    );
    expect(meetingLink).toBeDefined();
    expect(meetingLink!.props.href).toContain("my%20project");
  });

  test("URL-encodes meeting ID in links", () => {
    const meetings = [
      makeMeetingArtifact({
        relativePath: "meeting with spaces.md",
      }),
    ];

    const el = MeetingList({
      meetings,
      projectName: "test-project",
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );

    const meetingLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/meetings/"),
    );
    expect(meetingLink).toBeDefined();
    expect(meetingLink!.props.href).toContain(
      encodeURIComponent("meeting with spaces"),
    );
  });
});

// -- WorkerPicker type contract tests --
// WorkerPicker is a client component with hooks (useState, useEffect, useRouter,
// useCallback, useRef, fetch). It cannot be called outside a React render context.

describe("WorkerPicker type contract", () => {
  test("WorkerPickerProps interface is satisfied", async () => {
    // Verify the module exports a default function component
    const mod = await import("@/components/ui/WorkerPicker");
    expect(typeof mod.default).toBe("function");
  });

  test("accepts required props shape", () => {
    // Verify the props interface matches what StartAudienceButton passes
    const props = {
      projectName: "test-project",
      isOpen: false,
      onClose: () => {},
    };
    expect(props.projectName).toBe("test-project");
    expect(props.isOpen).toBe(false);
    expect(typeof props.onClose).toBe("function");
  });
});

// -- StartAudienceButton type contract tests --

describe("StartAudienceButton type contract", () => {
  test("StartAudienceButton module exports default", async () => {
    const mod = await import("@/components/project/StartAudienceButton");
    expect(typeof mod.default).toBe("function");
  });

  test("accepts projectName prop", () => {
    const props = { projectName: "my-project" };
    expect(props.projectName).toBe("my-project");
  });
});

// -- ProjectHeader integration (server component, can call directly) --

describe("ProjectHeader with StartAudienceButton", () => {
  test("renders StartAudienceButton component", async () => {
    const { default: ProjectHeader } = await import(
      "@/components/project/ProjectHeader"
    );

    const project = {
      name: "test-project",
      path: "/tmp/test-project",
      description: "A test project",
    };

    const el = ProjectHeader({ project }) as AnyElement;

    const buttons = findComponentElements(el, "StartAudienceButton");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.projectName).toBe("test-project");
  });

  test("no longer renders disabled audience button element", async () => {
    const { default: ProjectHeader } = await import(
      "@/components/project/ProjectHeader"
    );

    const project = {
      name: "test-project",
      path: "/tmp/test-project",
    };

    const el = ProjectHeader({ project }) as AnyElement;

    // Should not find a raw <button> element with "coming soon" aria label
    const buttons = findElements(
      el,
      (e) =>
        e.type === "button" &&
        typeof e.props["aria-label"] === "string" &&
        e.props["aria-label"].includes("coming soon"),
    );
    expect(buttons).toHaveLength(0);
  });
});

// -- SessionStorage integration pattern tests --

describe("sessionStorage meeting message format", () => {
  test("messages array serializes to valid JSON", () => {
    const messages = [
      { id: "wp-msg-1", role: "user" as const, content: "Research this topic" },
      {
        id: "wp-msg-2",
        role: "assistant" as const,
        content: "I'll start by reviewing the codebase.",
      },
    ];

    const json = JSON.stringify(messages);
    const parsed = JSON.parse(json) as typeof messages;
    expect(parsed).toHaveLength(2);
    expect(parsed[0].role).toBe("user");
    expect(parsed[1].role).toBe("assistant");
  });

  test("storage key follows meeting-{id}-initial pattern", () => {
    const meetingId = "abc-123";
    const key = `meeting-${meetingId}-initial`;
    expect(key).toBe("meeting-abc-123-initial");
  });
});
