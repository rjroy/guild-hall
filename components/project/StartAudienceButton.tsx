"use client";

import { useState, useEffect } from "react";
import WorkerPicker from "@/components/ui/WorkerPicker";
import styles from "./StartAudienceButton.module.css";

interface StartAudienceButtonProps {
  projectName: string;
}

export default function StartAudienceButton({
  projectName,
}: StartAudienceButtonProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [daemonOnline, setDaemonOnline] = useState<boolean | null>(null);

  // Check daemon health on mount
  useEffect(() => {
    fetch("/api/daemon/health")
      .then(async (res) => {
        if (!res.ok) {
          setDaemonOnline(false);
          return;
        }
        const data = (await res.json()) as { status?: string };
        setDaemonOnline(data.status !== "offline");
      })
      .catch(() => {
        setDaemonOnline(false);
      });
  }, []);

  const isDisabled = daemonOnline === false;

  return (
    <>
      <button
        className={styles.audienceButton}
        disabled={isDisabled}
        title={isDisabled ? "Daemon offline" : undefined}
        aria-label={
          isDisabled
            ? "Start Audience (daemon offline)"
            : "Start Audience"
        }
        onClick={() => setIsPickerOpen(true)}
      >
        Start Audience
      </button>

      <WorkerPicker
        projectName={projectName}
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
      />
    </>
  );
}
