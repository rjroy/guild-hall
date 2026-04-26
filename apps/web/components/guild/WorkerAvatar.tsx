export type WorkerRole =
  | "master"
  | "artificer"
  | "pathfinder"
  | "warden"
  | "breaker"
  | "scribe"
  | "steward"
  | "visionary";

interface WorkerAvatarProps {
  name?: string;
  role?: WorkerRole;
  size?: "md" | "lg" | "xl";
  /** Optional portrait image — falls back to initial when missing */
  portraitUrl?: string;
}

function getInitial(name?: string): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed[0].toUpperCase();
}

export default function WorkerAvatar({
  name,
  role = "master",
  size = "md",
  portraitUrl,
}: WorkerAvatarProps) {
  const sizeClass = size === "lg" ? "avatar--lg" : size === "xl" ? "avatar--xl" : "";
  const className = `avatar avatar--${role} ${sizeClass}`.trim();

  if (portraitUrl) {
    return (
      <span className={className} aria-label={name}>
        {/* Portrait source is dynamic (worker-provided URL), rendered at avatar size. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portraitUrl}
          alt=""
          aria-hidden="true"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </span>
    );
  }

  return (
    <span className={className} aria-label={name}>
      {getInitial(name)}
    </span>
  );
}
