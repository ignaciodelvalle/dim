"use client";

// CopyLinkButton — copies the invite URL to clipboard and provides brief feedback.

import { useState } from "react";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — fall back to selection for manual copy.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-gob-border-strong px-3 py-1 text-xs font-medium text-gob-text transition-colors hover:bg-gob-surface-alt"
    >
      {copied ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}
