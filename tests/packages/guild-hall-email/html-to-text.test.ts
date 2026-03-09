import { describe, test, expect } from "bun:test";
import { htmlToText } from "@/packages/guild-hall-email/html-to-text";

describe("htmlToText", () => {
  test("<p> tags produce paragraph breaks", () => {
    const html = "<p>First paragraph.</p><p>Second paragraph.</p>";
    const result = htmlToText(html);
    expect(result).toContain("First paragraph.");
    expect(result).toContain("Second paragraph.");
    // The two paragraphs should be separated by at least one newline
    const lines = result.split("\n").filter((l) => l.trim());
    expect(lines).toEqual(["First paragraph.", "Second paragraph."]);
  });

  test("<br> produces line breaks (all variants)", () => {
    const variants = [
      "Line one<br>Line two",
      "Line one<br/>Line two",
      "Line one<br />Line two",
    ];

    for (const html of variants) {
      const result = htmlToText(html);
      expect(result).toContain("Line one");
      expect(result).toContain("Line two");
      // Should be on separate lines
      const lines = result.split("\n").filter((l) => l.trim());
      expect(lines).toEqual(["Line one", "Line two"]);
    }
  });

  test('<a href="url">text</a> produces "text (url)"', () => {
    const html = 'Click <a href="https://example.com">here</a> to continue.';
    const result = htmlToText(html);
    expect(result).toBe("Click here (https://example.com) to continue.");
  });

  test("links with nested tags preserve text only", () => {
    const html =
      '<a href="https://example.com"><strong>Bold link</strong></a>';
    const result = htmlToText(html);
    expect(result).toBe("Bold link (https://example.com)");
  });

  test("nested tags produce clean text", () => {
    const html = "<div><p><strong>Important</strong> message</p></div>";
    const result = htmlToText(html);
    expect(result).toBe("Important message");
  });

  test("deeply nested inline elements are stripped", () => {
    const html =
      "<p>This is <em>very <strong>deeply <u>nested</u></strong></em> text.</p>";
    const result = htmlToText(html);
    expect(result).toBe("This is very deeply nested text.");
  });

  describe("HTML entities decode correctly", () => {
    test("named entities", () => {
      expect(htmlToText("&amp;")).toBe("&");
      expect(htmlToText("&lt;")).toBe("<");
      expect(htmlToText("&gt;")).toBe(">");
      expect(htmlToText("&quot;")).toBe('"');
      expect(htmlToText("&#39;")).toBe("'");
      // &nbsp; alone is whitespace-only, which returns empty.
      // Test it in context to confirm decoding works.
      expect(htmlToText("word&nbsp;here")).toBe("word here");
    });

    test("decimal numeric entities", () => {
      // &#8212; is an em dash
      expect(htmlToText("before&#8212;after")).toBe(
        `before${String.fromCodePoint(8212)}after`,
      );
    });

    test("hex numeric entities", () => {
      // &#x2014; is also an em dash
      expect(htmlToText("before&#x2014;after")).toBe(
        `before${String.fromCodePoint(0x2014)}after`,
      );
    });

    test("mixed entities in context", () => {
      const html = "Tom &amp; Jerry said &quot;hello&quot; &gt; goodbye";
      expect(htmlToText(html)).toBe('Tom & Jerry said "hello" > goodbye');
    });
  });

  test("empty string returns empty string", () => {
    expect(htmlToText("")).toBe("");
  });

  test("whitespace-only HTML returns empty string", () => {
    expect(htmlToText("   ")).toBe("");
    expect(htmlToText("  \n\t  ")).toBe("");
  });

  test("plain text (no HTML) passes through unchanged", () => {
    const plain = "This is just plain text with no markup.";
    expect(htmlToText(plain)).toBe(plain);
  });

  test("consecutive whitespace and newlines collapse to reasonable spacing", () => {
    const html =
      "<p>First</p>\n\n\n\n<p>Second</p>\n\n\n\n\n<p>Third</p>";
    const result = htmlToText(html);
    // Should not have more than two consecutive newlines
    expect(result).not.toMatch(/\n{3,}/);
    // All three words should be present
    expect(result).toContain("First");
    expect(result).toContain("Second");
    expect(result).toContain("Third");
  });

  test("inline whitespace collapses to single space", () => {
    const html = "<p>Too    many     spaces</p>";
    const result = htmlToText(html);
    expect(result).toBe("Too many spaces");
  });

  test("<style> blocks are removed entirely", () => {
    const html =
      "<style>.red { color: red; }</style><p>Visible text</p>";
    const result = htmlToText(html);
    expect(result).toBe("Visible text");
    expect(result).not.toContain("red");
    expect(result).not.toContain("color");
  });

  test("<script> blocks are removed entirely", () => {
    const html =
      '<script>alert("xss")</script><p>Safe text</p>';
    const result = htmlToText(html);
    expect(result).toBe("Safe text");
    expect(result).not.toContain("alert");
    expect(result).not.toContain("xss");
  });

  test("<style> with attributes removed", () => {
    const html =
      '<style type="text/css">body { margin: 0; }</style><p>Content</p>';
    const result = htmlToText(html);
    expect(result).toBe("Content");
  });

  test("<li> items produce line breaks", () => {
    const html = "<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>";
    const result = htmlToText(html);
    const lines = result.split("\n").filter((l) => l.trim());
    expect(lines).toEqual(["Item one", "Item two", "Item three"]);
  });

  test("headings produce line breaks", () => {
    const html = "<h1>Title</h1><p>Body text</p><h2>Subtitle</h2><p>More text</p>";
    const result = htmlToText(html);
    const lines = result.split("\n").filter((l) => l.trim());
    expect(lines).toEqual(["Title", "Body text", "Subtitle", "More text"]);
  });

  test("realistic email HTML converts cleanly", () => {
    const html = `
      <html>
      <head><style>body { font-family: Arial; }</style></head>
      <body>
        <div>
          <h1>Meeting Notes</h1>
          <p>Hi team,</p>
          <p>Here are the <strong>key points</strong> from today&apos;s meeting:</p>
          <ul>
            <li>Budget approved for Q2</li>
            <li>New hire starts <em>next Monday</em></li>
            <li>See details at <a href="https://internal.example.com/notes">this link</a></li>
          </ul>
          <p>Best,<br>Alice</p>
        </div>
      </body>
      </html>
    `;
    const result = htmlToText(html);
    expect(result).toContain("Meeting Notes");
    expect(result).toContain("Hi team,");
    expect(result).toContain("key points");
    expect(result).not.toContain("<strong>");
    expect(result).toContain("Budget approved for Q2");
    expect(result).toContain("New hire starts next Monday");
    expect(result).toContain("this link (https://internal.example.com/notes)");
    expect(result).toContain("Best,");
    expect(result).toContain("Alice");
    // No HTML tags should remain
    expect(result).not.toMatch(/<[^>]+>/);
    // No excessive whitespace
    expect(result).not.toMatch(/\n{3,}/);
  });
});
