import { describe, expect, it, spyOn, afterEach } from "bun:test";
import { consoleLog, nullLog, collectingLog } from "@/apps/daemon/lib/log";

describe("consoleLog", () => {
  afterEach(() => {
    // spyOn restores automatically in bun:test, but be explicit
  });

  it("forwards error to console.error with tag prefix", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    const log = consoleLog("commission");
    log.error("something failed");
    expect(spy).toHaveBeenCalledWith("[commission] something failed");
    spy.mockRestore();
  });

  it("forwards warn to console.warn with tag prefix", () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const log = consoleLog("commission");
    log.warn("heads up");
    expect(spy).toHaveBeenCalledWith("[commission] heads up");
    spy.mockRestore();
  });

  it("forwards info to console.log with tag prefix", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    const log = consoleLog("session");
    log.info("started");
    expect(spy).toHaveBeenCalledWith("[session] started");
    spy.mockRestore();
  });

  it("joins multiple arguments with spaces", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    const log = consoleLog("meeting");
    log.error("label", "detail", 42);
    expect(spy).toHaveBeenCalledWith("[meeting] label detail 42");
    spy.mockRestore();
  });
});

describe("nullLog", () => {
  it("methods are callable without effect", () => {
    const log = nullLog("anything");
    // Should not throw
    log.error("ignored");
    log.warn("ignored");
    log.info("ignored");
  });
});

describe("collectingLog", () => {
  it("captures error messages", () => {
    const { log, messages } = collectingLog("commission");
    log.error("something broke");
    expect(messages.error).toEqual(["[commission] something broke"]);
    expect(messages.warn).toEqual([]);
    expect(messages.info).toEqual([]);
  });

  it("captures warn messages", () => {
    const { log, messages } = collectingLog("commission");
    log.warn("watch out");
    expect(messages.warn).toEqual(["[commission] watch out"]);
  });

  it("captures info messages", () => {
    const { log, messages } = collectingLog("activity");
    log.info("all good");
    expect(messages.info).toEqual(["[activity] all good"]);
  });

  it("joins multi-argument calls into a single string", () => {
    const { log, messages } = collectingLog("commission");
    log.error("label", "detail");
    expect(messages.error).toEqual(["[commission] label detail"]);
  });

  it("accumulates multiple calls", () => {
    const { log, messages } = collectingLog("test");
    log.info("first");
    log.info("second");
    expect(messages.info).toEqual(["[test] first", "[test] second"]);
  });

  it("formats messages the same way consoleLog would", () => {
    const spy = spyOn(console, "error").mockImplementation(() => {});
    const consoleInstance = consoleLog("tag");
    const { log: collecting, messages } = collectingLog("tag");

    consoleInstance.error("a", "b", 3);
    collecting.error("a", "b", 3);

    expect(messages.error[0]).toBe(spy.mock.calls[0][0]);
    spy.mockRestore();
  });
});
