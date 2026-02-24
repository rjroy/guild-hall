"use client";

import { useState } from "react";
import { useDaemonStatus } from "@/components/ui/DaemonContext";
import WorkerPicker from "@/components/ui/WorkerPicker";
import styles from "./StartAudienceButton.module.css";

interface StartAudienceButtonProps {
  projectName: string;
}

export default function StartAudienceButton({
  projectName,
}: StartAudienceButtonProps) {
  const { isOnline } = useDaemonStatus();
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const isDisabled = !isOnline;

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
