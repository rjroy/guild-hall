import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Validate that a .gitignore uses the whitelist model.
 * The first non-comment, non-blank line must be `*`.
 */
export function validateWhitelistModel(content: string): {
  valid: boolean;
  error?: string;
} {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (trimmed === "*") return { valid: true };
    return {
      valid: false,
      error:
        "The .gitignore does not use the whitelist model. The first rule must be * (deny all).",
    };
  }
  // File has no non-comment, non-blank lines
  return {
    valid: false,
    error:
      "The .gitignore does not use the whitelist model. The first rule must be * (deny all).",
  };
}

/**
 * Check negation patterns for broken parent chains.
 * Returns a list of warning messages for patterns whose parent directories
 * are not also negated.
 *
 * Example: `!/Source/Runtime/MyFeature/**` requires both `!/Source/` and
 * `!/Source/Runtime/` to be present. If either is missing, the pattern
 * matches nothing.
 */
export function validateParentChains(content: string): string[] {
  const lines = content.split("\n");
  const negations = new Set<string>();
  const warnings: string[] = [];

  // Collect all negation patterns
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("!")) {
      negations.add(trimmed);
    }
  }

  // For each negation, check that every parent directory in the chain is also negated
  for (const pattern of negations) {
    // Strip the leading !
    const path = pattern.slice(1);
    // Split into segments, ignoring trailing globs
    const segments = path.split("/").filter((s) => s !== "" && !s.includes("*"));

    // Check each intermediate parent directory
    // e.g., for !/Source/Runtime/MyFeature/**, check !/Source/ and !/Source/Runtime/
    for (let i = 1; i < segments.length; i++) {
      const parentPath = "!/" + segments.slice(0, i).join("/") + "/";
      if (!negations.has(parentPath)) {
        warnings.push(
          `Pattern "${pattern}" may have no effect: parent "${parentPath.slice(1)}" is not negated.`,
        );
        break; // One warning per pattern is enough
      }
    }
  }

  return warnings;
}

const P4_EXCLUSIONS = [".p4config", ".p4ignore", ".p4-adapter.json"];

/**
 * Ensure the .gitignore content excludes P4 metadata files.
 * Returns the (possibly modified) content. Only adds entries that are missing.
 */
export function ensureP4Exclusions(content: string): string {
  const lines = content.split("\n");
  const existing = new Set(lines.map((l) => l.trim()));
  const missing = P4_EXCLUSIONS.filter((exc) => !existing.has(exc));

  if (missing.length === 0) return content;

  // Append missing exclusions before any trailing newline
  const trimmedContent = content.endsWith("\n")
    ? content.slice(0, -1)
    : content;
  const section = "\n# P4 metadata (managed by p4-adapter)\n" + missing.join("\n");
  return trimmedContent + section + "\n";
}

const P4_IGNORE_ENTRIES = [".git/", ".gitignore"];

/**
 * Create or update .p4ignore in the given directory to exclude git artifacts.
 * Does not modify the file if the entries are already present.
 */
export function ensureP4Ignore(dir: string): void {
  const filePath = join(dir, ".p4ignore");
  let content = "";

  if (existsSync(filePath)) {
    content = readFileSync(filePath, "utf-8");
  }

  const lines = content.split("\n");
  const existing = new Set(lines.map((l) => l.trim()));
  const missing = P4_IGNORE_ENTRIES.filter((entry) => !existing.has(entry));

  if (missing.length === 0) return;

  // Also ensure .p4-adapter.json is excluded from P4
  if (!existing.has(".p4-adapter.json")) {
    missing.push(".p4-adapter.json");
  }

  const trimmedContent =
    content.length > 0 && content.endsWith("\n")
      ? content.slice(0, -1)
      : content;
  const prefix = trimmedContent.length > 0 ? trimmedContent + "\n" : "";
  const section =
    "# Git artifacts (managed by p4-adapter)\n" + missing.join("\n") + "\n";
  writeFileSync(filePath, prefix + section, "utf-8");
}
