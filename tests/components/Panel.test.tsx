import { describe, test, expect } from "bun:test";
import Panel from "@/components/ui/Panel";

/**
 * Panel is a server component (plain function returning JSX).
 * We call it directly and inspect the returned React element tree.
 *
 * CSS module class names are undefined in bun test, so we focus on
 * structural behavior: does the title render when provided? Are children
 * present? Does the className prop get applied?
 */

/**
 * Walks a React element tree depth-first and collects all elements
 * matching a predicate. Simple utility for testing component output
 * without a DOM.
 */
function findElements(
  element: React.ReactElement,
  predicate: (el: React.ReactElement) => boolean
): React.ReactElement[] {
  const results: React.ReactElement[] = [];

  if (predicate(element)) {
    results.push(element);
  }

  const children = element.props?.children;
  if (children) {
    const childArray = Array.isArray(children) ? children : [children];
    for (const child of childArray) {
      if (child && typeof child === "object" && "type" in child && "props" in child) {
        results.push(...findElements(child, predicate));
      }
    }
  }

  return results;
}

/**
 * Checks if a React element tree contains a given text string anywhere
 * in its children (including nested elements).
 */
function containsText(element: React.ReactElement, text: string): boolean {
  const children = element.props?.children;
  if (typeof children === "string" && children.includes(text)) {
    return true;
  }
  if (Array.isArray(children)) {
    return children.some((child) => {
      if (typeof child === "string" && child.includes(text)) return true;
      if (child && typeof child === "object" && "props" in child) {
        return containsText(child, text);
      }
      return false;
    });
  }
  if (children && typeof children === "object" && "props" in children) {
    return containsText(children, text);
  }
  return false;
}

describe("Panel", () => {
  describe("structure", () => {
    test("renders as a div", () => {
      const el = Panel({ children: "content" });
      expect(el.type).toBe("div");
    });

    test("renders children within the panel", () => {
      const el = Panel({ children: "Hello World" });
      expect(containsText(el, "Hello World")).toBe(true);
    });

    test("renders JSX children", () => {
      const child = <span data-testid="child">Nested content</span>;
      const el = Panel({ children: child });

      const spans = findElements(el, (e) => e.type === "span");
      expect(spans.length).toBeGreaterThanOrEqual(1);

      const testSpan = spans.find(
        (s) => s.props["data-testid"] === "child"
      );
      expect(testSpan).toBeDefined();
      expect(testSpan!.props.children).toBe("Nested content");
    });
  });

  describe("title", () => {
    test("renders title in an h2 when provided", () => {
      const el = Panel({ title: "My Panel Title", children: "body" });

      const h2s = findElements(el, (e) => e.type === "h2");
      expect(h2s).toHaveLength(1);
      expect(h2s[0].props.children).toBe("My Panel Title");
    });

    test("does not render h2 when title is omitted", () => {
      const el = Panel({ children: "body" });

      const h2s = findElements(el, (e) => e.type === "h2");
      expect(h2s).toHaveLength(0);
    });

    test("renders header wrapper div around the title", () => {
      const withTitle = Panel({ title: "Test", children: "body" });
      const withoutTitle = Panel({ children: "body" });

      // With title: there should be more structural divs
      const withDivs = findElements(withTitle, (e) => e.type === "div");
      const withoutDivs = findElements(withoutTitle, (e) => e.type === "div");

      // The title version has an extra header div
      expect(withDivs.length).toBeGreaterThan(withoutDivs.length);
    });
  });

  describe("className", () => {
    test("className prop is a string", () => {
      const el = Panel({ children: "body" });
      expect(typeof el.props.className).toBe("string");
    });

    test("custom className is included in the root element", () => {
      const el = Panel({ className: "my-custom-class", children: "body" });
      expect(el.props.className).toContain("my-custom-class");
    });

    test("all size variants produce valid elements", () => {
      const sizes: Array<"sm" | "md" | "lg" | "full"> = ["sm", "md", "lg", "full"];
      for (const size of sizes) {
        const el = Panel({ size, children: "body" });
        expect(el.type).toBe("div");
        expect(typeof el.props.className).toBe("string");
      }
    });

    test("default size produces same structure as explicit md", () => {
      const defaultSize = Panel({ children: "body" });
      const explicitMd = Panel({ size: "md", children: "body" });

      expect(defaultSize.type).toBe(explicitMd.type);
    });
  });
});
