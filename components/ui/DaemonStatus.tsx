"use client";

import { useState, useEffect } from "react";
import { DaemonContext } from "./DaemonContext";
import styles from "./DaemonStatus.module.css";

interface DaemonStatusProps {
  children?: React.ReactNode;
}

/**
 * Polls /api/daemon/health every 5 seconds and provides daemon
 * connectivity state to the component tree via DaemonContext.
 *
 * When the daemon is offline, renders a fixed-position indicator.
 * Children always render regardless of daemon state (file-backed
 * reads in server components are unaffected).
 */
export default function DaemonStatus({ children }: DaemonStatusProps) {
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

  return (
    <DaemonContext.Provider value={{ isOnline }}>
      {children}
      {!isOnline && (
        <div className={styles.container}>
          <span className={styles.gem} />
          <span className={styles.text}>Daemon offline</span>
        </div>
      )}
    </DaemonContext.Provider>
  );
}
