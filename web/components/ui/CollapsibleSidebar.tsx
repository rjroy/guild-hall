"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import styles from "./CollapsibleSidebar.module.css";

interface CollapsibleSidebarProps {
  children: React.ReactNode;
  storageKey: string;
  label: string;
  width: number;
  className?: string;
}

/** Read collapsed state from localStorage. Returns false if unset or unparseable. */
export function readCollapsed(storageKey: string): boolean {
  return localStorage.getItem(storageKey) === "true";
}

/** Write collapsed state to localStorage. */
export function writeCollapsed(storageKey: string, collapsed: boolean): void {
  localStorage.setItem(storageKey, String(collapsed));
}

/**
 * Wraps sidebar content with collapse/expand behavior.
 * Persists collapsed state to localStorage per storageKey.
 * Uses CSS transitions for smooth width animation.
 *
 * At mobile widths (<=768px), the parent view hides this via the className
 * prop and shows an InlinePanel instead.
 */
export default function CollapsibleSidebar({
  children,
  storageKey,
  label,
  width,
  className,
}: CollapsibleSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const expandTabRef = useRef<HTMLButtonElement>(null);
  const collapseButtonRef = useRef<HTMLButtonElement>(null);

  // SSR-safe localStorage read: reconcile after mount (same pattern as DetailHeader)
  useEffect(() => {
    if (readCollapsed(storageKey)) {
      startTransition(() => setCollapsed(true));
    }
  }, [storageKey]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(storageKey, next);
      return next;
    });
  };

  // Move focus to the counterpart button after toggle
  useEffect(() => {
    if (collapsed) {
      expandTabRef.current?.focus();
    } else {
      collapseButtonRef.current?.focus();
    }
    // Only run on collapsed changes, not on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  return (
    <div className={`${styles.wrapper} ${className ?? ""}`}>
      {collapsed && (
        <button
          ref={expandTabRef}
          type="button"
          className={styles.expandTab}
          onClick={toggle}
          aria-expanded={false}
          aria-label={`Show ${label}`}
        >
          &#x25C0;
          <span className={styles.expandLabel}>{label}</span>
        </button>
      )}
      <div
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}
        style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      >
        {!collapsed && (
          <>
            <button
              ref={collapseButtonRef}
              type="button"
              className={styles.collapseButton}
              onClick={toggle}
              aria-expanded={true}
              aria-label={`Hide ${label}`}
            >
              &#x25B6;
            </button>
            <div className={styles.content}>
              {children}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
