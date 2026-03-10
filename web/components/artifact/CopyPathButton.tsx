"use client";

import { useState } from "react";
import styles from "./CopyPathButton.module.css";

export default function CopyPathButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      className={styles.copyButton}
      onClick={handleCopy}
      title={path}
      aria-label={copied ? "Path copied" : "Copy artifact path"}
    >
      {copied ? "Copied!" : "Copy Path"}
    </button>
  );
}
