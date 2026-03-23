import styles from "./Panel.module.css";

interface PanelProps {
  size?: "sm" | "md" | "lg" | "full";
  variant?: "dark" | "parchment";
  title?: string;
  className?: string;
  children: React.ReactNode;
}

export default function Panel({
  size = "md",
  variant = "dark",
  title,
  className,
  children,
}: PanelProps) {
  const classNames = [styles.panel, styles[size], styles[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames}>
      <div className={styles.content}>
        {title && (
          <div className={styles.header}>
            <h2 className={styles.title}>{title}</h2>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
