"use client";

import { useState, useEffect } from "react";
import styles from "./DaemonStatus.module.css";

/**
 * Fixed-position indicator that appears when the daemon is offline.
 * Polls /api/daemon/health every 5 seconds. Hidden when daemon is running.
 */
export default function DaemonStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/daemon/health");
        const data = (await res.json()) as { status: string };
        setIsOnline(data.status !== "offline");
      } catch {
        setIsOnline(false);
      }
    };

    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 5000);
    return () => clearInterval(interval);
  }, []);

  if (isOnline) return null;

  return (
    <div className={styles.container}>
      <span className={styles.gem} />
      <span className={styles.text}>Daemon offline</span>
    </div>
  );
}
