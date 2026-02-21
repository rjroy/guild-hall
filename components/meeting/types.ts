import type { ToolUseEntry } from "./ToolUseIndicator";

export type { ToolUseEntry };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUses?: ToolUseEntry[];
};
