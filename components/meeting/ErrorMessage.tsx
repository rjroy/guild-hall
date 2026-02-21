"use client";

import GemIndicator from "@/components/ui/GemIndicator";
import styles from "./ErrorMessage.module.css";

interface ErrorMessageProps {
  error: string;
}

export default function ErrorMessage({ error }: ErrorMessageProps) {
  return (
    <div className={styles.errorRow}>
      <div className={styles.errorBubble}>
        <GemIndicator status="blocked" size="sm" />
        <span className={styles.errorText}>{error}</span>
      </div>
    </div>
  );
}
