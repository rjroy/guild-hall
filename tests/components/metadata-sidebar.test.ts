import { describe, test, expect } from "bun:test";
import MetadataSidebar, {
  relatedToHref,
  createCommissionHref,
  requestMeetingHref,
} from "@/web/components/artifact/MetadataSidebar";
import type { CommissionMeta } from "@/lib/commissions";
import type { ArtifactMeta } from "@/lib/types";

type AnyElement = React.ReactElement<Record<string, unknown>>;

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

function makeArtifactMeta(overrides: Partial<ArtifactMeta> = {}): ArtifactMeta {
  return {
    title: "Test Artifact",
    date: "2026-02-21",
    status: "approved",
    tags: [],
    ...overrides,
  };
}

function makeCommission(
  overrides: Partial<CommissionMeta> = {},
): CommissionMeta {
  return {
    commissionId: "commission-researcher-20260221-143000",
    title: "Research API patterns",
    status: "pending",
    type: "one-shot",
    sourceSchedule: "",
    sourceTrigger: "",
    worker: "researcher",
    workerDisplayTitle: "Lead Researcher",
    prompt: "Investigate the best API patterns.",
    dependencies: [],
    linked_artifacts: [],
    resource_overrides: {},
    current_progress: "",
    result_summary: "",
    projectName: "test-project",
    date: "2026-02-21",
    relevantDate: "",
    ...overrides,
  };
}

describe("relatedToHref", () => {
  test("strips .lore/ prefix from related paths", () => {
    const href = relatedToHref(".lore/specs/guild-hall-system.md", "my-project");
    expect(href).toBe("/projects/my-project/artifacts/specs/guild-hall-system.md");
  });

  test("handles paths without .lore/ prefix", () => {
    const href = relatedToHref("specs/other.md", "my-project");
    expect(href).toBe("/projects/my-project/artifacts/specs/other.md");
  });

  test("encodes project names with special characters", () => {
    const href = relatedToHref(".lore/plans/impl.md", "my project");
    expect(href).toBe("/projects/my%20project/artifacts/plans/impl.md");
  });

  test("handles deeply nested paths", () => {
    const href = relatedToHref(".lore/plans/phase-1/step-3.md", "project");
    expect(href).toBe("/projects/project/artifacts/plans/phase-1/step-3.md");
  });

  test("encodes artifact path segments with special characters", () => {
    const href = relatedToHref(".lore/specs/my doc.md", "project");
    expect(href).toBe("/projects/project/artifacts/specs/my%20doc.md");
  });
});

// -- createCommissionHref --

describe("createCommissionHref", () => {
  test("builds href with tab, newCommission, and dep params", () => {
    const href = createCommissionHref("my-project", "specs/api.md");
    expect(href).toBe(
      "/projects/my-project?tab=commissions&newCommission=true&dep=specs%2Fapi.md",
    );
  });

  test("encodes project name with special characters", () => {
    const href = createCommissionHref("my project", "specs/api.md");
    expect(href).toContain("/projects/my%20project?");
  });

  test("encodes artifact path with special characters", () => {
    const href = createCommissionHref("proj", "specs/my doc.md");
    expect(href).toContain("dep=specs%2Fmy%20doc.md");
  });

  test("handles deeply nested artifact paths", () => {
    const href = createCommissionHref("proj", "plans/phase-1/step-3.md");
    expect(href).toContain("dep=plans%2Fphase-1%2Fstep-3.md");
  });
});

// -- requestMeetingHref --

describe("requestMeetingHref", () => {
  test("builds href with tab, newMeeting, and artifact params", () => {
    const href = requestMeetingHref("my-project", "specs/api.md");
    expect(href).toBe(
      "/projects/my-project?tab=meetings&newMeeting=true&artifact=specs%2Fapi.md",
    );
  });

  test("encodes project name with special characters", () => {
    const href = requestMeetingHref("my project", "specs/api.md");
    expect(href).toContain("/projects/my%20project?");
  });

  test("encodes artifact path (slashes become %2F)", () => {
    const href = requestMeetingHref("proj", "plans/phase-1/step-3.md");
    expect(href).toContain("artifact=plans%2Fphase-1%2Fstep-3.md");
  });
});

// -- MetadataSidebar Actions section --

describe("MetadataSidebar Actions section", () => {
  test("renders request-meeting link when artifactPath is provided", () => {
    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: [],
    }) as AnyElement;

    const meetingLinks = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("newMeeting=true"),
    );
    expect(meetingLinks).toHaveLength(1);
    expect(meetingLinks[0].props.href).toContain("artifact=specs%2Fapi.md");
  });

  test("renders both commission and meeting links as peers", () => {
    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: [],
    }) as AnyElement;

    const commissionLinks = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("newCommission=true"),
    );
    const meetingLinks = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("newMeeting=true"),
    );
    expect(commissionLinks).toHaveLength(1);
    expect(meetingLinks).toHaveLength(1);
  });

  test("does not render meeting link without artifactPath", () => {
    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
    }) as AnyElement;

    const meetingLinks = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("newMeeting=true"),
    );
    expect(meetingLinks).toHaveLength(0);
  });
});

// -- MetadataSidebar commission rendering --

describe("MetadataSidebar associated commissions", () => {
  test("shows EmptyState when no commissions match", () => {
    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: [],
    }) as AnyElement;

    const empties = findComponentElements(el, "EmptyState");
    const commissionsEmpty = empties.find(
      (e) => e.props.message === "No commissions reference this artifact.",
    );
    expect(commissionsEmpty).toBeDefined();
  });

  test("renders commission links when matches exist", () => {
    const commissions = [
      makeCommission({ commissionId: "c-1", title: "First Task" }),
      makeCommission({
        commissionId: "c-2",
        title: "Second Task",
        status: "in_progress",
      }),
    ];

    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: commissions,
    }) as AnyElement;

    // Should not show the empty state for commissions section
    const empties = findComponentElements(el, "EmptyState");
    const commissionsEmpty = empties.find(
      (e) => e.props.message === "No commissions reference this artifact.",
    );
    expect(commissionsEmpty).toBeUndefined();

    // Should have links to commission detail pages
    const links = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("/commissions/"),
    );
    expect(links).toHaveLength(2);
  });

  test("commission links include correct hrefs", () => {
    const commissions = [
      makeCommission({ commissionId: "commission-abc-123" }),
    ];

    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: commissions,
    }) as AnyElement;

    const links = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("/commissions/"),
    );
    expect(links).toHaveLength(1);
    expect(links[0].props.href).toBe(
      "/projects/test-project/commissions/commission-abc-123",
    );
  });

  test("renders GemIndicator for each commission", () => {
    const commissions = [
      makeCommission({ status: "in_progress" }),
    ];

    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: commissions,
    }) as AnyElement;

    // Find gem indicators inside commission links
    const commissionLinks = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("/commissions/"),
    );
    expect(commissionLinks.length).toBeGreaterThan(0);

    // The GemIndicator should be a child of the commission link
    const gems = findComponentElements(commissionLinks[0], "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("active");
  });

  test("falls back to commissionId when title is empty", () => {
    const commissions = [
      makeCommission({ commissionId: "c-fallback", title: "" }),
    ];

    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: commissions,
    }) as AnyElement;

    expect(containsText(el, "c-fallback")).toBe(true);
  });

  test("renders create-commission link when artifactPath is provided", () => {
    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
      artifactPath: "specs/api.md",
      associatedCommissions: [],
    }) as AnyElement;

    const createLinks = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("newCommission=true"),
    );
    expect(createLinks).toHaveLength(1);
    expect(createLinks[0].props.href).toContain("dep=specs%2Fapi.md");
  });

  test("does not render create-commission link without artifactPath", () => {
    const el = MetadataSidebar({
      meta: makeArtifactMeta(),
      projectName: "test-project",
    }) as AnyElement;

    const createLinks = findElements(
      el,
      (e) =>
        typeof e.props.href === "string" &&
        e.props.href.includes("newCommission=true"),
    );
    expect(createLinks).toHaveLength(0);
  });
});

// -- Commission matching logic --

describe("commission matching by linked_artifacts", () => {
  test("filters commissions that include the artifact path", () => {
    const allCommissions = [
      makeCommission({
        commissionId: "c-1",
        linked_artifacts: ["specs/api.md", "designs/schema.md"],
      }),
      makeCommission({
        commissionId: "c-2",
        linked_artifacts: ["specs/other.md"],
      }),
      makeCommission({
        commissionId: "c-3",
        linked_artifacts: ["specs/api.md"],
      }),
    ];

    const artifactPath = "specs/api.md";
    const matches = allCommissions.filter((c) =>
      c.linked_artifacts.includes(artifactPath),
    );

    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.commissionId)).toEqual(["c-1", "c-3"]);
  });

  test("returns empty when no commissions reference the artifact", () => {
    const allCommissions = [
      makeCommission({
        commissionId: "c-1",
        linked_artifacts: ["specs/other.md"],
      }),
    ];

    const matches = allCommissions.filter((c) =>
      c.linked_artifacts.includes("specs/api.md"),
    );

    expect(matches).toHaveLength(0);
  });

  test("handles commissions with empty linked_artifacts", () => {
    const allCommissions = [
      makeCommission({ commissionId: "c-1", linked_artifacts: [] }),
    ];

    const matches = allCommissions.filter((c) =>
      c.linked_artifacts.includes("specs/api.md"),
    );

    expect(matches).toHaveLength(0);
  });

  test("matches exact paths only, not partial matches", () => {
    const allCommissions = [
      makeCommission({
        commissionId: "c-1",
        linked_artifacts: ["specs/api-v2.md"],
      }),
    ];

    const matches = allCommissions.filter((c) =>
      c.linked_artifacts.includes("specs/api.md"),
    );

    expect(matches).toHaveLength(0);
  });
});
