import styles from "./GemIndicator.module.css";

interface GemIndicatorProps {
  status: "pending" | "active" | "blocked" | "info" | "inactive";
  size?: "sm" | "md";
}

const ALT_TEXT: Record<GemIndicatorProps["status"], string> = {
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

  return (
    // Static decorative asset, fixed size. next/image optimization not beneficial.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/ui/gem.webp"
      alt={ALT_TEXT[status]}
      className={className}
    />
  );
}
