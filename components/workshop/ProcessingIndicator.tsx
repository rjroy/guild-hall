"use client";

import styles from "./ProcessingIndicator.module.css";

type ProcessingIndicatorProps = {
  onStop: () => void;
};

export function ProcessingIndicator({ onStop }: ProcessingIndicatorProps) {
  return (
    <div className={styles.container}>
      <span className={styles.text}>
        Agent is working
        <span className={styles.dots}>...</span>
      </span>
      <button className={styles.stopButton} onClick={onStop} type="button">
        Stop
      </button>
    </div>
  );
}
