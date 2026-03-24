import { describe, test, expect } from "bun:test";
import { SYSTEM_EVENT_TYPES } from "@/lib/types";
import {
  EVENT_TYPE_FIELDS,
  buildMatchSummaryParts,
  buildTriggerPayloadFields,
} from "@/web/components/commission/trigger-form-data";

describe("EVENT_TYPE_FIELDS", () => {
  test("has an entry for every SYSTEM_EVENT_TYPES value", () => {
    for (const eventType of SYSTEM_EVENT_TYPES) {
      expect(EVENT_TYPE_FIELDS).toHaveProperty(eventType);
    }
  });

  test("each entry is a non-empty string array", () => {
    for (const eventType of SYSTEM_EVENT_TYPES) {
      const fields = EVENT_TYPE_FIELDS[eventType];
      expect(Array.isArray(fields)).toBe(true);
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        expect(typeof f).toBe("string");
      }
    }
  });
});

describe("buildMatchSummaryParts", () => {
  test("returns empty array when matchType is empty", () => {
    expect(buildMatchSummaryParts("", "", [])).toEqual([]);
  });

  test("event type only produces 'any {type} event' text", () => {
    const parts = buildMatchSummaryParts("commission_status", "", []);
    const text = parts.map((p) => p.text).join("");
    expect(text).toBe("This trigger will fire on any commission_status event.");
    const codeParts = parts.filter((p) => p.isCode);
    expect(codeParts).toHaveLength(1);
    expect(codeParts[0].text).toBe("commission_status");
  });

  test("with project filter includes project name", () => {
    const parts = buildMatchSummaryParts("commission_status", "guild-hall", []);
    const text = parts.map((p) => p.text).join("");
    expect(text).toBe("This trigger will fire on commission_status events from project guild-hall.");
    const codeParts = parts.filter((p) => p.isCode);
    expect(codeParts).toHaveLength(2);
    expect(codeParts[0].text).toBe("commission_status");
    expect(codeParts[1].text).toBe("guild-hall");
  });

  test("with field patterns includes key and pattern", () => {
    const parts = buildMatchSummaryParts("commission_status", "", [
      { key: "status", value: "completed" },
    ]);
    const text = parts.map((p) => p.text).join("");
    expect(text).toBe("This trigger will fire on commission_status events where status matches completed.");
  });

  test("with project filter and field patterns includes both", () => {
    const parts = buildMatchSummaryParts("commission_status", "guild-hall", [
      { key: "status", value: "completed" },
      { key: "commissionId", value: "commission-Dalton-*" },
    ]);
    const text = parts.map((p) => p.text).join("");
    expect(text).toBe(
      "This trigger will fire on commission_status events from project guild-hall where status matches completed and commissionId matches commission-Dalton-*."
    );
  });

  test("multiple field patterns joined with 'and'", () => {
    const parts = buildMatchSummaryParts("meeting_started", "", [
      { key: "meetingId", value: "mtg-*" },
      { key: "worker", value: "developer" },
    ]);
    const text = parts.map((p) => p.text).join("");
    expect(text).toContain("meetingId matches mtg-* and worker matches developer");
  });

  test("empty field patterns are excluded from summary", () => {
    const parts = buildMatchSummaryParts("commission_status", "", [
      { key: "", value: "completed" },
      { key: "status", value: "" },
      { key: "reason", value: "done" },
    ]);
    const text = parts.map((p) => p.text).join("");
    expect(text).toContain("reason matches done");
    expect(text).not.toContain("status matches");
  });
});

describe("buildTriggerPayloadFields", () => {
  test("minimal: event type only", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "confirm", "");
    expect(result).toEqual({
      type: "triggered",
      match: { type: "commission_status" },
    });
  });

  test("with project filter", () => {
    const result = buildTriggerPayloadFields("commission_status", "guild-hall", [], "confirm", "");
    expect(result.match).toEqual({
      type: "commission_status",
      projectName: "guild-hall",
    });
  });

  test("with field patterns", () => {
    const result = buildTriggerPayloadFields(
      "commission_status", "", [{ key: "status", value: "completed" }], "confirm", ""
    );
    expect((result.match as Record<string, unknown>).fields).toEqual({ status: "completed" });
  });

  test("empty field patterns are filtered out", () => {
    const result = buildTriggerPayloadFields(
      "commission_status", "",
      [{ key: "", value: "completed" }, { key: "status", value: "" }],
      "confirm", ""
    );
    expect(result.match).toEqual({ type: "commission_status" });
  });

  test("all field patterns empty: fields omitted", () => {
    const result = buildTriggerPayloadFields(
      "commission_status", "",
      [{ key: "", value: "" }],
      "confirm", ""
    );
    expect(result.match).not.toHaveProperty("fields");
  });

  test("approval 'confirm' is omitted from payload", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "confirm", "");
    expect(result).not.toHaveProperty("approval");
  });

  test("approval 'auto' is included in payload", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "auto", "");
    expect(result.approval).toBe("auto");
  });

  test("valid max depth is included as number", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "confirm", "5");
    expect(result.maxDepth).toBe(5);
  });

  test("empty max depth is omitted", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "confirm", "");
    expect(result).not.toHaveProperty("maxDepth");
  });

  test("zero max depth is omitted", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "confirm", "0");
    expect(result).not.toHaveProperty("maxDepth");
  });

  test("negative max depth is omitted", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "confirm", "-1");
    expect(result).not.toHaveProperty("maxDepth");
  });

  test("non-numeric max depth is omitted", () => {
    const result = buildTriggerPayloadFields("commission_status", "", [], "confirm", "abc");
    expect(result).not.toHaveProperty("maxDepth");
  });
});
