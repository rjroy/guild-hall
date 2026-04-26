/**
 * Tests for daemon/lib/record-utils.ts: domain-agnostic YAML frontmatter
 * manipulation utilities.
 *
 * Verifies:
 * - replaceYamlField replaces fields in both commission and meeting content,
 *   throws when the field is missing.
 * - readYamlField reads plain and quoted values, returns undefined for missing.
 * - appendLogEntry with marker inserts before the named field (commission pattern).
 * - appendLogEntry without marker inserts before closing --- (meeting pattern).
 * - appendLogEntry handles empty log sections (no existing entries).
 * - All functions preserve surrounding content.
 */

import { describe, test, expect } from "bun:test";
import {
  replaceYamlField,
  readYamlField,
  appendLogEntry,
} from "@/apps/daemon/lib/record-utils";

// -- Fixture content --

const COMMISSION_CONTENT = `---
title: "Implement feature X"
status: in_progress
assigned_worker: architect
timeline:
  - timestamp: 2026-01-15T10:00:00.000Z
    event: created
    reason: "Initial creation"
current_progress: "Working on implementation"
linked_artifacts: []
---

# Commission: Implement feature X

Body content here.
`;

const MEETING_CONTENT = `---
title: "Architecture Review"
status: open
meeting_type: review
participants:
  - architect
  - researcher
meeting_log:
  - timestamp: 2026-02-01T14:00:00.000Z
    event: opened
    reason: "Meeting started"
linked_artifacts: []
---

# Meeting: Architecture Review

Discussion notes here.
`;

const MEETING_CONTENT_NO_NOTES_SUMMARY = `---
title: "Quick Sync"
status: open
meeting_type: sync
meeting_log:
  - timestamp: 2026-02-10T09:00:00.000Z
    event: opened
    reason: "Quick sync started"
---

# Quick Sync
`;

const EMPTY_TIMELINE_CONTENT = `---
title: "New Commission"
status: pending
timeline:
current_progress: "Not started"
---

# New Commission
`;

const EMPTY_MEETING_LOG_CONTENT = `---
title: "Fresh Meeting"
status: open
meeting_log:
linked_artifacts: []
---

# Fresh Meeting
`;

// -- replaceYamlField --

describe("replaceYamlField", () => {
  test("replaces a simple field in commission content", () => {
    const result = replaceYamlField(COMMISSION_CONTENT, "status", "completed");
    expect(result).toContain("status: completed");
    expect(result).not.toContain("status: in_progress");
    // Surrounding content preserved
    expect(result).toContain('title: "Implement feature X"');
    expect(result).toContain("Body content here.");
  });

  test("replaces a simple field in meeting content", () => {
    const result = replaceYamlField(MEETING_CONTENT, "status", "closed");
    expect(result).toContain("status: closed");
    expect(result).not.toContain("status: open");
    // Surrounding content preserved
    expect(result).toContain('title: "Architecture Review"');
    expect(result).toContain("Discussion notes here.");
  });

  test("replaces a quoted multi-word value", () => {
    const result = replaceYamlField(
      COMMISSION_CONTENT,
      "current_progress",
      '"Almost done"',
    );
    expect(result).toContain('current_progress: "Almost done"');
    expect(result).not.toContain("Working on implementation");
  });

  test("replaces a multi-line field (participants list)", () => {
    // participants spans multiple continuation lines (indented)
    const result = replaceYamlField(MEETING_CONTENT, "participants", "[]");
    expect(result).toContain("participants: []");
    // The individual participant lines should be gone
    expect(result).not.toContain("  - architect");
    expect(result).not.toContain("  - researcher");
  });

  test("succeeds when replacing a field with its current value", () => {
    const result = replaceYamlField(COMMISSION_CONTENT, "status", "in_progress");
    expect(result).toBe(COMMISSION_CONTENT);
  });

  test("throws when field is not found", () => {
    expect(() => {
      replaceYamlField(COMMISSION_CONTENT, "nonexistent_field", "value");
    }).toThrow('replaceYamlField: no "nonexistent_field" field found in content');
  });

  test("preserves content outside the replaced field exactly", () => {
    const result = replaceYamlField(COMMISSION_CONTENT, "status", "completed");
    // Split on the status line and compare everything else
    const originalLines = COMMISSION_CONTENT.split("\n");
    const resultLines = result.split("\n");

    // Same number of lines
    expect(resultLines.length).toBe(originalLines.length);

    // Every line except the status line is identical
    for (let i = 0; i < originalLines.length; i++) {
      if (originalLines[i].startsWith("status:")) {
        expect(resultLines[i]).toBe("status: completed");
      } else {
        expect(resultLines[i]).toBe(originalLines[i]);
      }
    }
  });
});

// -- readYamlField --

describe("readYamlField", () => {
  test("reads a simple string field", () => {
    const result = readYamlField(COMMISSION_CONTENT, "status");
    expect(result).toBe("in_progress");
  });

  test("reads a quoted string field and strips quotes", () => {
    const result = readYamlField(COMMISSION_CONTENT, "current_progress");
    expect(result).toBe("Working on implementation");
  });

  test("reads a double-quoted title field", () => {
    const result = readYamlField(COMMISSION_CONTENT, "title");
    expect(result).toBe("Implement feature X");
  });

  test("returns undefined for a missing field", () => {
    const result = readYamlField(COMMISSION_CONTENT, "nonexistent_field");
    expect(result).toBeUndefined();
  });

  test("reads a field with empty quoted value", () => {
    const content = `---\nempty_field: ""\nother: value\n---\n`;
    const result = readYamlField(content, "empty_field");
    expect(result).toBe("");
  });

  test("reads from meeting content", () => {
    const result = readYamlField(MEETING_CONTENT, "meeting_type");
    expect(result).toBe("review");
  });
});

// -- appendLogEntry --

describe("appendLogEntry", () => {
  const newEntry =
    '  - timestamp: 2026-03-01T12:00:00.000Z\n    event: progress\n    reason: "Made progress"';

  describe("with marker (commission pattern)", () => {
    test("inserts entry before the marker field", () => {
      const result = appendLogEntry(
        COMMISSION_CONTENT,
        newEntry,
        "current_progress",
      );
      const progressIndex = result.indexOf("current_progress:");
      const entryIndex = result.indexOf("event: progress");
      // Entry appears before current_progress
      expect(entryIndex).toBeLessThan(progressIndex);
      expect(entryIndex).toBeGreaterThan(0);
      // Original content preserved
      expect(result).toContain('title: "Implement feature X"');
      expect(result).toContain("Body content here.");
      expect(result).toContain("event: created");
    });

    test("entry is separated from marker by a newline", () => {
      const result = appendLogEntry(
        COMMISSION_CONTENT,
        newEntry,
        "current_progress",
      );
      // The entry should end with the reason line, then newline, then current_progress
      const lines = result.split("\n");
      const reasonLineIdx = lines.findIndex((l) =>
        l.includes('reason: "Made progress"'),
      );
      expect(reasonLineIdx).toBeGreaterThan(-1);
      expect(lines[reasonLineIdx + 1]).toBe('current_progress: "Working on implementation"');
    });

    test("falls back to closing --- when marker not found", () => {
      // Use meeting content without marker field, try with a bogus marker
      const result = appendLogEntry(
        MEETING_CONTENT_NO_NOTES_SUMMARY,
        newEntry,
        "nonexistent_marker",
      );
      // Should insert before ---
      const closingIndex = result.lastIndexOf("\n---");
      const entryIndex = result.indexOf("event: progress");
      expect(entryIndex).toBeLessThan(closingIndex);
      expect(entryIndex).toBeGreaterThan(0);
    });
  });

  describe("without marker (meeting pattern)", () => {
    test("inserts entry before closing ---", () => {
      const result = appendLogEntry(MEETING_CONTENT_NO_NOTES_SUMMARY, newEntry);
      const closingIndex = result.lastIndexOf("\n---");
      const entryIndex = result.indexOf("event: progress");
      expect(entryIndex).toBeLessThan(closingIndex);
      expect(entryIndex).toBeGreaterThan(0);
      // Original content preserved
      expect(result).toContain('title: "Quick Sync"');
      expect(result).toContain("# Quick Sync");
    });

    test("preserves all existing content", () => {
      const result = appendLogEntry(MEETING_CONTENT_NO_NOTES_SUMMARY, newEntry);
      // Existing log entry still present
      expect(result).toContain("event: opened");
      expect(result).toContain('reason: "Quick sync started"');
      // Body content still present
      expect(result).toContain("# Quick Sync");
    });

    test("inserts into meeting content using linked_artifacts marker", () => {
      const result = appendLogEntry(
        MEETING_CONTENT,
        newEntry,
        "linked_artifacts",
      );
      const markerIndex = result.indexOf("linked_artifacts:");
      const entryIndex = result.indexOf("event: progress");
      expect(entryIndex).toBeLessThan(markerIndex);
      // Existing log entry still present
      expect(result).toContain("event: opened");
    });
  });

  describe("empty log section", () => {
    test("inserts into commission with empty timeline using marker", () => {
      const result = appendLogEntry(
        EMPTY_TIMELINE_CONTENT,
        newEntry,
        "current_progress",
      );
      expect(result).toContain("event: progress");
      const progressIndex = result.indexOf("current_progress:");
      const entryIndex = result.indexOf("event: progress");
      expect(entryIndex).toBeLessThan(progressIndex);
    });

    test("inserts into meeting with empty meeting_log using marker", () => {
      const result = appendLogEntry(
        EMPTY_MEETING_LOG_CONTENT,
        newEntry,
        "linked_artifacts",
      );
      expect(result).toContain("event: progress");
      const markerIndex = result.indexOf("linked_artifacts:");
      const entryIndex = result.indexOf("event: progress");
      expect(entryIndex).toBeLessThan(markerIndex);
    });

    test("inserts into empty log section without marker", () => {
      // Content with just frontmatter delimiters and an empty log
      const minimal = `---
title: "Minimal"
log:
---

Body.
`;
      const result = appendLogEntry(minimal, newEntry);
      expect(result).toContain("event: progress");
      const closingIndex = result.lastIndexOf("\n---");
      const entryIndex = result.indexOf("event: progress");
      expect(entryIndex).toBeLessThan(closingIndex);
    });
  });

  describe("error cases", () => {
    test("throws when no closing --- and no marker", () => {
      const noDelimiter = `---
title: "Broken"
status: open
`;
      expect(() => {
        appendLogEntry(noDelimiter, newEntry);
      }).toThrow('closing "---" delimiter found in content');
    });

    test("throws when marker not found and no closing ---", () => {
      const noDelimiter = `---
title: "Broken"
status: open
`;
      expect(() => {
        appendLogEntry(noDelimiter, newEntry, "missing_field");
      }).toThrow('closing "---" delimiter found in content');
    });
  });
});
