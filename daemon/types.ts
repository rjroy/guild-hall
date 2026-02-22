/**
 * Guild Hall event types for daemon-to-client communication.
 *
 * These are the public events the UI sees. SDK internals do not leak through
 * this boundary. The event translator (daemon/services/event-translator.ts)
 * converts SDK messages into these types.
 */

// -- Branded ID types --
// Prevents accidental mixing of meeting IDs and SDK session IDs at compile time.
// See .lore/retros/ SSE streaming retro for the motivation.

export type MeetingId = string & { readonly __brand: "MeetingId" };
export type SdkSessionId = string & { readonly __brand: "SdkSessionId" };
export type CommissionId = string & { readonly __brand: "CommissionId" };

export function asMeetingId(id: string): MeetingId {
  return id as MeetingId;
}

export function asSdkSessionId(id: string): SdkSessionId {
  return id as SdkSessionId;
}

export function asCommissionId(id: string): CommissionId {
  return id as CommissionId;
}

// -- Meeting status --

export type MeetingStatus = "requested" | "open" | "closed" | "declined";

// -- Commission status --

export type CommissionStatus =
  | "pending"
  | "blocked"
  | "dispatched"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

// -- Event types --

export type GuildHallEvent =
  | { type: "session"; meetingId: string; sessionId: string; worker: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; name: string; output: string }
  | { type: "turn_end"; cost?: number }
  | { type: "error"; reason: string };
