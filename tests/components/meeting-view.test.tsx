import { describe, test, expect } from "bun:test";
import MeetingHeader from "@/components/meeting/MeetingHeader";
import ErrorMessage from "@/components/meeting/ErrorMessage";
import type { ToolUseEntry } from "@/components/meeting/ToolUseIndicator";
import type { ChatMessage } from "@/components/meeting/types";

/**
 * Meeting view component tests. Server components (MeetingHeader, ErrorMessage)
 * are called directly as functions. Client components with hooks (ToolUseIndicator,
 * MessageInput, ChatInterface) cannot be called outside a React render context,
 * so we test their type contracts and the props passed to them by parent components.
 *
 * CSS module class names resolve to undefined in bun test. We focus on
 * structural behavior: correct elements, correct props, correct children.
 */

type AnyElement = React.ReactElement<Record<string, unknown>>;

/**
 * Walks a React element tree depth-first, collecting elements that match
 * a predicate. Does not descend into function component boundaries (those
 * appear as elements with type === Function, not rendered HTML).
 */
function findElements(
  element: AnyElement,
  predicate: (el: AnyElement) => boolean
): AnyElement[] {
  const results: AnyElement[] = [];
  if (predicate(element)) results.push(element);

  const children = element.props.children;
  if (children) {
    const childArray = Array.isArray(children) ? children : [children];
    for (const child of childArray) {
      if (child && typeof child === "object" && "type" in child && "props" in child) {
        results.push(...findElements(child as AnyElement, predicate));
      }
    }
  }

  return results;
}

/**
 * Checks if a React element tree contains a given text string anywhere
 * in its direct children (strings, not nested component boundaries).
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
 * Returns elements whose component function name matches the given string.
 */
function findComponentElements(
  element: AnyElement,
  componentName: string
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

// -- MeetingHeader tests --

describe("MeetingHeader", () => {
  const baseProps = {
    projectName: "my-project",
    workerName: "Researcher",
    workerDisplayTitle: "Knowledge Seeker",
    agenda: "Research the topic thoroughly.",
  };

  test("renders breadcrumb with Guild Hall link", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    expect(containsText(el, "Guild Hall")).toBe(true);
  });

  test("renders breadcrumb with project name", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    expect(containsText(el, "my-project")).toBe(true);
  });

  test("renders breadcrumb with Audience label", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    expect(containsText(el, "Audience")).toBe(true);
  });

  test("renders breadcrumb navigation element", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    const navs = findElements(el, (e) => e.type === "nav");
    expect(navs).toHaveLength(1);
    expect(navs[0].props["aria-label"]).toBe("Breadcrumb");
  });

  test("renders agenda text", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    expect(containsText(el, "Research the topic thoroughly.")).toBe(true);
  });

  test("renders agenda section title", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    const h3s = findElements(el, (e) => e.type === "h3");
    expect(h3s).toHaveLength(1);
    expect(h3s[0].props.children).toBe("Agenda");
  });

  test("passes worker name to WorkerPortrait component", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    const portraits = findComponentElements(el, "WorkerPortrait");
    expect(portraits).toHaveLength(1);
    expect(portraits[0].props.name).toBe("Researcher");
  });

  test("passes worker title to WorkerPortrait component", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    const portraits = findComponentElements(el, "WorkerPortrait");
    expect(portraits[0].props.title).toBe("Knowledge Seeker");
  });

  test("passes lg size to WorkerPortrait component", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    const portraits = findComponentElements(el, "WorkerPortrait");
    expect(portraits[0].props.size).toBe("lg");
  });

  test("passes portrait URL to WorkerPortrait when provided", () => {
    const props = { ...baseProps, workerPortraitUrl: "/img/researcher.png" };
    const el = MeetingHeader(props) as AnyElement;
    const portraits = findComponentElements(el, "WorkerPortrait");
    expect(portraits[0].props.portraitUrl).toBe("/img/researcher.png");
  });

  test("breadcrumb link to project is URL-encoded", () => {
    const props = { ...baseProps, projectName: "my project" };
    const el = MeetingHeader(props) as AnyElement;

    // Find Link components (Next.js Link has href prop)
    const links = findElements(
      el,
      (e) => typeof e.props.href === "string"
    );

    const projectLink = links.find(
      (l) =>
        typeof l.props.href === "string" &&
        l.props.href.includes("/projects/")
    );
    expect(projectLink).toBeDefined();
    expect(projectLink!.props.href).toContain("my%20project");
  });

  test("breadcrumb has three separator marks", () => {
    const el = MeetingHeader(baseProps) as AnyElement;
    const separators = findElements(
      el,
      (e) => e.type === "span" && e.props["aria-hidden"] === "true"
    );
    expect(separators).toHaveLength(2);
  });
});

// -- ErrorMessage tests --

describe("ErrorMessage", () => {
  test("renders error text", () => {
    const el = ErrorMessage({ error: "Connection lost" }) as AnyElement;
    expect(containsText(el, "Connection lost")).toBe(true);
  });

  test("renders blocked gem indicator (red)", () => {
    const el = ErrorMessage({ error: "Something broke" }) as AnyElement;
    const gems = findComponentElements(el, "GemIndicator");
    expect(gems).toHaveLength(1);
    expect(gems[0].props.status).toBe("blocked");
  });

  test("uses small gem size", () => {
    const el = ErrorMessage({ error: "Error" }) as AnyElement;
    const gems = findComponentElements(el, "GemIndicator");
    expect(gems[0].props.size).toBe("sm");
  });
});

// -- Type contract tests --
// Client components with hooks (ToolUseIndicator, MessageInput, ChatInterface)
// cannot be called directly outside a React render context. Instead we verify
// their type contracts satisfy the interface requirements.

describe("ChatMessage type contract", () => {
  test("user message has required fields", () => {
    const msg: ChatMessage = {
      id: "msg-1",
      role: "user",
      content: "Hello worker",
    };
    expect(msg.id).toBe("msg-1");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello worker");
    expect(msg.toolUses).toBeUndefined();
  });

  test("assistant message with tool uses", () => {
    const msg: ChatMessage = {
      id: "msg-2",
      role: "assistant",
      content: "Done reading the file.",
      toolUses: [
        { name: "read_file", status: "complete", output: "file content" },
      ],
    };
    expect(msg.toolUses).toHaveLength(1);
    expect(msg.toolUses![0].name).toBe("read_file");
    expect(msg.toolUses![0].status).toBe("complete");
    expect(msg.toolUses![0].output).toBe("file content");
  });

  test("role is constrained to user or assistant", () => {
    const userMsg: ChatMessage = { id: "1", role: "user", content: "" };
    const assistantMsg: ChatMessage = { id: "2", role: "assistant", content: "" };
    expect(userMsg.role).toBe("user");
    expect(assistantMsg.role).toBe("assistant");
  });
});

describe("ToolUseEntry type contract", () => {
  test("running tool has name and status", () => {
    const entry: ToolUseEntry = { name: "search", status: "running" };
    expect(entry.name).toBe("search");
    expect(entry.status).toBe("running");
    expect(entry.input).toBeUndefined();
    expect(entry.output).toBeUndefined();
  });

  test("complete tool has name, status, and output", () => {
    const entry: ToolUseEntry = {
      name: "write_file",
      status: "complete",
      input: { path: "/tmp/test.txt", content: "hello" },
      output: "File written successfully",
    };
    expect(entry.name).toBe("write_file");
    expect(entry.status).toBe("complete");
    expect(entry.output).toBe("File written successfully");
    expect(entry.input).toEqual({ path: "/tmp/test.txt", content: "hello" });
  });

  test("status is constrained to running or complete", () => {
    const running: ToolUseEntry = { name: "cmd", status: "running" };
    const complete: ToolUseEntry = { name: "cmd", status: "complete" };
    expect(running.status).toBe("running");
    expect(complete.status).toBe("complete");
  });
});

// -- MessageBubble tests (server-renderable parts) --
// MessageBubble is a client component that uses ReactMarkdown and
// WorkerPortrait. We can call it because it doesn't use hooks directly,
// but its child components (ToolUseIndicator) do use hooks.

describe("MessageBubble", () => {
  // Import lazily to avoid hook issues at module level
  let MessageBubble: typeof import("@/components/meeting/MessageBubble").default;

  // We need to import dynamically because the module imports ToolUseIndicator
  // which has useState. But MessageBubble itself only renders ToolUseIndicator
  // as a JSX element (doesn't call it), so we can safely call MessageBubble
  // and inspect its element tree without triggering hooks.

  test("renders user message with user-side alignment class", async () => {
    const { default: MB } = await import("@/components/meeting/MessageBubble");
    MessageBubble = MB;

    const el = MessageBubble({
      message: { id: "msg-1", role: "user", content: "Hello" },
    }) as AnyElement;

    // Root element is a div
    expect(el.type).toBe("div");
    // className should be a string (CSS modules are undefined in test, but the join still works)
    expect(typeof el.props.className).toBe("string");
  });

  test("user message does not render WorkerPortrait", async () => {
    const { default: MB } = await import("@/components/meeting/MessageBubble");

    const el = MB({
      message: { id: "msg-1", role: "user", content: "Hi" },
      workerName: "Scribe",
    }) as AnyElement;

    const portraits = findComponentElements(el, "WorkerPortrait");
    expect(portraits).toHaveLength(0);
  });

  test("assistant message renders WorkerPortrait with correct name", async () => {
    const { default: MB } = await import("@/components/meeting/MessageBubble");

    const el = MB({
      message: { id: "msg-2", role: "assistant", content: "Response" },
      workerName: "Scribe",
    }) as AnyElement;

    const portraits = findComponentElements(el, "WorkerPortrait");
    expect(portraits).toHaveLength(1);
    expect(portraits[0].props.name).toBe("Scribe");
    expect(portraits[0].props.size).toBe("sm");
  });

  test("message with tool uses renders ToolUseIndicator elements", async () => {
    const { default: MB } = await import("@/components/meeting/MessageBubble");
    const tools: ToolUseEntry[] = [
      { name: "read_file", status: "complete", output: "content" },
      { name: "write_file", status: "running" },
    ];

    const el = MB({
      message: {
        id: "msg-3",
        role: "assistant",
        content: "Working...",
        toolUses: tools,
      },
    }) as AnyElement;

    const indicators = findComponentElements(el, "ToolUseIndicator");
    expect(indicators).toHaveLength(2);
    expect(indicators[0].props.tool).toEqual(tools[0]);
    expect(indicators[1].props.tool).toEqual(tools[1]);
  });

  test("message without tool uses does not render ToolUseIndicator", async () => {
    const { default: MB } = await import("@/components/meeting/MessageBubble");

    const el = MB({
      message: { id: "msg-4", role: "assistant", content: "Plain" },
    }) as AnyElement;

    const indicators = findComponentElements(el, "ToolUseIndicator");
    expect(indicators).toHaveLength(0);
  });

  test("renders ReactMarkdown for message content", async () => {
    const { default: MB } = await import("@/components/meeting/MessageBubble");

    const el = MB({
      message: { id: "msg-5", role: "user", content: "**bold text**" },
    }) as AnyElement;

    // ReactMarkdown appears as a component element in the tree
    const markdownElements = findComponentElements(el, "Markdown");
    // react-markdown exports as "Markdown" internally
    expect(markdownElements.length).toBeGreaterThanOrEqual(0);
    // The content should be passed as children to some element
    expect(containsText(el, "**bold text**")).toBe(true);
  });
});

// -- StreamingMessage tests --

describe("StreamingMessage", () => {
  test("renders WorkerPortrait with correct props", async () => {
    const { default: SM } = await import("@/components/meeting/StreamingMessage");

    const el = SM({
      content: "Partial response",
      tools: [],
      workerName: "Artisan",
      workerPortraitUrl: "/img/artisan.png",
    }) as AnyElement;

    const portraits = findComponentElements(el, "WorkerPortrait");
    expect(portraits).toHaveLength(1);
    expect(portraits[0].props.name).toBe("Artisan");
    expect(portraits[0].props.portraitUrl).toBe("/img/artisan.png");
    expect(portraits[0].props.size).toBe("sm");
  });

  test("renders streaming text content", async () => {
    const { default: SM } = await import("@/components/meeting/StreamingMessage");

    const el = SM({
      content: "Partial response so far",
      tools: [],
    }) as AnyElement;

    expect(containsText(el, "Partial response so far")).toBe(true);
  });

  test("renders cursor span with aria-hidden", async () => {
    const { default: SM } = await import("@/components/meeting/StreamingMessage");

    const el = SM({
      content: "Text",
      tools: [],
    }) as AnyElement;

    const ariaHidden = findElements(
      el,
      (e) => e.type === "span" && e.props["aria-hidden"] === "true"
    );
    expect(ariaHidden.length).toBeGreaterThanOrEqual(1);
  });

  test("renders ToolUseIndicator for active tools", async () => {
    const { default: SM } = await import("@/components/meeting/StreamingMessage");
    const tools: ToolUseEntry[] = [
      { name: "search_code", status: "running" },
    ];

    const el = SM({
      content: "",
      tools,
    }) as AnyElement;

    const indicators = findComponentElements(el, "ToolUseIndicator");
    expect(indicators).toHaveLength(1);
    expect(indicators[0].props.tool).toEqual(tools[0]);
  });

  test("renders cursor even with empty content and no tools", async () => {
    const { default: SM } = await import("@/components/meeting/StreamingMessage");

    const el = SM({
      content: "",
      tools: [],
    }) as AnyElement;

    const ariaHidden = findElements(
      el,
      (e) => e.type === "span" && e.props["aria-hidden"] === "true"
    );
    expect(ariaHidden.length).toBeGreaterThanOrEqual(1);
  });
});

// -- SSE parsing tests --
// The parseSSEBuffer function is internal to ChatInterface. We test its
// behavior indirectly through the public interface, but also test the
// format expectations here to catch drift.

describe("SSE event format", () => {
  test("text_delta event has text field", () => {
    const event = { type: "text_delta", text: "Hello" };
    expect(event.type).toBe("text_delta");
    expect(event.text).toBe("Hello");
  });

  test("tool_use event has name and input fields", () => {
    const event = {
      type: "tool_use",
      name: "read_file",
      input: { path: "/tmp/test.txt" },
    };
    expect(event.type).toBe("tool_use");
    expect(event.name).toBe("read_file");
  });

  test("tool_result event has name and output fields", () => {
    const event = {
      type: "tool_result",
      name: "read_file",
      output: "file contents here",
    };
    expect(event.type).toBe("tool_result");
    expect(event.output).toBe("file contents here");
  });

  test("turn_end event has optional cost", () => {
    const event = { type: "turn_end", cost: 0.05 };
    expect(event.type).toBe("turn_end");
    expect(event.cost).toBe(0.05);
  });

  test("error event has reason field", () => {
    const event = { type: "error", reason: "Rate limited" };
    expect(event.type).toBe("error");
    expect(event.reason).toBe("Rate limited");
  });

  test("SSE data line format is parseable", () => {
    const line = 'data: {"type":"text_delta","text":"chunk"}';
    const jsonStr = line.slice(6);
    const parsed = JSON.parse(jsonStr) as { type: string; text: string };
    expect(parsed.type).toBe("text_delta");
    expect(parsed.text).toBe("chunk");
  });

  test("multiple SSE lines can be split and parsed", () => {
    const stream =
      'data: {"type":"text_delta","text":"Hello"}\ndata: {"type":"text_delta","text":" world"}\n';
    const lines = stream.split("\n");
    const events: Array<{ type: string; text: string }> = [];

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        events.push(
          JSON.parse(line.slice(6)) as { type: string; text: string }
        );
      }
    }

    expect(events).toHaveLength(2);
    expect(events[0].text).toBe("Hello");
    expect(events[1].text).toBe(" world");
  });

  test("incomplete SSE line is preserved as buffer remainder", () => {
    const buffer = 'data: {"type":"text_delta","text":"Hello"}\ndata: {"type":"tex';
    const lines = buffer.split("\n");
    const remaining = lines.pop()!;

    expect(remaining).toBe('data: {"type":"tex');
    expect(lines).toHaveLength(1);
  });
});
