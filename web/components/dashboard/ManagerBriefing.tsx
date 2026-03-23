"use client";

import { useEffect, useState } from "react";
import Panel from "@/web/components/ui/Panel";
import styles from "./ManagerBriefing.module.css";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import ReactMarkdown from "react-markdown";

interface BriefingData {
  briefing: string;
  generatedAt: string;
  cached: boolean;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: BriefingData }
  | { status: "error"; message: string };

export function formatRelativeTime(isoDate: string, now = Date.now()): string {
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return "just now";

  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

interface ManagerBriefingProps {
  projectName?: string;
}

export default function ManagerBriefing({ projectName }: ManagerBriefingProps) {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    const fetchBriefing = async () => {
      setState({ status: "loading" });

      const url = projectName
        ? `/api/briefing/${encodeURIComponent(projectName)}`
        : `/api/briefing/all`;

      try {
        const res = await fetch(url);
        if (cancelled) return;

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setState({
            status: "error",
            message: body.error ?? `Request failed (${res.status})`,
          });
          return;
        }

        const data = (await res.json()) as BriefingData;
        setState({ status: "loaded", data });
      } catch (err: unknown) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to fetch briefing",
        });
      }
    };

    void fetchBriefing();

    return () => {
      cancelled = true;
    };
  }, [projectName]);

  return (
    <Panel title="Guild Master's Briefing" variant="parchment">
      {/* Static decorative asset. next/image optimization not beneficial. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/ui/scroll-window.webp"
        alt=""
        className={styles.divider}
        aria-hidden="true"
      />
      {state.status === "idle" && null}
      {state.status === "loading" && (
        <div className={styles.skeleton}>
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </div>
      )}
      {state.status === "loaded" && (
        <>
          <div className={styles.briefingText}>

            {state.data.briefing.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{state.data.briefing}</ReactMarkdown>
            ) : (
              <pre className={styles.rawFallback}>{state.data.briefing}</pre>
            )}

          </div>
          <div className={styles.meta}>
            {/* Server and client may disagree on relative time due to fetch timing.
                suppressHydrationWarning is appropriate because the value is approximate
                and updates on every briefing refresh. */}
            <span className={styles.timestamp} suppressHydrationWarning>
              Last updated: {formatRelativeTime(state.data.generatedAt)}
            </span>
          </div>
        </>
      )}
      {state.status === "error" && (
        <p className={styles.errorText}>{state.message}</p>
      )}
    </Panel>
  );
}
