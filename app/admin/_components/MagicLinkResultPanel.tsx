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
  // Used in "create" context: show a "Crear otra" button that resets the create form.
  onCreateAnother?: () => void;
  // Used in "reset credentials" context: show a dismiss/close button.
  onReset?: () => void;
  resetLabel?: string;
};

export function MagicLinkResultPanel({
  magicLink,
  displayName,
  email,
  profileId: _profileId,
  detailPath,
  onCreateAnother,
  onReset,
  resetLabel = "Cerrar",
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
    <div className="rounded-lg border border-gob-success bg-gob-success/10   p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gob-success ">Cuenta institucional creada</h3>
        <p className="text-sm text-gob-success  mt-1">
          {displayName} &middot; {email}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-gob-text-gray ">Link de acceso (magic link)</p>
        <div className="flex gap-2">
          <code
            id="magic-link-display"
            className="flex-1 text-xs bg-white  border border-gob-border-strong  rounded px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap block"
          >
            {magicLink || "(link no disponible — usá Resetear credentials)"}
          </code>
          {magicLink && (
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-2 text-sm bg-gob-primary  text-white  rounded hover:bg-gob-border-strong  transition-colors shrink-0"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          )}
        </div>
        <p className="text-xs text-gob-text-muted ">
          Compartilo manualmente con el operador. El link expira en 24h. Si lo perdés, podés
          regenerarlo desde la página de detalle del operador.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <a
          href={detailPath}
          className="px-4 py-2 text-sm bg-gob-primary  text-white  rounded hover:bg-gob-border-strong  transition-colors"
        >
          Ver cuenta
        </a>
        {onCreateAnother && (
          <button
            type="button"
            onClick={onCreateAnother}
            className="px-4 py-2 text-sm border border-gob-border-strong  rounded hover:bg-gob-surface-alt  transition-colors"
          >
            Crear otra
          </button>
        )}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 text-sm border border-gob-border-strong  rounded hover:bg-gob-surface-alt  transition-colors"
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
