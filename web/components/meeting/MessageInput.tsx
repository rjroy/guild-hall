"use client";

import { useRef, useCallback, useEffect } from "react";
import { useDaemonStatus } from "@/web/components/ui/DaemonContext";
import styles from "./MessageInput.module.css";

/**
 * Returns true when an Enter keypress should send the message
 * (preventDefault + onSend), false when it should fall through
 * to the browser default (insert newline).
 */
export function shouldSendOnEnter(state: {
  value: string;
  isStreaming: boolean;
  isOnline: boolean;
  shiftKey: boolean;
  isTouchDevice: boolean;
}): boolean {
  if (state.shiftKey || state.isTouchDevice) return false;
  return !!(state.value.trim() && !state.isStreaming && state.isOnline);
}

/**
 * The textarea is disabled only when the daemon is offline.
 * Streaming does not disable typing.
 */
export function isTextareaDisabled(state: {
  isOnline: boolean;
}): boolean {
  return !state.isOnline;
}

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

  // Reset height when value changes externally (cleared after send)
  // or when streaming ends and the textarea becomes editable again.
  useEffect(() => {
    adjustHeight();
  }, [value, isStreaming, adjustHeight]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    adjustHeight();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "Enter" &&
      shouldSendOnEnter({
        value,
        isStreaming,
        isOnline,
        shiftKey: e.shiftKey,
        isTouchDevice: isTouchDevice.current ?? false,
      })
    ) {
      e.preventDefault();
      onSend(value.trim());
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
        disabled={isTextareaDisabled({ isOnline })}
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
