import { describe, test, expect } from "bun:test";
import StatusBadge from "@/web/components/ui/StatusBadge";
import type { GemStatus } from "@/lib/types";

/**
 * StatusBadge is a server component (plain function returning JSX).
 * We call it directly and inspect the returned React element tree,
 * following the same pattern as GemIndicator.test.tsx.
 *
 * CSS module class names resolve to undefined in bun test, so we verify
 * structural behavior (element types, props, children) rather than
 * specific CSS class values.
 */

interface AnyElement {
  type: string | ((...args: unknown[]) => unknown);
  props: Record<string, unknown>;
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
      if (child && typeof child === "object" && "type" in child && "props" in child) {
        results.push(...findComponentElements(child as AnyElement, componentName));
      }
    }
  }

  return results;
}

function findSpanElements(element: AnyElement): AnyElement[] {
  const results: AnyElement[] = [];

  if (element.type === "span") {
    results.push(element);
  }

  const children = element.props.children;
  if (children) {
    const childArray = Array.isArray(children) ? children : [children];
    for (const child of childArray) {
      if (child && typeof child === "object" && "type" in child && "props" in child) {
        results.push(...findSpanElements(child as AnyElement));
      }
    }
  }

  return results;
}

describe("StatusBadge", () => {
  describe("renders GemIndicator with correct props", () => {
    const gemStatuses: GemStatus[] = ["active", "pending", "blocked", "info"];

    for (const gem of gemStatuses) {
      test(`passes gem="${gem}" as status to GemIndicator`, () => {
        const el = StatusBadge({ gem, label: "test" }) as AnyElement;
        const gems = findComponentElements(el, "GemIndicator");
        expect(gems).toHaveLength(1);
        expect(gems[0].props.status).toBe(gem);
      });
    }
  });

  describe("formats label text", () => {
    test('"complete" renders as "Complete"', () => {
      const el = StatusBadge({ gem: "active", label: "complete" }) as AnyElement;
      const spans = findSpanElements(el);
      // The label span is the second span (first is the outer badge span)
      const labelSpan = spans.find(
        (s) => s.props.children === "Complete",
      );
      expect(labelSpan).toBeDefined();
    });

    test('"in_progress" renders as "In Progress"', () => {
      const el = StatusBadge({ gem: "active", label: "in_progress" }) as AnyElement;
      const spans = findSpanElements(el);
      const labelSpan = spans.find(
        (s) => s.props.children === "In Progress",
      );
      expect(labelSpan).toBeDefined();
    });
  });

  describe("label color classes", () => {
    const cases: Array<{ gem: GemStatus; expectedSuffix: string }> = [
      { gem: "active", expectedSuffix: "Active" },
      { gem: "pending", expectedSuffix: "Pending" },
      { gem: "blocked", expectedSuffix: "Blocked" },
      { gem: "info", expectedSuffix: "Info" },
    ];

    for (const { gem } of cases) {
      test(`gem="${gem}" applies a label className string`, () => {
        const el = StatusBadge({ gem, label: "test" }) as AnyElement;
        // The label span has a className that combines styles.label and styles[`label${Gem}`]
        // In bun test, CSS modules resolve to undefined, so className is "undefined undefined"
        // We verify the structure exists: the second child of the badge span is a span with className
        const children = el.props.children as AnyElement[];
        const labelSpan = children[1];
        expect(labelSpan.type).toBe("span");
        expect(typeof labelSpan.props.className).toBe("string");
      });
    }
  });

  describe("size prop", () => {
    test("defaults to sm", () => {
      const el = StatusBadge({ gem: "active", label: "test" }) as AnyElement;
      const gems = findComponentElements(el, "GemIndicator");
      expect(gems[0].props.size).toBe("sm");
    });

    test("passes md to GemIndicator when specified", () => {
      const el = StatusBadge({ gem: "active", label: "test", size: "md" }) as AnyElement;
      const gems = findComponentElements(el, "GemIndicator");
      expect(gems[0].props.size).toBe("md");
    });
  });

  describe("badge wrapper structure", () => {
    test("outer element is a span", () => {
      const el = StatusBadge({ gem: "info", label: "draft" }) as AnyElement;
      expect(el.type).toBe("span");
    });

    test("has two children: GemIndicator and label span", () => {
      const el = StatusBadge({ gem: "info", label: "draft" }) as AnyElement;
      const children = el.props.children as AnyElement[];
      expect(children).toHaveLength(2);
      // First child is GemIndicator (function component)
      expect(typeof children[0].type).toBe("function");
      // Second child is a span (label)
      expect(children[1].type).toBe("span");
    });
  });
});
