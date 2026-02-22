import { describe, test, expect } from "bun:test";
import { createEventBus, type SystemEvent } from "@/daemon/services/event-bus";

describe("createEventBus", () => {
  test("subscriber receives emitted events", () => {
    const bus = createEventBus();
    const received: SystemEvent[] = [];

    bus.subscribe((event) => received.push(event));
    bus.emit({ type: "meeting_started", meetingId: "m-1", worker: "Scribe" });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      type: "meeting_started",
      meetingId: "m-1",
      worker: "Scribe",
    });
  });

  test("multiple subscribers all receive the same event", () => {
    const bus = createEventBus();
    const received1: SystemEvent[] = [];
    const received2: SystemEvent[] = [];

    bus.subscribe((event) => received1.push(event));
    bus.subscribe((event) => received2.push(event));

    const event: SystemEvent = {
      type: "commission_status",
      commissionId: "c-1",
      status: "in_progress",
    };
    bus.emit(event);

    expect(received1).toHaveLength(1);
    expect(received1[0]).toEqual(event);
    expect(received2).toHaveLength(1);
    expect(received2[0]).toEqual(event);
  });

  test("unsubscribe stops delivery to that subscriber", () => {
    const bus = createEventBus();
    const received: SystemEvent[] = [];

    const unsubscribe = bus.subscribe((event) => received.push(event));
    bus.emit({ type: "meeting_ended", meetingId: "m-1" });
    expect(received).toHaveLength(1);

    unsubscribe();
    bus.emit({ type: "meeting_ended", meetingId: "m-2" });
    expect(received).toHaveLength(1);
  });

  test("unsubscribe only affects the specific subscriber", () => {
    const bus = createEventBus();
    const received1: SystemEvent[] = [];
    const received2: SystemEvent[] = [];

    const unsub1 = bus.subscribe((event) => received1.push(event));
    bus.subscribe((event) => received2.push(event));

    unsub1();
    bus.emit({ type: "meeting_ended", meetingId: "m-1" });

    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(1);
  });

  test("emitting after all subscribers unsubscribe causes no errors", () => {
    const bus = createEventBus();

    const unsub1 = bus.subscribe(() => {});
    const unsub2 = bus.subscribe(() => {});

    unsub1();
    unsub2();

    // Should not throw
    expect(() => {
      bus.emit({ type: "meeting_ended", meetingId: "m-1" });
    }).not.toThrow();
  });

  test("emitting with no subscribers causes no errors", () => {
    const bus = createEventBus();

    expect(() => {
      bus.emit({
        type: "commission_progress",
        commissionId: "c-1",
        summary: "Working on it",
      });
    }).not.toThrow();
  });

  test("commission events carry all expected fields", () => {
    const bus = createEventBus();
    const received: SystemEvent[] = [];

    bus.subscribe((event) => received.push(event));

    bus.emit({
      type: "commission_result",
      commissionId: "c-42",
      summary: "Completed review",
      artifacts: ["docs/review.md", "docs/findings.md"],
    });

    expect(received).toHaveLength(1);
    const event = received[0];
    expect(event.type).toBe("commission_result");
    if (event.type === "commission_result") {
      expect(event.commissionId).toBe("c-42");
      expect(event.summary).toBe("Completed review");
      expect(event.artifacts).toEqual(["docs/review.md", "docs/findings.md"]);
    }
  });

  test("commission_status event includes optional reason", () => {
    const bus = createEventBus();
    const received: SystemEvent[] = [];

    bus.subscribe((event) => received.push(event));

    bus.emit({
      type: "commission_status",
      commissionId: "c-1",
      status: "failed",
      reason: "SDK session expired",
    });

    expect(received).toHaveLength(1);
    if (received[0].type === "commission_status") {
      expect(received[0].reason).toBe("SDK session expired");
    }
  });

  test("events are delivered synchronously in emit order", () => {
    const bus = createEventBus();
    const received: SystemEvent[] = [];

    bus.subscribe((event) => received.push(event));

    bus.emit({ type: "meeting_started", meetingId: "m-1", worker: "Scribe" });
    bus.emit({
      type: "commission_status",
      commissionId: "c-1",
      status: "dispatched",
    });
    bus.emit({ type: "meeting_ended", meetingId: "m-1" });

    expect(received).toHaveLength(3);
    expect(received[0].type).toBe("meeting_started");
    expect(received[1].type).toBe("commission_status");
    expect(received[2].type).toBe("meeting_ended");
  });
});
