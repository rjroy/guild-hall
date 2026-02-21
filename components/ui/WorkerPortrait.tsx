import styles from "./WorkerPortrait.module.css";

interface WorkerPortraitProps {
  name?: string;
  title?: string;
  portraitUrl?: string;
  size?: "sm" | "md" | "lg";
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function WorkerPortrait({
  name,
  title,
  portraitUrl,
  size = "md",
}: WorkerPortraitProps) {
  const className = [styles.portrait, styles[size]].join(" ");

  return (
    <div className={className}>
      <div className={styles.frameContainer}>
        {/* Static decorative frame asset. next/image optimization not beneficial. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/ui/circle-border.webp"
          alt=""
          className={styles.frame}
          aria-hidden="true"
        />
        {portraitUrl ? (
          // Portrait source is dynamic (user-provided URL), but rendered at small fixed
          // sizes within the frame. next/image would add unnecessary complexity.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={portraitUrl}
            alt={name ? `Portrait of ${name}` : "Worker portrait"}
            className={styles.inner}
          />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            {name ? getInitials(name) : "?"}
          </div>
        )}
      </div>
      {name && <p className={styles.name}>{name}</p>}
      {title && <p className={styles.title}>{title}</p>}
    </div>
  );
}
