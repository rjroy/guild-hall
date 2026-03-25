import { describe, test, expect } from "bun:test";
import { resolveAttribution } from "@/web/lib/resolve-attribution";
import { MANAGER_WORKER_NAME, MANAGER_PORTRAIT_PATH } from "@/lib/packages";

describe("resolveAttribution", () => {
  // Source 1: extras.worker + extras.workerDisplayTitle
  test("resolves worker name and title from extras.worker and extras.workerDisplayTitle", () => {
    const result = resolveAttribution(
      { worker: "Dalton", workerDisplayTitle: "Guild Artificer" },
      new Map(),
    );
    expect(result).toEqual({
      workerName: "Dalton",
      workerTitle: "Guild Artificer",
    });
  });

  test("resolves worker name without title when workerDisplayTitle is absent", () => {
    const result = resolveAttribution(
      { worker: "Dalton" },
      new Map(),
    );
    expect(result).toEqual({ workerName: "Dalton" });
  });

  // Source 2: extras.author fallback
  test("falls back to extras.author when extras.worker is absent", () => {
    const result = resolveAttribution(
      { author: "Celeste" },
      new Map(),
    );
    expect(result).toEqual({ workerName: "Celeste" });
  });

  // Source 3: no attribution
  test("returns null when neither worker nor author is present", () => {
    const result = resolveAttribution({}, new Map());
    expect(result).toBeNull();
  });

  // Empty string handling
  test("treats empty string worker as absent, falls through to author", () => {
    const result = resolveAttribution(
      { worker: "", author: "Celeste" },
      new Map(),
    );
    expect(result).toEqual({ workerName: "Celeste" });
  });

  test("returns null when both worker and author are empty strings", () => {
    const result = resolveAttribution(
      { worker: "", author: "" },
      new Map(),
    );
    expect(result).toBeNull();
  });

  // Type validation
  test("treats non-string worker as absent", () => {
    const result = resolveAttribution(
      { worker: 42, author: "Celeste" },
      new Map(),
    );
    expect(result).toEqual({ workerName: "Celeste" });
  });

  // Portrait lookup
  test("includes portraitUrl when worker is found in portrait map", () => {
    const map = new Map<string, string | null>([
      ["Dalton", "/images/portraits/dalton.webp"],
    ]);
    const result = resolveAttribution({ worker: "Dalton" }, map);
    expect(result).toEqual({
      workerName: "Dalton",
      workerPortraitUrl: "/images/portraits/dalton.webp",
    });
  });

  test("omits portraitUrl when worker is not found in portrait map", () => {
    const result = resolveAttribution(
      { worker: "guild-hall-writer" },
      new Map(),
    );
    expect(result).toEqual({ workerName: "guild-hall-writer" });
    expect(result).not.toHaveProperty("workerPortraitUrl");
  });

  // Guild Master hardcoded fallback
  test("uses hardcoded portrait for Guild Master when not in roster", () => {
    const result = resolveAttribution(
      { worker: MANAGER_WORKER_NAME },
      new Map(),
    );
    expect(result).toEqual({
      workerName: MANAGER_WORKER_NAME,
      workerPortraitUrl: MANAGER_PORTRAIT_PATH,
    });
  });

  test("uses roster portrait for Guild Master when present in map", () => {
    const customPath = "/images/custom-gm.webp";
    const map = new Map<string, string | null>([
      [MANAGER_WORKER_NAME, customPath],
    ]);
    const result = resolveAttribution(
      { worker: MANAGER_WORKER_NAME },
      map,
    );
    expect(result).toEqual({
      workerName: MANAGER_WORKER_NAME,
      workerPortraitUrl: customPath,
    });
  });

  test("Guild Master in roster with null portrait omits portraitUrl", () => {
    const map = new Map<string, string | null>([
      [MANAGER_WORKER_NAME, null],
    ]);
    const result = resolveAttribution(
      { worker: MANAGER_WORKER_NAME },
      map,
    );
    // Roster's null takes precedence over hardcoded fallback
    expect(result).toEqual({ workerName: MANAGER_WORKER_NAME });
    expect(result).not.toHaveProperty("workerPortraitUrl");
  });

  test("omits workerTitle when workerDisplayTitle is non-string", () => {
    const result = resolveAttribution(
      { worker: "Dalton", workerDisplayTitle: 42 },
      new Map(),
    );
    expect(result).toEqual({ workerName: "Dalton" });
    expect(result).not.toHaveProperty("workerTitle");
  });

  // Undefined extras
  test("returns null when extras is undefined", () => {
    const result = resolveAttribution(undefined, new Map());
    expect(result).toBeNull();
  });

  // Fetch failure path (empty map)
  test("resolves name and title without portrait when portrait map is empty", () => {
    const result = resolveAttribution(
      { worker: "Dalton", workerDisplayTitle: "Guild Artificer" },
      new Map(),
    );
    expect(result).toEqual({
      workerName: "Dalton",
      workerTitle: "Guild Artificer",
    });
    expect(result).not.toHaveProperty("workerPortraitUrl");
  });
});
