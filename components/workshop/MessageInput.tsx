"use client";

import { useCallback, useRef, useState, type KeyboardEvent } from "react";

import { shouldSubmitOnKey } from "@/lib/workshop-utils";
import styles from "./MessageInput.module.css";

type MessageInputProps = {
  disabled: boolean;
  onSend: (content: string) => void;
};

const MAX_TEXTAREA_HEIGHT = 200;

export function MessageInput({ disabled, onSend }: MessageInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed.length === 0 || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height after clearing
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (shouldSubmitOnKey(e.key, e.shiftKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset height to auto so scrollHeight is recalculated
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  return (
    <div className={styles.container}>
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          handleInput();
        }}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Waiting for agent..." : "Send a message..."}
        disabled={disabled}
        rows={1}
      />
      <button
        className={styles.sendButton}
        onClick={handleSubmit}
        disabled={disabled || value.trim().length === 0}
        type="button"
      >
        Send
      </button>
    </div>
  );
}
