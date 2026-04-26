import type { ReactNode } from "react";

export type GemTone =
  | "moss"
  | "ember"
  | "brass"
  | "lapis"
  | "oxblood"
  | "verdigris"
  | "ink";

interface StatusPillProps {
  tone?: GemTone;
  children: ReactNode;
}

export default function StatusPill({ tone = "ink", children }: StatusPillProps) {
  return (
    <span className="status-pill">
      <span className={`gem gem--${tone}`} />
      {children}
    </span>
  );
}
