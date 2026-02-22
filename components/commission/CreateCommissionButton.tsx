"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import CommissionForm from "./CommissionForm";
import styles from "./CreateCommissionButton.module.css";

interface CreateCommissionButtonProps {
  projectName: string;
}

/**
 * Client component that toggles the CommissionForm inline.
 * On successful creation, refreshes the page to show the new commission.
 */
export default function CreateCommissionButton({
  projectName,
}: CreateCommissionButtonProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  const handleCreated = useCallback(() => {
    setShowForm(false);
    router.refresh();
  }, [router]);

  if (showForm) {
    return (
      <CommissionForm
        projectName={projectName}
        onCreated={handleCreated}
        onCancel={() => setShowForm(false)}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.createButton}
      onClick={() => setShowForm(true)}
    >
      Create Commission
    </button>
  );
}
