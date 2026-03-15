"use client";

import StatusBadge from "@/web/components/ui/StatusBadge";
import { statusToGem } from "@/lib/types";
import type { CommissionMeta } from "@/lib/commissions";
import {
  FILTER_GROUPS,
  countByStatus,
  isDefaultSelection,
} from "./commission-filter";
import styles from "./CommissionFilterPanel.module.css";

interface CommissionFilterPanelProps {
  commissions: CommissionMeta[];
  selected: Set<string>;
  onToggle: (status: string) => void;
  onReset: () => void;
}

export default function CommissionFilterPanel({
  commissions,
  selected,
  onToggle,
  onReset,
}: CommissionFilterPanelProps) {
  const counts = countByStatus(commissions);

  return (
    <div className={styles.filterPanel}>
      {FILTER_GROUPS.map(({ label, statuses }) => (
        <div key={label} className={styles.filterRow}>
          <span className={styles.filterGroupLabel}>{label}</span>
          <div className={styles.filterCheckboxes}>
            {statuses.map((status) => {
              const count = counts[status] ?? 0;
              const gem = statusToGem(status);
              return (
                <label key={status} className={styles.filterCheckbox}>
                  <input
                    type="checkbox"
                    checked={selected.has(status)}
                    onChange={() => onToggle(status)}
                  />
                  <StatusBadge gem={gem} label={status} size="sm" />
                  {count > 0 && (
                    <span className={styles.filterCount}>({count})</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {!isDefaultSelection(selected) && (
        <div className={styles.filterReset}>
          <button
            className={styles.resetButton}
            onClick={onReset}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
