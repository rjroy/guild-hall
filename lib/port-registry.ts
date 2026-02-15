/**
 * Port Registry for HTTP MCP Servers
 *
 * Manages allocation of ports from the ephemeral range 50000-51000 for HTTP MCP servers.
 * Tracks used ports, handles release on clean shutdown, and permanently marks ports that
 * fail to bind (EADDRINUSE) as dead.
 *
 * Thread-safe: all operations are synchronous, no async races.
 */

const PORT_RANGE_START = 50000;
const PORT_RANGE_END = 51000;
export interface IPortRegistry {
  allocate(): number;
  release(port: number): void;
  markDead(port: number): void;
}

export class PortRegistry implements IPortRegistry {
  private usedPorts: Set<number>;
  private deadPorts: Set<number>;

  constructor() {
    this.usedPorts = new Set();
    this.deadPorts = new Set();
  }

  /**
   * Allocates the next available port from the range 50000-51000.
   *
   * @returns The allocated port number
   * @throws Error if all ports in the range are exhausted
   */
  allocate(): number {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (!this.usedPorts.has(port) && !this.deadPorts.has(port)) {
        this.usedPorts.add(port);
        console.log(`[MCP] Allocated port ${port} (${this.usedPorts.size} in use, ${this.deadPorts.size} dead)`);
        return port;
      }
    }

    throw new Error(
      `Port range exhausted: all ports from ${PORT_RANGE_START} to ${PORT_RANGE_END} are in use`
    );
  }

  /**
   * Releases a port back to the available pool.
   * Called on clean server shutdown.
   * Ignores ports outside the managed range.
   * Does NOT touch deadPorts - dead ports stay dead.
   *
   * @param port The port number to release
   */
  release(port: number): void {
    if (port < PORT_RANGE_START || port > PORT_RANGE_END) return;
    this.usedPorts.delete(port);
    console.log(`[MCP] Released port ${port} (${this.usedPorts.size} in use)`);
  }

  /**
   * Permanently marks a port as dead (failed to bind).
   * Dead ports are never reallocated.
   * Ignores ports outside the managed range.
   *
   * @param port The port number to mark as dead
   */
  markDead(port: number): void {
    if (port < PORT_RANGE_START || port > PORT_RANGE_END) return;
    this.usedPorts.delete(port);
    this.deadPorts.add(port);
    console.log(`[MCP] Marked port ${port} as dead (collision/bind failure)`);
  }
}

// No dependencies, so no factory needed - export the class directly
// Consumers can instantiate as needed
