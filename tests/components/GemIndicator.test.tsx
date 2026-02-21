import { describe, test, expect } from "bun:test";
import GemIndicator from "@/components/ui/GemIndicator";

/**
 * GemIndicator is a server component (plain function returning JSX).
 * We call it directly and inspect the returned React element.
 *
 * CSS module class names resolve to undefined in bun test, so className
 * tests verify structural behavior (the filter/join pattern produces a
 * string) rather than specific CSS class values. The alt text mapping
 * and img src are fully testable since they're plain data.
 */

describe("GemIndicator", () => {
  describe("alt text", () => {
    const cases: Array<{ status: "active" | "pending" | "blocked" | "info"; expected: string }> = [
      { status: "active", expected: "Active" },
      { status: "pending", expected: "Pending" },
      { status: "blocked", expected: "Blocked" },
      { status: "info", expected: "Info" },
    ];

    for (const { status, expected } of cases) {
      test(`status "${status}" has alt text "${expected}"`, () => {
        const el = GemIndicator({ status });
        expect(el.props.alt).toBe(expected);
      });
    }
  });

  describe("renders as img element", () => {
    test("returns an img element with the gem asset src", () => {
      const el = GemIndicator({ status: "active" });
      expect(el.type).toBe("img");
      expect(el.props.src).toBe("/images/ui/gem.webp");
    });
  });

  describe("className construction", () => {
    test("className is always a string", () => {
      const el = GemIndicator({ status: "pending", size: "sm" });
      expect(typeof el.props.className).toBe("string");
    });

    test("different status values produce the same element structure", () => {
      const statuses: Array<"active" | "pending" | "blocked" | "info"> = [
        "active",
        "pending",
        "blocked",
        "info",
      ];

      for (const status of statuses) {
        const el = GemIndicator({ status, size: "md" });
        expect(el.type).toBe("img");
        expect(el.props.src).toBe("/images/ui/gem.webp");
        expect(typeof el.props.className).toBe("string");
      }
    });

    test("both size variants produce valid elements", () => {
      const sm = GemIndicator({ status: "active", size: "sm" });
      const md = GemIndicator({ status: "active", size: "md" });

      expect(sm.type).toBe("img");
      expect(md.type).toBe("img");
      expect(typeof sm.props.className).toBe("string");
      expect(typeof md.props.className).toBe("string");
    });
  });

  describe("default size", () => {
    test("omitting size produces the same structure as explicit md", () => {
      const defaultSize = GemIndicator({ status: "info" });
      const explicitMd = GemIndicator({ status: "info", size: "md" });

      // Both should be img elements with the same alt text
      expect(defaultSize.type).toBe(explicitMd.type);
      expect(defaultSize.props.alt).toBe(explicitMd.props.alt);
      expect(defaultSize.props.src).toBe(explicitMd.props.src);
    });
  });
});
