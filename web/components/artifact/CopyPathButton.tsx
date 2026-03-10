"use client";

import { useState } from "react";
import styles from "./CopyPathButton.module.css";

type CopyState = "idle" | "copied" | "error";

export default function CopyPathButton({ path }: { path: string }) {
  const [state, setState] = useState<CopyState>("idle");

  const copyWithFallback = async () => {
    try {
      // Try clipboard API first (modern browsers with secure context)
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(path);
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
        return;
      }
    } catch {
      // Clipboard API failed, fall through to fallback
    }

    // Fallback: create temporary textarea and use execCommand
    try {
      const textarea = document.createElement("textarea");
      textarea.value = path;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      const success = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (success) {
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      } else {
        setState("error");
        setTimeout(() => setState("idle"), 2000);
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  const handleCopy = () => {
    void copyWithFallback();
  };

  const buttonText =
    state === "copied" ? "Copied!" : state === "error" ? "Failed!" : "Copy Path";

  return (
    <button
      className={styles.copyButton}
      onClick={handleCopy}
      title={path}
      aria-label={
        state === "copied" ? "Path copied" : "Copy artifact path to clipboard"
      }
      disabled={state !== "idle"}
    >
      {buttonText}
    </button>
  );
}
