/**
 * HeartbeatService: owns the heartbeat loop (Phase 2) and event
 * condensation subscriber (Phase 3).
 *
 * Phase 2 will add the tick loop, GM session, and start/stop lifecycle.
 * This file currently provides the condensation subscriber registration
 * as required by REQ-HBT-50.
 */

import type { EventBus } from "@/daemon/lib/event-bus";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import { registerCondensationSubscriber } from "./condensation";

export interface HeartbeatServiceDeps {
  eventBus: EventBus;
  guildHallHome: string;
  log?: Log;
}

export class HeartbeatService {
  private unsubscribeCondensation: (() => void) | null = null;
  private readonly deps: HeartbeatServiceDeps;
  private readonly log: Log;

  constructor(deps: HeartbeatServiceDeps) {
    this.deps = deps;
    this.log = deps.log ?? nullLog("heartbeat");

    // REQ-HBT-50: service owns condensation subscriber
    this.unsubscribeCondensation = registerCondensationSubscriber({
      eventBus: deps.eventBus,
      guildHallHome: deps.guildHallHome,
      log: this.log,
    });
  }

  /** Stops the condensation subscriber (and future heartbeat loop). */
  stop(): void {
    if (this.unsubscribeCondensation) {
      this.unsubscribeCondensation();
      this.unsubscribeCondensation = null;
    }
  }
}
