import { describe, expect, test } from "bun:test";
import { PortRegistry } from "../../lib/port-registry";

describe("PortRegistry", () => {
  test("allocates starting at 50000", () => {
    const registry = new PortRegistry();
    const port = registry.allocate();
    expect(port).toBe(50000);
  });

  test("allocates sequentially", () => {
    const registry = new PortRegistry();
    expect(registry.allocate()).toBe(50000);
    expect(registry.allocate()).toBe(50001);
    expect(registry.allocate()).toBe(50002);
  });

  test("reuses released ports", () => {
    const registry = new PortRegistry();
    const port1 = registry.allocate();
    registry.allocate(); // allocate second port to advance counter

    registry.release(port1);
    const port3 = registry.allocate();

    expect(port3).toBe(port1);
  });

  test("throws error when range exhausted", () => {
    const registry = new PortRegistry();

    // Allocate all 1001 ports (50000-51000 inclusive)
    for (let i = 0; i < 1001; i++) {
      registry.allocate();
    }

    // Next allocation should fail
    expect(() => registry.allocate()).toThrow(
      "Port range exhausted: all ports from 50000 to 51000 are in use"
    );
  });

  test("release non-allocated port is no-op", () => {
    const registry = new PortRegistry();

    // Release a port that was never allocated
    expect(() => registry.release(50500)).not.toThrow();

    // Should still allocate from the beginning
    expect(registry.allocate()).toBe(50000);
  });

  test("markDead prevents port reallocation", () => {
    const registry = new PortRegistry();
    const port = registry.allocate();

    registry.release(port);
    registry.markDead(port);

    // Next allocation should skip the dead port
    const nextPort = registry.allocate();
    expect(nextPort).not.toBe(port);
  });

  test("dead port is skipped on next allocate", () => {
    const registry = new PortRegistry();

    // Mark 50000 as dead before any allocation
    registry.markDead(50000);

    // First allocation should skip 50000 and use 50001
    expect(registry.allocate()).toBe(50001);
  });

  test("release after markDead does not resurrect dead port", () => {
    const registry = new PortRegistry();
    const port = registry.allocate();

    // Production scenario: allocate → bind fails → markDead → cleanup calls release
    registry.markDead(port);
    registry.release(port); // should be no-op, dead port stays dead

    const nextPort = registry.allocate();
    expect(nextPort).not.toBe(port); // dead port is skipped
  });

  test("out-of-range ports are ignored by release", () => {
    const registry = new PortRegistry();

    // Releasing ports outside managed range should not affect allocation
    expect(() => registry.release(49999)).not.toThrow();
    expect(() => registry.release(51001)).not.toThrow();

    // Should still allocate from the beginning
    expect(registry.allocate()).toBe(50000);
  });

  test("out-of-range ports are ignored by markDead", () => {
    const registry = new PortRegistry();

    // Marking ports outside managed range should not affect allocation
    expect(() => registry.markDead(49999)).not.toThrow();
    expect(() => registry.markDead(51001)).not.toThrow();

    // Should still allocate from the beginning
    expect(registry.allocate()).toBe(50000);
  });

  test("reserve() marks port as used so allocate() skips it", () => {
    const registry = new PortRegistry();

    registry.reserve(50000);

    // Allocate should skip 50000 since it's reserved
    expect(registry.allocate()).toBe(50001);
  });

  test("reserve() on out-of-range port is a no-op", () => {
    const registry = new PortRegistry();

    expect(() => registry.reserve(49999)).not.toThrow();
    expect(() => registry.reserve(51001)).not.toThrow();

    // Should still allocate from the beginning
    expect(registry.allocate()).toBe(50000);
  });

  test("reserve() on already-used port is idempotent", () => {
    const registry = new PortRegistry();

    const port = registry.allocate();
    expect(port).toBe(50000);

    // Reserve the same port again (should be a no-op)
    expect(() => registry.reserve(50000)).not.toThrow();

    // Next allocation should still be 50001
    expect(registry.allocate()).toBe(50001);
  });
});
