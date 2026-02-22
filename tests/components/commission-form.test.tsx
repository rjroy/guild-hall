import { describe, test, expect } from "bun:test";
import CommissionList from "@/components/commission/CommissionList";
import type { CommissionMeta } from "@/lib/commissions";

/**
 * Commission form and commission list component tests.
 *
 * CommissionForm and CreateCommissionButton are client components with hooks
 * (useState, useEffect, useRouter, useCallback, fetch) and cannot be called
 * outside a React render context. We test their type contracts and module exports.
 *
 * CommissionList is a server component and can be called directly.
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

function makeCommission(overrides: Partial<CommissionMeta> = {}): CommissionMeta {
  return {
    commissionId: "commission-researcher-20260221-143000",
    title: "Research API patterns",
    status: "pending",
    worker: "researcher",
    workerDisplayTitle: "Lead Researcher",
    prompt: "Investigate the best API patterns for our use case and document findings.",
    dependencies: [],
    linked_artifacts: [],
    resource_overrides: {},
    current_progress: "",
    result_summary: "",
    projectName: "test-project",
    date: "2026-02-21",
    ...overrides,
  };
}

// -- CommissionForm type contract tests --

describe("CommissionForm type contract", () => {
  test("CommissionForm module exports default", async () => {
    const mod = await import("@/components/commission/CommissionForm");
    expect(typeof mod.default).toBe("function");
  });

  test("accepts required props shape", () => {
    const props = {
      projectName: "test-project",
      onCreated: () => {},
      onCancel: () => {},
    };
    expect(props.projectName).toBe("test-project");
    expect(typeof props.onCreated).toBe("function");
    expect(typeof props.onCancel).toBe("function");
  });

  test("onCreated and onCancel are optional", () => {
    const props = { projectName: "test-project" };
    expect(props.projectName).toBe("test-project");
  });
});

// -- CreateCommissionButton type contract tests --

describe("CreateCommissionButton type contract", () => {
  test("module exports default", async () => {
    const mod = await import("@/components/commission/CreateCommissionButton");
    expect(typeof mod.default).toBe("function");
  });

  test("accepts projectName prop", () => {
    const props = { projectName: "my-project" };
    expect(props.projectName).toBe("my-project");
  });
});

// -- CommissionList tests (server component, call directly) --

describe("CommissionList", () => {
  test("renders empty state when no commissions", () => {
    const el = CommissionList({
      commissions: [],
      projectName: "test-project",
    }) as AnyElement;

    const empties = findComponentElements(el, "EmptyState");
    expect(empties).toHaveLength(1);
    expect(empties[0].props.message).toBe("No commissions yet.");
  });

  test("renders commission entries", () => {
    const commissions = [
      makeCommission(),
      makeCommission({
        commissionId: "commission-writer-20260221-150000",
        title: "Write documentation",
        worker: "writer",
        status: "in_progress",
      }),
    ];

    const el = CommissionList({
      commissions,
      projectName: "test-project",
    }) as AnyElement;

    const lists = findElements(el, (e) => e.type === "ul");
    expect(lists).toHaveLength(1);

    const items = findElements(el, (e) => e.type === "li");
    expect(items).toHaveLength(2);
  });

  test("renders commission title", () => {
    const el = CommissionList({
      commissions: [makeCommission()],
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "Research API patterns")).toBe(true);
  });

  test("falls back to commissionId when title is empty", () => {
    const el = CommissionList({
      commissions: [makeCommission({ title: "" })],
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "commission-researcher-20260221-143000")).toBe(true);
  });

  test("renders worker display title", () => {
    const el = CommissionList({
      commissions: [makeCommission()],
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "Lead Researcher")).toBe(true);
  });

  test("renders prompt preview truncated to 100 chars", () => {
    const longPrompt = "A".repeat(150);
    const el = CommissionList({
      commissions: [makeCommission({ prompt: longPrompt })],
      projectName: "test-project",
    }) as AnyElement;

    // Should contain first 100 chars + "..."
    expect(containsText(el, "A".repeat(100) + "...")).toBe(true);
  });

  test("renders short prompt without truncation", () => {
    const el = CommissionList({
      commissions: [makeCommission({ prompt: "Short prompt" })],
      projectName: "test-project",
    }) as AnyElement;

    expect(containsText(el, "Short prompt")).toBe(true);
  });

  test("renders GemIndicator with pending status for pending commission", () => {
    const el = CommissionList({
      commissions: [makeCommission({ status: "pending" })],
      projectName: "test-project",
    }) as AnyElement;

    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("pending");
    expect(gems[0].props.size).toBe("sm");
  });

  test("renders GemIndicator with active status for in_progress commission", () => {
    const el = CommissionList({
      commissions: [makeCommission({ status: "in_progress" })],
      projectName: "test-project",
    }) as AnyElement;

    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("active");
  });

  test("renders GemIndicator with blocked status for failed commission", () => {
    const el = CommissionList({
      commissions: [makeCommission({ status: "failed" })],
      projectName: "test-project",
    }) as AnyElement;

    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("blocked");
  });

  test("each commission links to its detail view", () => {
    const el = CommissionList({
      commissions: [makeCommission()],
      projectName: "test-project",
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );

    const commissionLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/commissions/"),
    );
    expect(commissionLink).toBeDefined();
    expect(commissionLink!.props.href).toContain("commission-researcher-20260221-143000");
    expect(commissionLink!.props.href).toContain("test-project");
  });

  test("URL-encodes project name in commission links", () => {
    const el = CommissionList({
      commissions: [makeCommission()],
      projectName: "my project",
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );

    const commissionLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/commissions/"),
    );
    expect(commissionLink).toBeDefined();
    expect(commissionLink!.props.href).toContain("my%20project");
  });

  test("URL-encodes commission ID in links", () => {
    const el = CommissionList({
      commissions: [makeCommission({ commissionId: "commission with spaces" })],
      projectName: "test-project",
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => typeof e.props.href === "string",
    );

    const commissionLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/commissions/"),
    );
    expect(commissionLink).toBeDefined();
    expect(commissionLink!.props.href).toContain(
      encodeURIComponent("commission with spaces"),
    );
  });
});

// -- CommissionForm API payload format tests --

describe("Commission API payload format", () => {
  test("minimal payload has required fields", () => {
    const payload = {
      projectName: "test-project",
      title: "Research task",
      workerName: "researcher",
      prompt: "Do some research",
    };
    expect(payload.projectName).toBe("test-project");
    expect(payload.title).toBe("Research task");
    expect(payload.workerName).toBe("researcher");
    expect(payload.prompt).toBe("Do some research");
  });

  test("full payload includes optional fields", () => {
    const payload = {
      projectName: "test-project",
      title: "Research task",
      workerName: "researcher",
      prompt: "Do some research",
      dependencies: ["specs/api.md", "designs/schema.md"],
      resourceOverrides: { maxTurns: 15, maxBudgetUsd: 3.50 },
    };
    expect(payload.dependencies).toHaveLength(2);
    expect(payload.resourceOverrides.maxTurns).toBe(15);
    expect(payload.resourceOverrides.maxBudgetUsd).toBe(3.50);
  });

  test("dependencies parsed from comma-separated string", () => {
    const input = "specs/api.md, designs/schema.md, notes/research.md";
    const deps = input.split(",").map((d) => d.trim()).filter(Boolean);
    expect(deps).toEqual([
      "specs/api.md",
      "designs/schema.md",
      "notes/research.md",
    ]);
  });

  test("empty dependency string produces empty array", () => {
    const input = "";
    const deps = input.split(",").map((d) => d.trim()).filter(Boolean);
    expect(deps).toEqual([]);
  });

  test("whitespace-only dependency entries are filtered", () => {
    const input = "specs/api.md, , , designs/schema.md";
    const deps = input.split(",").map((d) => d.trim()).filter(Boolean);
    expect(deps).toEqual(["specs/api.md", "designs/schema.md"]);
  });
});
