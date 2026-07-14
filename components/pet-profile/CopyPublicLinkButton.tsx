"use client";

// CopyPublicLinkButton — copies the pet's public credential URL to the
// clipboard and shows a brief "¡Copiado!" confirmation. Extracted as its
// own client component so LostLastSeenCard stays a server component.

import { useState } from "react";

import { Icon } from "@/components/Icon";

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
      className="mt-3 w-full rounded-lg border border-ln-line bg-ln-card px-3 py-2 text-xs font-medium text-ln-ink hover:bg-ln-stripe"
    >
      {copied ? (
        <span className="inline-flex items-center justify-center gap-1">
          ¡Copiado! <Icon name="check" size={14} decorative />
        </span>
      ) : (
        "Copiar link público"
      )}
    </button>
  );
}
