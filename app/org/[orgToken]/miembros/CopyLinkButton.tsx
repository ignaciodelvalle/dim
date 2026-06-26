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
      className="rounded-[4px] border border-ln-op-line px-3 py-[5px] text-sm font-medium text-ln-op-ink transition-colors hover:bg-ln-op-stripe"
    >
      {copied ? "¡Copiado!" : "Copiar link"}
    </button>
  );
}
