import { describe, test, expect } from "bun:test";
import { containerInteractiveProps } from "@/web/components/ui/DetailHeader";

/**
 * DetailHeader is a client component using useState, so it cannot be called
 * directly in bun test. We test the extracted pure logic that determines
 * container interactivity based on the condensed state.
 *
 * Behavioral contract:
 * - Condensed: container is clickable (role="button", tabIndex=0, click handler)
 * - Expanded: container is inert (no role, no tabIndex, no click handler)
 */

describe("containerInteractiveProps", () => {
  test("condensed state makes container clickable", () => {
    const props = containerInteractiveProps(true);
    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    expect(props.hasClickHandler).toBe(true);
  });

  test("expanded state leaves container inert", () => {
    const props = containerInteractiveProps(false);
    expect(props.role).toBeUndefined();
    expect(props.tabIndex).toBeUndefined();
    expect(props.hasClickHandler).toBe(false);
  });
});
