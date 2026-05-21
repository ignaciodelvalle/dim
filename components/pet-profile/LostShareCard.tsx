"use client";

// LostShareCard — four share buttons + a copy-link action. Client because
// each button does a window.open() / navigator.clipboard / navigator.share
// call when available.
//
// Why server-rendering the URLs first: we want stable links the server
// has approved (canonical /p/{token}) instead of relying on the client
// to assemble them. Share messages are templated server-side too so the
// pet's first-name / phone visibility honours the disclosure prefs.

import { useState } from "react";

interface Props {
  /** Public credential URL. e.g. https://mimar.ar/p/{token} */
  publicUrl: string;
  /** Pre-built share copy, already filtered by disclosure prefs. */
  shareText: string;
  /** Route or external link to the printable poster (PDF/SVG). */
  posterHref: string;
}

export function LostShareCard({ publicUrl, shareText, posterHref }: Props) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard?.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function shareWhatsApp() {
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${publicUrl}`)}`;
    window.open(url, "_blank", "noopener");
  }
  function shareTwitter() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(publicUrl)}`;
    window.open(url, "_blank", "noopener");
  }
  function shareFacebook() {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`;
    window.open(url, "_blank", "noopener");
  }
  function nativeShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      void navigator
        .share({ title: "Mascota perdida", text: shareText, url: publicUrl })
        .catch(() => {});
    }
  }

  return (
    <section
      aria-labelledby="lp-share-h"
      className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          id="lp-share-h"
          className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
        >
          Compartir alerta
        </h2>
        <button
          type="button"
          onClick={copy}
          className="text-xs font-medium text-gob-azul-link hover:underline"
        >
          {copied ? "Copiado ✓" : "Copiar link"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <ShareButton label="WhatsApp" icon="💬" onClick={shareWhatsApp} />
        <ShareButton label="Twitter" icon="𝕏" onClick={shareTwitter} />
        <ShareButton label="Facebook" icon="f" onClick={shareFacebook} />
        <a
          href={posterHref}
          target="_blank"
          rel="noreferrer"
          className="flex flex-col items-center gap-1 rounded-lg bg-neutral-50 p-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-red-50 hover:text-red-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-red-950/30 dark:hover:text-red-200"
        >
          <span aria-hidden className="text-xl">
            🖨
          </span>
          Afiche
        </a>
      </div>
      {typeof navigator !== "undefined" && "share" in navigator && (
        <button
          type="button"
          onClick={nativeShare}
          className="mt-2 w-full rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Compartir con otras apps…
        </button>
      )}
    </section>
  );
}

function ShareButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg bg-neutral-50 p-3 text-xs font-medium text-neutral-700 transition-colors hover:bg-red-50 hover:text-red-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-red-950/30 dark:hover:text-red-200"
    >
      <span aria-hidden className="text-xl">
        {icon}
      </span>
      {label}
    </button>
  );
}
