import { describe, test, expect } from "bun:test";
import {
  categorizeTools,
  buildSummaryText,
} from "@/apps/web/components/meeting/CollapsibleToolList";
import type { ToolUseEntry } from "@/lib/types";

/**
 * Tests for the CollapsibleToolList component's pure logic functions
 * and its integration with parent components (StreamingMessage, MessageBubble).
 *
 * The component itself uses useState, so it cannot be called directly in bun test.
 * We test:
 * 1. categorizeTools — splits tools into active vs completed
 * 2. buildSummaryText — generates the summary label
 * 3. Parent component integration — verify CollapsibleToolList appears
 *    in the element tree with correct props
 */

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

// -- categorizeTools --

describe("categorizeTools", () => {
  test("empty array returns empty categories", () => {
    const result = categorizeTools([]);
    expect(result.activeTools).toEqual([]);
    expect(result.completedTools).toEqual([]);
  });

  test("running tools go to activeTools", () => {
    const tools: ToolUseEntry[] = [
      { name: "read_file", status: "running" },
      { name: "write_file", status: "running" },
    ];
    const result = categorizeTools(tools);
    expect(result.activeTools).toHaveLength(2);
    expect(result.completedTools).toHaveLength(0);
  });

  test("complete tools go to completedTools", () => {
    const tools: ToolUseEntry[] = [
      { name: "read_file", status: "complete", output: "content" },
      { name: "search", status: "complete", output: "results" },
    ];
    const result = categorizeTools(tools);
    expect(result.activeTools).toHaveLength(0);
    expect(result.completedTools).toHaveLength(2);
  });

  test("mixed statuses are split correctly", () => {
    const tools: ToolUseEntry[] = [
      { name: "read_file", status: "complete", output: "content" },
      { name: "write_file", status: "running" },
      { name: "search", status: "complete", output: "results" },
      { name: "edit_file", status: "running" },
    ];
    const result = categorizeTools(tools);
    expect(result.activeTools).toHaveLength(2);
    expect(result.activeTools[0].name).toBe("write_file");
    expect(result.activeTools[1].name).toBe("edit_file");
    expect(result.completedTools).toHaveLength(2);
    expect(result.completedTools[0].name).toBe("read_file");
    expect(result.completedTools[1].name).toBe("search");
  });

  test("preserves tool entry data in categorized output", () => {
    const tool: ToolUseEntry = {
      id: "tool-1",
      name: "read_file",
      status: "complete",
      input: { path: "/tmp/test.txt" },
      output: "file content",
    };
    const result = categorizeTools([tool]);
    expect(result.completedTools[0]).toBe(tool);
  });
});

// -- buildSummaryText --

describe("buildSummaryText", () => {
  test("streaming with 1 completed tool uses singular", () => {
    expect(buildSummaryText(1, true)).toBe("1 tool completed");
  });

  test("streaming with multiple completed tools uses plural", () => {
    expect(buildSummaryText(5, true)).toBe("5 tools completed");
  });

  test("not streaming with 1 tool uses singular", () => {
    expect(buildSummaryText(1, false)).toBe("1 tool used");
  });

  test("not streaming with multiple tools uses plural", () => {
    expect(buildSummaryText(12, false)).toBe("12 tools used");
  });

  test("large tool counts render correctly", () => {
    expect(buildSummaryText(100, false)).toBe("100 tools used");
    expect(buildSummaryText(100, true)).toBe("100 tools completed");
  });
});

// -- Parent component integration --

describe("MessageBubble renders CollapsibleToolList", () => {
  test("message with tools renders CollapsibleToolList with isStreaming=false", async () => {
    const { default: MB } = await import(
      "@/apps/web/components/meeting/MessageBubble"
    );
    const tools: ToolUseEntry[] = [
      { name: "read_file", status: "complete", output: "content" },
      { name: "write_file", status: "complete", output: "done" },
    ];

    const el = MB({
      message: {
        id: "msg-1",
        role: "assistant",
        content: "Done.",
        toolUses: tools,
      },
    }) as AnyElement;

    const collapsible = findComponentElements(el, "CollapsibleToolList");
    expect(collapsible).toHaveLength(1);
    expect(collapsible[0].props.tools).toEqual(tools);
    expect(collapsible[0].props.isStreaming).toBe(false);
  });

  test("message without tools does not render CollapsibleToolList", async () => {
    const { default: MB } = await import(
      "@/apps/web/components/meeting/MessageBubble"
    );

    const el = MB({
      message: { id: "msg-2", role: "assistant", content: "No tools." },
    }) as AnyElement;

    const collapsible = findComponentElements(el, "CollapsibleToolList");
    expect(collapsible).toHaveLength(0);
  });

  test("user message with no toolUses does not render CollapsibleToolList", async () => {
    const { default: MB } = await import(
      "@/apps/web/components/meeting/MessageBubble"
    );

    const el = MB({
      message: { id: "msg-3", role: "user", content: "Hello" },
    }) as AnyElement;

    const collapsible = findComponentElements(el, "CollapsibleToolList");
    expect(collapsible).toHaveLength(0);
  });
});

describe("StreamingMessage renders CollapsibleToolList", () => {
  test("streaming with tools renders CollapsibleToolList with isStreaming=true", async () => {
    const { default: SM } = await import(
      "@/apps/web/components/meeting/StreamingMessage"
    );
    const tools: ToolUseEntry[] = [
      { name: "read_file", status: "complete", output: "content" },
      { name: "search", status: "running" },
    ];

    const el = SM({
      content: "Working...",
      tools,
    }) as AnyElement;

    const collapsible = findComponentElements(el, "CollapsibleToolList");
    expect(collapsible).toHaveLength(1);
    expect(collapsible[0].props.tools).toEqual(tools);
    expect(collapsible[0].props.isStreaming).toBe(true);
  });

  test("streaming with no tools does not render CollapsibleToolList", async () => {
    const { default: SM } = await import(
      "@/apps/web/components/meeting/StreamingMessage"
    );

    const el = SM({
      content: "Text only",
      tools: [],
    }) as AnyElement;

    const collapsible = findComponentElements(el, "CollapsibleToolList");
    expect(collapsible).toHaveLength(0);
  });
});

// -- Existing test compatibility --
// The old tests checked for ToolUseIndicator directly in parent trees.
// With CollapsibleToolList, ToolUseIndicator now lives inside CollapsibleToolList,
// which is a hook-based component that won't be expanded in the element tree.
// Verify that the component boundary is correct.

describe("CollapsibleToolList replaces direct ToolUseIndicator rendering", () => {
  test("MessageBubble no longer renders ToolUseIndicator directly", async () => {
    const { default: MB } = await import(
      "@/apps/web/components/meeting/MessageBubble"
    );
    const tools: ToolUseEntry[] = [
      { name: "read_file", status: "complete", output: "content" },
    ];

    const el = MB({
      message: {
        id: "msg-1",
        role: "assistant",
        content: "Done",
        toolUses: tools,
      },
    }) as AnyElement;

    // ToolUseIndicator should NOT appear at the MessageBubble level;
    // it's now inside CollapsibleToolList (a component boundary)
    const indicators = findComponentElements(el, "ToolUseIndicator");
    expect(indicators).toHaveLength(0);
  });

  test("StreamingMessage no longer renders ToolUseIndicator directly", async () => {
    const { default: SM } = await import(
      "@/apps/web/components/meeting/StreamingMessage"
    );

    const el = SM({
      content: "",
      tools: [{ name: "search", status: "running" }],
    }) as AnyElement;

    const indicators = findComponentElements(el, "ToolUseIndicator");
    expect(indicators).toHaveLength(0);
  });
});
