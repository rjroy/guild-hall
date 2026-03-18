import { describe, test, expect } from "bun:test";
import ArtifactProvenance from "@/web/components/artifact/ArtifactProvenance";

type AnyElement = React.ReactElement<Record<string, unknown>>;

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

describe("ArtifactProvenance", () => {
  test("renders CopyPathButton with .lore/ prefix prepended to artifactPath", () => {
    const el = ArtifactProvenance({
      projectName: "test-project",
      artifactTitle: "Test Artifact",
      artifactPath: "specs/guild-hall-system.md",
    }) as AnyElement;

    const buttons = findComponentElements(el, "CopyPathButton");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.path).toBe(".lore/specs/guild-hall-system.md");
  });

  test("renders ArtifactBreadcrumb with correct props", () => {
    const el = ArtifactProvenance({
      projectName: "my-project",
      artifactTitle: "My Artifact",
      artifactPath: "plans/impl.md",
    }) as AnyElement;

    const breadcrumbs = findComponentElements(el, "ArtifactBreadcrumb");
    expect(breadcrumbs).toHaveLength(1);
    expect(breadcrumbs[0].props.projectName).toBe("my-project");
    expect(breadcrumbs[0].props.artifactTitle).toBe("My Artifact");
  });

  test("CopyPathButton and ArtifactBreadcrumb are direct siblings (share a parent)", () => {
    const el = ArtifactProvenance({
      projectName: "test-project",
      artifactTitle: "Test",
      artifactPath: "notes/session.md",
    }) as AnyElement;

    // Walk the tree to find a div whose direct children include both components.
    function hasBothAsDirectChildren(element: AnyElement): boolean {
      const children = element.props.children;
      if (!children) return false;
      const childArray = Array.isArray(children) ? children : [children];
      const names = childArray
        .filter((c) => c && typeof c === "object" && "type" in c)
        .map((c) => (c as AnyElement).type)
        .filter((t) => typeof t === "function")
        .map((t) => (t as { name?: string }).name ?? "");
      return names.includes("ArtifactBreadcrumb") && names.includes("CopyPathButton");
    }

    function findWithBoth(element: AnyElement): boolean {
      if (hasBothAsDirectChildren(element)) return true;
      const children = element.props.children;
      if (!children) return false;
      const childArray = Array.isArray(children) ? children : [children];
      return childArray.some(
        (c) =>
          c &&
          typeof c === "object" &&
          "type" in c &&
          "props" in c &&
          findWithBoth(c as AnyElement),
      );
    }

    expect(findWithBoth(el)).toBe(true);
  });

  test("prepends .lore/ for deeply nested artifact paths", () => {
    const el = ArtifactProvenance({
      projectName: "test-project",
      artifactTitle: "Deep Artifact",
      artifactPath: "plans/phase-1/step-3.md",
    }) as AnyElement;

    const buttons = findComponentElements(el, "CopyPathButton");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].props.path).toBe(".lore/plans/phase-1/step-3.md");
  });
});
