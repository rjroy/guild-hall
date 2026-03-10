import GemIndicator from "./GemIndicator";
import { formatStatus } from "@/lib/types";
import type { GemStatus } from "@/lib/types";
import styles from "./StatusBadge.module.css";

interface StatusBadgeProps {
  gem: GemStatus;
  label: string;
  size?: "sm" | "md";
}

export default function StatusBadge({ gem, label, size = "sm" }: StatusBadgeProps) {
  return (
    <span className={styles.badge}>
      <GemIndicator status={gem} size={size} />
      <span className={`${styles.label} ${styles[`label${capitalize(gem)}`]}`}>
        {formatStatus(label)}
      </span>
    </span>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
