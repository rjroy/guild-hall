"use client";

import { useState } from "react";

import type { GuildMember } from "@/lib/types";
import { ToolInvokeForm } from "./ToolInvokeForm";
import styles from "./ToolList.module.css";

type ToolListProps = {
  tools: GuildMember["tools"];
  guildMember: string;
};

export function ToolList({ tools, guildMember }: ToolListProps) {
  const [activeToolName, setActiveToolName] = useState<string | null>(null);

  if (tools.length === 0) {
    return (
      <div className={styles.list}>
        <p className={styles.emptyMessage}>No tools available</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      <p className={styles.listHeader}>Tools</p>
      {tools.map((tool) => (
        <div key={tool.name}>
          <div className={styles.toolItem}>
            <div className={styles.toolInfo}>
              <span className={styles.toolName}>{tool.name}</span>
              {tool.description && (
                <span className={styles.toolDescription}>
                  {tool.description}
                </span>
              )}
            </div>
            <button
              className={styles.invokeButton}
              onClick={() =>
                setActiveToolName(
                  activeToolName === tool.name ? null : tool.name,
                )
              }
            >
              {activeToolName === tool.name ? "Close" : "Invoke"}
            </button>
          </div>
          {activeToolName === tool.name && (
            <ToolInvokeForm
              guildMember={guildMember}
              toolName={tool.name}
              inputSchema={tool.inputSchema}
              onCancel={() => setActiveToolName(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
