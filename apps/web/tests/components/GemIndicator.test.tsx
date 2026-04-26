import { describe, test, expect } from "bun:test";
import GemIndicator from "@/apps/web/components/ui/GemIndicator";

/**
 * GemIndicator is a server component (plain function returning JSX).
 * We call it directly and inspect the returned React element.
 *
 * CSS module class names resolve to undefined in bun test, so className
 * tests verify structural behavior (the filter/join pattern produces a
 * string) rather than specific CSS class values. The aria-label mapping
 * is fully testable since it's plain data.
 */

describe("GemIndicator", () => {
  describe("aria-label", () => {
    const cases: Array<{ status: "active" | "pending" | "blocked" | "info"; expected: string }> = [
      { status: "active", expected: "Active" },
      { status: "pending", expected: "Pending" },
      { status: "blocked", expected: "Blocked" },
      { status: "info", expected: "Info" },
    ];

    for (const { status, expected } of cases) {
      test(`status "${status}" has aria-label "${expected}"`, () => {
        const el = GemIndicator({ status });
        expect(el.props["aria-label"]).toBe(expected);
      });
    }
  });

  describe("renders as a span with role=img", () => {
    test("returns a span element with role=img", () => {
      const el = GemIndicator({ status: "active" });
      expect(el.type).toBe("span");
      expect(el.props.role).toBe("img");
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
        expect(el.type).toBe("span");
        expect(el.props.role).toBe("img");
        expect(typeof el.props.className).toBe("string");
      }
    });

    test("both size variants produce valid elements", () => {
      const sm = GemIndicator({ status: "active", size: "sm" });
      const md = GemIndicator({ status: "active", size: "md" });

      expect(sm.type).toBe("span");
      expect(md.type).toBe("span");
      expect(typeof sm.props.className).toBe("string");
      expect(typeof md.props.className).toBe("string");
    });
  });

  describe("default size", () => {
    test("omitting size produces the same structure as explicit md", () => {
      const defaultSize = GemIndicator({ status: "info" });
      const explicitMd = GemIndicator({ status: "info", size: "md" });

      expect(defaultSize.type).toBe(explicitMd.type);
      expect(defaultSize.props["aria-label"]).toBe(explicitMd.props["aria-label"]);
    });
  });
});
