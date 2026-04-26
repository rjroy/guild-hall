import styles from "./GemIndicator.module.css";

export type GemStatus = "pending" | "active" | "blocked" | "info" | "inactive";

interface GemIndicatorProps {
  status: GemStatus;
  size?: "sm" | "md";
}

const ALT_TEXT: Record<GemStatus, string> = {
  active: "Active",
  pending: "Pending",
  blocked: "Blocked",
  info: "Info",
  inactive: "Inactive",
};

export default function GemIndicator({
  status,
  size = "md",
}: GemIndicatorProps) {
  const className = [styles.gem, styles[size], styles[status]]
    .filter(Boolean)
    .join(" ");

  return <span className={className} role="img" aria-label={ALT_TEXT[status]} />;
}
