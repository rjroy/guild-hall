import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
}

export default function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <p className={styles.message}>{message}</p>
    </div>
  );
}
