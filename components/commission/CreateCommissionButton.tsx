"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import CommissionForm from "./CommissionForm";
import styles from "./CreateCommissionButton.module.css";

interface CreateCommissionButtonProps {
  projectName: string;
  /** When true, the form is expanded on mount (e.g. from a query param link). */
  defaultOpen?: boolean;
  /** Pre-populated value for the dependencies field. */
  initialDependencies?: string;
}

/**
 * Client component that toggles the CommissionForm inline.
 * On successful creation, refreshes the page to show the new commission.
 */
export default function CreateCommissionButton({
  projectName,
  defaultOpen = false,
  initialDependencies,
}: CreateCommissionButtonProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(defaultOpen);

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
        initialDependencies={initialDependencies}
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
