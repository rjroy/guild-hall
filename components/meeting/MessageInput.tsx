"use client";

import { useRef, useCallback } from "react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreaming) {
        onSend(value.trim());
      }
    }
  };

  const handleSend = () => {
    if (value.trim() && !isStreaming) {
      onSend(value.trim());
    }
  };

  return (
    <div className={styles.inputBar}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Speak to the guild worker..."
        disabled={isStreaming}
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
          disabled={!value.trim()}
          aria-label="Send message"
        >
          Send
        </button>
      )}
    </div>
  );
}
