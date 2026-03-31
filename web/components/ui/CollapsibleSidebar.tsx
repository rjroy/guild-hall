"use client";

import { useState, useEffect, useRef, startTransition, useCallback } from "react";
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
  const hasToggledRef = useRef(false);

  // SSR-safe localStorage read: reconcile after mount (same pattern as DetailHeader)
  useEffect(() => {
    if (readCollapsed(storageKey)) {
      startTransition(() => setCollapsed(true));
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    hasToggledRef.current = true;
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(storageKey, next);
      return next;
    });
  }, [storageKey]);

  // Move focus to the counterpart button after user-initiated toggle only
  useEffect(() => {
    if (!hasToggledRef.current) return;
    if (collapsed) {
      expandTabRef.current?.focus();
    } else {
      collapseButtonRef.current?.focus();
    }
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
