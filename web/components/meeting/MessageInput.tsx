"use client";

import { useRef, useCallback } from "react";
import { useDaemonStatus } from "@/web/components/ui/DaemonContext";
import styles from "./MessageInput.module.css";

interface MessageInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  value: string;
  onChange: (value: string) => void;
}

export default function MessageInput({
  onSend,
  onStop,
  isStreaming,
  value,
  onChange,
}: MessageInputProps) {
  const { isOnline } = useDaemonStatus();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Touch capability doesn't change during a session; compute once and cache.
  const isTouchDevice = useRef<boolean | null>(null);
  if (isTouchDevice.current === null) {
    isTouchDevice.current =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset to auto to measure scrollHeight accurately
    textarea.style.height = "auto";
    // Cap at roughly 8 lines (200px)
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    adjustHeight();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On mobile/touch devices, enter inserts a newline (no shift+enter available).
    // On desktop, enter sends and shift+enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey && !isTouchDevice.current) {
      e.preventDefault();
      if (value.trim() && !isStreaming && isOnline) {
        onSend(value.trim());
      }
    }
  };

  const handleSend = () => {
    if (value.trim() && !isStreaming && isOnline) {
      onSend(value.trim());
    }
  };

  const offlineTitle = !isOnline ? "Daemon offline" : undefined;

  return (
    <div className={styles.inputBar}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder={isOnline ? "Speak to the guild worker..." : "Daemon offline"}
        disabled={isStreaming || !isOnline}
        rows={1}
      />
      {isStreaming ? (
        <button
          className={styles.stopButton}
          onClick={onStop}
          type="button"
          aria-label="Stop generation"
        >
          Stop
        </button>
      ) : (
        <button
          className={styles.sendButton}
          onClick={handleSend}
          type="button"
          disabled={!value.trim() || !isOnline}
          title={offlineTitle}
          aria-label="Send message"
        >
          Send
        </button>
      )}
    </div>
  );
}
