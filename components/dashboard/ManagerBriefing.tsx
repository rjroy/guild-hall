"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/ui/Panel";
import EmptyState from "@/components/ui/EmptyState";
import styles from "./ManagerBriefing.module.css";

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

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
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
    if (!projectName) return;

    let cancelled = false;

    const fetchBriefing = async () => {
      setState({ status: "loading" });

      try {
        const res = await fetch(`/api/briefing/${encodeURIComponent(projectName)}`);
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
    <Panel title="Guild Master's Briefing">
      {/* Static decorative asset. next/image optimization not beneficial. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/ui/scroll-window.webp"
        alt=""
        className={styles.divider}
        aria-hidden="true"
      />
      {!projectName && (
        <EmptyState message="Select a project to see the briefing." />
      )}
      {projectName && state.status === "idle" && null}
      {projectName && state.status === "loading" && (
        <div className={styles.skeleton}>
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </div>
      )}
      {state.status === "loaded" && (
        <>
          <p className={styles.briefingText}>{state.data.briefing}</p>
          <div className={styles.meta}>
            <span className={styles.timestamp}>
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
