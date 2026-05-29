"use client";

// CopyPublicLinkButton — copies the pet's public credential URL to the
// clipboard and shows a brief "¡Copiado!" confirmation. Extracted as its
// own client component so LostLastSeenCard stays a server component.

import { useState } from "react";

interface Props {
  /** Full public credential URL. e.g. https://mimar.ar/p/{token} */
  publicUrl: string;
}

export function CopyPublicLinkButton({ publicUrl }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard?.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="mt-3 w-full rounded-lg border border-gob-border bg-white px-3 py-2 text-xs font-medium text-gob-text hover:bg-gob-surface-alt"
    >
      {copied ? "¡Copiado! ✓" : "Copiar link público"}
    </button>
  );
}
