"use client";

import { useState } from "react";
import { useDaemonStatus } from "@/apps/web/components/ui/DaemonContext";
import WorkerPicker from "@/apps/web/components/ui/WorkerPicker";
import styles from "./CreateMeetingButton.module.css";

interface CreateMeetingButtonProps {
  projectName: string;
  /** When true, the picker opens on mount (e.g. from a query param link). */
  defaultOpen?: boolean;
  /** Pre-populates the prompt with artifact context. */
  initialArtifact?: string;
}

export default function CreateMeetingButton({
  projectName,
  defaultOpen = false,
  initialArtifact,
}: CreateMeetingButtonProps) {
  const { isOnline } = useDaemonStatus();
  const [isPickerOpen, setIsPickerOpen] = useState(defaultOpen);

  const isDisabled = !isOnline;
  const initialPrompt = initialArtifact
    ? `Discussing artifact: .lore/${initialArtifact}\n\n`
    : undefined;

  return (
    <>
      <button
        type="button"
        className={styles.createButton}
        disabled={isDisabled}
        title={isDisabled ? "Daemon offline" : undefined}
        onClick={() => setIsPickerOpen(true)}
      >
        Request Audience
      </button>

      <WorkerPicker
        projectName={projectName}
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        initialPrompt={initialPrompt}
      />
    </>
  );
}
