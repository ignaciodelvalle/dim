"use client";

// Post-create / post-reset success panel.
// Displays the magic link returned by createInstitutionalAccountAction or
// resetInstitutionalCredentialsAction with a copy button and guidance copy.

import { useState } from "react";

type Props = {
  magicLink: string;
  displayName: string;
  email: string;
  profileId: string;
  detailPath: string; // e.g. /admin/govts/[userId]
  onCreateAnother?: () => void;
};

export function MagicLinkResultPanel({
  magicLink,
  displayName,
  email,
  profileId: _profileId,
  detailPath,
  onCreateAnother,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(magicLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select the text in the input
    }
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
          Cuenta institucional creada
        </h3>
        <p className="text-sm text-green-700 dark:text-green-300 mt-1">
          {displayName} &middot; {email}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Link de acceso (magic link)
        </label>
        <div className="flex gap-2">
          <code className="flex-1 text-xs bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap block">
            {magicLink || "(link no disponible — usá Resetear credentials)"}
          </code>
          {magicLink && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 text-sm bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors shrink-0"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Compartilo manualmente con el operador. El link expira en 24h. Si lo perdés, podés
          regenerarlo desde la página de detalle del operador.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <a
          href={detailPath}
          className="px-4 py-2 text-sm bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
        >
          Ver cuenta
        </a>
        {onCreateAnother && (
          <button
            type="button"
            onClick={onCreateAnother}
            className="px-4 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Crear otra
          </button>
        )}
      </div>
    </div>
  );
}
