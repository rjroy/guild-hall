import { describe, test, expect } from "bun:test";
import {
  parseMemorySections,
  renderMemorySections,
  withMemoryLock,
} from "@/daemon/services/memory-sections";

describe("parseMemorySections", () => {
  test("empty string produces empty array", () => {
    expect(parseMemorySections("")).toEqual([]);
  });

  test("single preamble (no ## headers) produces one entry with empty name", () => {
    const input = "Some content without headers\nAnother line\n";
    const result = parseMemorySections(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("");
    expect(result[0].content).toContain("Some content without headers");
  });

  test("multiple sections with content between them", () => {
    const input = [
      "## User",
      "Senior engineer",
      "",
      "## Feedback",
      "Be concise",
      "",
      "## Project",
      "Working on memory redesign",
      "",
    ].join("\n");

    const result = parseMemorySections(input);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("User");
    expect(result[0].content).toContain("Senior engineer");
    expect(result[1].name).toBe("Feedback");
    expect(result[1].content).toContain("Be concise");
    expect(result[2].name).toBe("Project");
    expect(result[2].content).toContain("Working on memory redesign");
  });

  test("sections with ### subheaders stay as body content", () => {
    const input = [
      "## User",
      "### Background",
      "Senior engineer",
      "### Preferences",
      "Concise responses",
      "",
    ].join("\n");

    const result = parseMemorySections(input);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("User");
    expect(result[0].content).toContain("### Background");
    expect(result[0].content).toContain("### Preferences");
    expect(result[0].content).toContain("Senior engineer");
  });

  test("sections with empty content (header immediately followed by next header)", () => {
    const input = "## Empty\n## HasContent\nSome text\n";
    const result = parseMemorySections(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Empty");
    expect(result[0].content).toBe("");
    expect(result[1].name).toBe("HasContent");
    expect(result[1].content).toContain("Some text");
  });

  test("## appearing mid-line does not split", () => {
    const input = [
      "## Section",
      "This has ## in the middle of a line",
      "And this is fine",
      "",
    ].join("\n");

    const result = parseMemorySections(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("This has ## in the middle of a line");
  });

  test("preamble followed by sections", () => {
    const input = [
      "This is preamble content",
      "",
      "## User",
      "Some user info",
      "",
    ].join("\n");

    const result = parseMemorySections(input);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("");
    expect(result[0].content).toContain("This is preamble content");
    expect(result[1].name).toBe("User");
    expect(result[1].content).toContain("Some user info");
  });
});

describe("renderMemorySections", () => {
  test("empty array produces empty string", () => {
    expect(renderMemorySections([])).toBe("");
  });

  test("preamble section renders without header", () => {
    const result = renderMemorySections([
      { name: "", content: "Preamble content\n" },
    ]);
    expect(result).toBe("Preamble content\n");
    expect(result).not.toContain("## ");
  });

  test("named sections render with ## headers", () => {
    const result = renderMemorySections([
      { name: "User", content: "Info here\n" },
      { name: "Feedback", content: "Be concise\n" },
    ]);
    expect(result).toContain("## User");
    expect(result).toContain("## Feedback");
    expect(result).toContain("Info here");
    expect(result).toContain("Be concise");
  });

  test("trailing whitespace per line is stripped", () => {
    const result = renderMemorySections([
      { name: "Test", content: "line with trailing   \nnormal line\n" },
    ]);
    expect(result).not.toMatch(/  +\n/);
  });

  test("result ends with single trailing newline", () => {
    const result = renderMemorySections([
      { name: "Test", content: "content" },
    ]);
    expect(result).toMatch(/[^\n]\n$/);
    expect(result).not.toMatch(/\n\n$/);
  });
});

describe("round-trip fidelity", () => {
  function normalize(input: string): string {
    return input
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .replace(/\n*$/, "\n");
  }

  test("simple sections", () => {
    const input = "## User\nSenior engineer\n\n## Feedback\nBe concise\n";
    expect(renderMemorySections(parseMemorySections(input))).toBe(
      normalize(input),
    );
  });

  test("preamble with sections", () => {
    const input =
      "Preamble text here\n\n## User\nInfo\n\n## Project\nDetails\n";
    expect(renderMemorySections(parseMemorySections(input))).toBe(
      normalize(input),
    );
  });

  test("nested ### headers", () => {
    const input = [
      "## User",
      "### Background",
      "Engineer",
      "### Goals",
      "Ship features",
      "",
      "## Feedback",
      "No fluff",
      "",
    ].join("\n");
    expect(renderMemorySections(parseMemorySections(input))).toBe(
      normalize(input),
    );
  });

  test("empty sections", () => {
    const input = "## Empty\n## HasContent\nText here\n";
    expect(renderMemorySections(parseMemorySections(input))).toBe(
      normalize(input),
    );
  });

  test("content with ## mid-line", () => {
    const input = "## Section\nThis has ## in the middle\nNormal line\n";
    expect(renderMemorySections(parseMemorySections(input))).toBe(
      normalize(input),
    );
  });

  test("trailing whitespace is normalized", () => {
    const input = "## Test\nLine with spaces   \nClean line\n";
    const result = renderMemorySections(parseMemorySections(input));
    expect(result).toBe("## Test\nLine with spaces\nClean line\n");
  });
});

describe("withMemoryLock", () => {
  test("serializes concurrent operations on same key", async () => {
    const order: number[] = [];

    const op1 = withMemoryLock("test:key", async () => {
      order.push(1);
      await new Promise((r) => setTimeout(r, 20));
      order.push(2);
      return "a";
    });

    const op2 = withMemoryLock("test:key", async () => {
      order.push(3);
      return "b";
    });

    const [r1, r2] = await Promise.all([op1, op2]);
    expect(r1).toBe("a");
    expect(r2).toBe("b");
    // op1 must complete (1,2) before op2 starts (3)
    expect(order).toEqual([1, 2, 3]);
  });

  test("different keys run concurrently", async () => {
    const order: string[] = [];

    const op1 = withMemoryLock("key:a", async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a-end");
    });

    const op2 = withMemoryLock("key:b", async () => {
      order.push("b-start");
      await new Promise((r) => setTimeout(r, 10));
      order.push("b-end");
    });

    await Promise.all([op1, op2]);
    // Both should start before either finishes
    expect(order[0]).toBe("a-start");
    expect(order[1]).toBe("b-start");
  });

  test("releases lock on error", async () => {
    try {
      await withMemoryLock("err:key", async () => {
        throw new Error("boom");
      });
    } catch {
      // expected
    }

    // Should be able to acquire the lock again
    const result = await withMemoryLock("err:key", async () => "recovered");
    expect(result).toBe("recovered");
  });
});
