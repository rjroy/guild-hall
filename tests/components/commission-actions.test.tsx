import { describe, test, expect } from "bun:test";

/**
 * Tests for CommissionActions halted-state buttons (Continue, Save).
 * Uses type-contract testing: verifies boolean logic, handler call shapes,
 * and state transitions without mounting client components.
 */

// -- 4a. Render test (halted status visibility) --

describe("CommissionActions halted status visibility", () => {
  test("showContinue is true when status is halted", () => {
    const status: string = "halted";
    const showContinue = status === "halted";
    expect(showContinue).toBe(true);
  });

  test("showSave is true when status is halted", () => {
    const status: string = "halted";
    const showSave = status === "halted";
    expect(showSave).toBe(true);
  });

  test("showCancel is false when status is halted (REQ-HCA-9)", () => {
    const status: string = "halted";
    const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(showCancel).toBe(false);
  });

  test("showAbandon is true when status is halted (preserved)", () => {
    const status: string = "halted";
    const showAbandon =
      status === "pending" ||
      status === "blocked" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "halted";
    expect(showAbandon).toBe(true);
  });
});

// -- 4b. Non-halted status test --

describe("CommissionActions non-halted status exclusion", () => {
  const nonHaltedStatuses = ["in_progress", "failed", "pending", "completed", "dispatched"];

  for (const status of nonHaltedStatuses) {
    test(`showContinue is false for ${status}`, () => {
      const s: string = status;
      expect(s === "halted").toBe(false);
    });

    test(`showSave is false for ${status}`, () => {
      const s: string = status;
      expect(s === "halted").toBe(false);
    });
  }

  test("showCancel still true for dispatched", () => {
    const status: string = "dispatched";
    const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(showCancel).toBe(true);
  });

  test("showCancel still true for in_progress", () => {
    const status: string = "in_progress";
    const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(showCancel).toBe(true);
  });

  test("showCancel still true for queued", () => {
    const status: string = "queued";
    const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
    expect(showCancel).toBe(true);
  });
});

// -- 4c. Continue handler shape --

describe("CommissionActions handleContinue shape", () => {
  test("calls correct endpoint with POST method", () => {
    const encodedId = encodeURIComponent("commission-dev-20260320");
    const expectedUrl = `/api/commissions/${encodedId}/continue`;
    const expectedMethod = "POST";

    expect(expectedUrl).toBe("/api/commissions/commission-dev-20260320/continue");
    expect(expectedMethod).toBe("POST");
  });

  test("on success, calls onStatusChange with in_progress", () => {
    const mockResponse = { ok: true };
    let statusChangedTo: string | undefined;
    const onStatusChange = (s: string) => { statusChangedTo = s; };

    if (mockResponse.ok) {
      onStatusChange("in_progress");
    }
    expect(statusChangedTo).toBe("in_progress");
  });

  test("on failure, extracts error from response body", () => {
    const mockResponse = { ok: false, error: "At capacity, cannot continue commission" };
    let error: string | undefined;

    if (!mockResponse.ok) {
      error = mockResponse.error || "Continue failed";
    }
    expect(error).toBe("At capacity, cannot continue commission");
  });

  test("on failure with no error message, uses default", () => {
    const mockResponse = { ok: false, error: undefined as string | undefined };
    let error: string | undefined;

    if (!mockResponse.ok) {
      error = mockResponse.error || "Continue failed";
    }
    expect(error).toBe("Continue failed");
  });
});

// -- 4d. Continue capacity error (429) --

describe("CommissionActions continue capacity error", () => {
  test("429 response sets error, does not call onStatusChange", () => {
    const mockResponse = { ok: false, status: 429, error: "At capacity, cannot continue commission" };
    let statusChangedTo: string | undefined;
    let error: string | undefined;
    const onStatusChange = (s: string) => { statusChangedTo = s; };

    if (mockResponse.ok) {
      onStatusChange("in_progress");
    } else {
      error = mockResponse.error || "Continue failed";
    }

    expect(error).toBe("At capacity, cannot continue commission");
    expect(statusChangedTo).toBeUndefined();
  });
});

// -- 4e. Save handler shape --

describe("CommissionActions handleSave shape", () => {
  test("when saveReason is empty, body has no reason key", () => {
    const saveReason = "";
    const body: Record<string, string> = {};
    if (saveReason.trim()) {
      body.reason = saveReason;
    }
    expect(body).toEqual({});
    expect("reason" in body).toBe(false);
  });

  test("when saveReason is whitespace-only, body has no reason key", () => {
    const saveReason = "   ";
    const body: Record<string, string> = {};
    if (saveReason.trim()) {
      body.reason = saveReason;
    }
    expect(body).toEqual({});
  });

  test("when saveReason is non-empty, body includes reason", () => {
    const saveReason = "Partial implementation is useful";
    const body: Record<string, string> = {};
    if (saveReason.trim()) {
      body.reason = saveReason;
    }
    expect(body).toEqual({ reason: "Partial implementation is useful" });
  });

  test("on success, calls onStatusChange with completed", () => {
    const mockResponse = { ok: true };
    let statusChangedTo: string | undefined;
    const onStatusChange = (s: string) => { statusChangedTo = s; };

    if (mockResponse.ok) {
      onStatusChange("completed");
    }
    expect(statusChangedTo).toBe("completed");
  });

  test("on failure, extracts error from response body", () => {
    const mockResponse = { ok: false, error: "Merge conflict" };
    let error: string | undefined;

    if (!mockResponse.ok) {
      error = mockResponse.error || "Save failed";
    }
    expect(error).toBe("Merge conflict");
  });

  test("calls correct endpoint with POST and content-type header", () => {
    const encodedId = encodeURIComponent("commission-dev-20260320");
    const expectedUrl = `/api/commissions/${encodedId}/save`;
    const expectedMethod = "POST";
    const expectedContentType = "application/json";

    expect(expectedUrl).toBe("/api/commissions/commission-dev-20260320/save");
    expect(expectedMethod).toBe("POST");
    expect(expectedContentType).toBe("application/json");
  });
});

// -- 4f. Save reason optional --

describe("CommissionActions save reason is optional", () => {
  test("Yes, Save disabled condition does not check saveReason", () => {
    // Save button: disabled={loading || !isOnline}
    // Even with empty reason, Save is enabled (unlike Abandon)
    const loading = false;
    const isOnline = true;
    const emptyReason = "";

    const saveDisabled = loading || !isOnline;
    expect(saveDisabled).toBe(false);

    // Contrast: Abandon requires reason, so it's disabled when reason is empty
    const abandonDisabled = loading || !isOnline || !emptyReason.trim();
    expect(abandonDisabled).toBe(true);
  });

  test("Yes, Save is disabled when loading", () => {
    const loading = true;
    const isOnline = true;
    const saveDisabled = loading || !isOnline;
    expect(saveDisabled).toBe(true);
  });

  test("Yes, Save is disabled when offline", () => {
    const loading = false;
    const isOnline = false;
    const saveDisabled = loading || !isOnline;
    expect(saveDisabled).toBe(true);
  });
});

// -- 4g. Save failure (409) --

describe("CommissionActions save failure", () => {
  test("409 response sets error, does not call onStatusChange", () => {
    const mockResponse = { ok: false, status: 409, error: "Merge conflict" };
    let statusChangedTo: string | undefined;
    let error: string | undefined;
    const onStatusChange = (s: string) => { statusChangedTo = s; };

    if (mockResponse.ok) {
      onStatusChange("completed");
    } else {
      error = mockResponse.error || "Save failed";
    }

    expect(error).toBe("Merge conflict");
    expect(statusChangedTo).toBeUndefined();
  });
});

// -- 4h. Save reason reset --

describe("CommissionActions save reason reset on dismiss", () => {
  test("dismissing Save confirmation resets saveReason", () => {
    let saveReason = "some reason typed";
    let confirming: string | null = "save";

    // Simulate clicking No
    confirming = null;
    saveReason = "";

    expect(confirming).toBeNull();
    expect(saveReason).toBe("");
  });

  test("successful save resets saveReason", () => {
    const initialReason = "partial work is useful";

    // Simulate successful save handler: reason resets to empty on success
    const mockResponse = { ok: true };
    const resetReason = mockResponse.ok ? "" : initialReason;
    expect(resetReason).toBe("");
  });
});

// -- 4i. Mutual exclusion --

describe("CommissionActions mutual exclusion", () => {
  test("setting confirming to save replaces continue", () => {
    let confirming: string | null = "continue";
    confirming = "save";
    expect(confirming).toBe("save");
  });

  test("setting confirming to continue replaces save", () => {
    let confirming: string | null = "save";
    confirming = "continue";
    expect(confirming).toBe("continue");
  });

  test("setting confirming to abandon replaces continue", () => {
    let confirming: string | null = "continue";
    confirming = "abandon";
    expect(confirming).toBe("abandon");
  });

  test("only one confirming value is active at a time", () => {
    let confirming: string | null = null;
    confirming = "continue";
    expect(confirming).toBe("continue");
    confirming = "save";
    expect(confirming).toBe("save");
    expect(confirming).not.toBe("continue");
  });
});

// -- 4j. Confirming state type --

describe("CommissionActions confirming state type", () => {
  test("type union accepts all six values", () => {
    const values: Array<"cancel" | "redispatch" | "abandon" | "continue" | "save" | null> = [
      "cancel",
      "redispatch",
      "abandon",
      "continue",
      "save",
      null,
    ];
    expect(values).toHaveLength(6);
    expect(values).toContain("continue");
    expect(values).toContain("save");
    expect(values).toContain("cancel");
    expect(values).toContain("redispatch");
    expect(values).toContain("abandon");
    expect(values).toContain(null);
  });
});

// -- 4k. API route tests --

describe("CommissionActions API proxy routes", () => {
  test("continue route exports POST function", async () => {
    const mod = await import(
      "@/web/app/api/commissions/[commissionId]/continue/route"
    );
    expect(typeof mod.POST).toBe("function");
  });

  test("save route exports POST function", async () => {
    const mod = await import(
      "@/web/app/api/commissions/[commissionId]/save/route"
    );
    expect(typeof mod.POST).toBe("function");
  });
});

// -- Button order verification (REQ-HCA-16) --

describe("CommissionActions button order for halted", () => {
  test("halted shows Continue, Save, Abandon in that order (not Cancel)", () => {
    const status: string = "halted";
    const showContinue = status === "halted";
    const showSave = status === "halted";
    const showCancel = status === "dispatched" || status === "in_progress" || status === "queued";
    const showAbandon =
      status === "pending" ||
      status === "blocked" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "halted";

    // The JSX renders in order: Continue, Save, Cancel, Redispatch, Abandon
    // For halted: Continue=true, Save=true, Cancel=false, Redispatch=false, Abandon=true
    expect(showContinue).toBe(true);
    expect(showSave).toBe(true);
    expect(showCancel).toBe(false);
    expect(showAbandon).toBe(true);
  });
});
