import Link from "next/link";
import styles from "./Breadcrumb.module.css";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  className?: string;
}

export default function Breadcrumb({ segments, className }: BreadcrumbProps) {
  const navClassName = className
    ? `${styles.breadcrumb} ${className}`
    : styles.breadcrumb;

  return (
    <nav className={navClassName} aria-label="Breadcrumb">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className={styles.segment}>
            {i > 0 && (
              <span className={styles.separator} aria-hidden="true">
                &rsaquo;
              </span>
            )}
            {isLast || !segment.href ? (
              <span className={styles.current}>{segment.label}</span>
            ) : (
              <Link href={segment.href} className={styles.link}>
                {segment.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
