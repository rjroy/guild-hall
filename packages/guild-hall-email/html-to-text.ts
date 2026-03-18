/**
 * Converts HTML email body content to readable plain text.
 *
 * Focused on email HTML, which is constrained by email client rendering.
 * Handles block elements, links, entity decoding, and whitespace normalization.
 * No external dependencies.
 */

/**
 * Map of named HTML entities to their decoded characters.
 * Covers the entities commonly found in email HTML.
 */
const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Decodes HTML entities in a string: named entities, decimal numeric
 * entities (&#8212;), and hex numeric entities (&#x2014;).
 */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match) => {
    // Named entity lookup
    const named = NAMED_ENTITIES[match];
    if (named !== undefined) return named;

    // Numeric entity: &#8212; or &#x2014;
    if (match.startsWith("&#")) {
      const code = match.startsWith("&#x")
        ? parseInt(match.slice(3, -1), 16)
        : parseInt(match.slice(2, -1), 10);
      if (!isNaN(code)) return String.fromCodePoint(code);
    }

    // Unknown entity, return as-is
    return match;
  });
}

/**
 * Converts HTML to plain text suitable for reading.
 *
 * - Block elements become newlines
 * - Links become "text (url)"
 * - Inline elements are stripped (content preserved)
 * - HTML entities are decoded
 * - Whitespace is normalized (max two consecutive newlines)
 * - <style> and <script> blocks are removed entirely
 */
export function htmlToText(html: string): string {
  if (!html || !html.trim()) return "";

  let text = html;

  // Remove <style> and <script> blocks (content and tags)
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

  // Convert <a href="url">text</a> to "text (url)" before stripping tags
  text = text.replace(
    /<a\s[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_, url: string, linkText: string) => {
      // Strip any nested tags from the link text
      const clean = linkText.replace(/<[^>]*>/g, "").trim();
      return `${clean} (${url})`;
    },
  );

  // Insert newlines before block elements to ensure separation
  text = text.replace(
    /<\s*(p|div|br\s*\/?|li|h[1-6]|tr|blockquote|hr)[\s>/]/gi,
    "\n$&",
  );

  // Insert newlines after closing block elements
  text = text.replace(
    /<\/\s*(p|div|li|h[1-6]|tr|blockquote|table)\s*>/gi,
    "$&\n",
  );

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // Decode HTML entities
  text = decodeEntities(text);

  // Normalize whitespace:
  // 1. Collapse spaces/tabs within lines (preserve newlines)
  text = text.replace(/[^\S\n]+/g, " ");

  // 2. Trim each line
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  // 3. Collapse runs of 3+ newlines down to 2 (paragraph separation)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 4. Trim leading/trailing whitespace
  text = text.trim();

  return text;
}
