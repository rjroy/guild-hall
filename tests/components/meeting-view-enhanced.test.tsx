import { describe, test, expect } from "bun:test";
import ArtifactsPanel from "@/components/meeting/ArtifactsPanel";
import NotesDisplay from "@/components/meeting/NotesDisplay";
import type { LinkedArtifact } from "@/components/meeting/ArtifactsPanel";

/**
 * Meeting view enhancement tests for Phase 3 Step 9.
 * Tests ArtifactsPanel and NotesDisplay components.
 *
 * These are server-renderable components (no hooks in their own body),
 * so we call them directly and inspect the React element tree.
 *
 * CSS module class names resolve to undefined in bun test. We focus on
 * structural behavior: correct elements, correct props, correct children.
 */

type AnyElement = React.ReactElement<Record<string, unknown>>;

/**
 * Walks a React element tree depth-first, collecting elements that match
 * a predicate.
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

// -- ArtifactsPanel tests --

describe("ArtifactsPanel", () => {
  const sampleArtifacts: LinkedArtifact[] = [
    {
      path: "specs/system.md",
      title: "system",
      exists: true,
      href: "/projects/test-project/artifacts/specs/system.md",
    },
    {
      path: "notes/architecture.md",
      title: "architecture",
      exists: true,
      href: "/projects/test-project/artifacts/notes/architecture.md",
    },
  ];

  test("renders linked artifact list", () => {
    const el = ArtifactsPanel({
      artifacts: sampleArtifacts,
    }) as AnyElement;

    // Should contain both artifact titles
    expect(containsText(el, "system")).toBe(true);
    expect(containsText(el, "architecture")).toBe(true);
  });

  test("renders artifact paths", () => {
    const el = ArtifactsPanel({
      artifacts: sampleArtifacts,
    }) as AnyElement;

    expect(containsText(el, "specs/system.md")).toBe(true);
    expect(containsText(el, "notes/architecture.md")).toBe(true);
  });

  test("renders links for existing artifacts", () => {
    const el = ArtifactsPanel({
      artifacts: sampleArtifacts,
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => e.type === "a" && typeof e.props.href === "string",
    );
    expect(links.length).toBeGreaterThanOrEqual(2);

    const hrefs = links.map((l) => l.props.href);
    expect(hrefs).toContain(
      "/projects/test-project/artifacts/specs/system.md",
    );
    expect(hrefs).toContain(
      "/projects/test-project/artifacts/notes/architecture.md",
    );
  });

  test("shows empty state when no artifacts", () => {
    const el = ArtifactsPanel({ artifacts: [] }) as AnyElement;

    expect(containsText(el, "No artifacts linked yet.")).toBe(true);
  });

  test('shows "(not found)" for missing artifacts', () => {
    const missingArtifact: LinkedArtifact = {
      path: "missing/deleted-spec.md",
      title: "deleted-spec",
      exists: false,
      href: "/projects/test-project/artifacts/missing/deleted-spec.md",
    };

    const el = ArtifactsPanel({
      artifacts: [missingArtifact],
    }) as AnyElement;

    expect(containsText(el, "(not found)")).toBe(true);
    expect(containsText(el, "deleted-spec")).toBe(true);
  });

  test("does not render links for missing artifacts", () => {
    const missingArtifact: LinkedArtifact = {
      path: "missing/gone.md",
      title: "gone",
      exists: false,
      href: "/projects/test-project/artifacts/missing/gone.md",
    };

    const el = ArtifactsPanel({
      artifacts: [missingArtifact],
    }) as AnyElement;

    // Should render a span, not an anchor, for missing artifacts
    const links = findElements(
      el,
      (e) =>
        e.type === "a" &&
        typeof e.props.href === "string" &&
        String(e.props.href).includes("gone"),
    );
    expect(links).toHaveLength(0);
  });

  test("renders title heading", () => {
    const el = ArtifactsPanel({ artifacts: [] }) as AnyElement;

    expect(containsText(el, "Linked Artifacts")).toBe(true);
  });

  test("has aria-expanded attribute on toggle button", () => {
    const el = ArtifactsPanel({
      artifacts: [],
      expanded: true,
    }) as AnyElement;

    const buttons = findElements(el, (e) => e.type === "button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(buttons[0].props["aria-expanded"]).toBe(true);
  });

  test("renders list items for each artifact", () => {
    const el = ArtifactsPanel({
      artifacts: sampleArtifacts,
    }) as AnyElement;

    const listItems = findElements(el, (e) => e.type === "li");
    expect(listItems).toHaveLength(2);
  });
});

// -- NotesDisplay tests --

describe("NotesDisplay", () => {
  const baseProps = {
    projectHref: "/projects/my-project",
    projectName: "my-project",
  };

  test("renders generated notes", () => {
    const el = NotesDisplay({
      ...baseProps,
      notes: "The meeting covered architecture decisions and testing strategy.",
    }) as AnyElement;

    expect(
      containsText(
        el,
        "The meeting covered architecture decisions and testing strategy.",
      ),
    ).toBe(true);
  });

  test('renders "Audience Notes" title when notes present', () => {
    const el = NotesDisplay({
      ...baseProps,
      notes: "Some notes here.",
    }) as AnyElement;

    expect(containsText(el, "Audience Notes")).toBe(true);
  });

  test('shows "This audience has ended." when no notes', () => {
    const el = NotesDisplay({ ...baseProps }) as AnyElement;

    expect(containsText(el, "This audience has ended.")).toBe(true);
  });

  test('shows "Audience Ended" title when no notes', () => {
    const el = NotesDisplay({ ...baseProps }) as AnyElement;

    expect(containsText(el, "Audience Ended")).toBe(true);
  });

  test('shows "This audience has ended." for empty notes string', () => {
    const el = NotesDisplay({
      ...baseProps,
      notes: "  ",
    }) as AnyElement;

    expect(containsText(el, "This audience has ended.")).toBe(true);
  });

  test("has back link to project", () => {
    const el = NotesDisplay({
      ...baseProps,
      notes: "Notes content.",
    }) as AnyElement;

    const links = findElements(
      el,
      (e) => e.type === "a" && typeof e.props.href === "string",
    );
    expect(links.length).toBeGreaterThanOrEqual(1);

    const backLink = links.find(
      (l) => (l.props.href as string) === "/projects/my-project",
    );
    expect(backLink).toBeDefined();
    expect(containsText(backLink!, "my-project")).toBe(true);
  });

  test("renders as dialog role", () => {
    const el = NotesDisplay({ ...baseProps }) as AnyElement;

    // Root element should have role="dialog"
    expect(el.props.role).toBe("dialog");
  });

  test("back link shows project name", () => {
    const el = NotesDisplay({
      projectHref: "/projects/guild-hall",
      projectName: "guild-hall",
    }) as AnyElement;

    expect(containsText(el, "guild-hall")).toBe(true);
  });
});
