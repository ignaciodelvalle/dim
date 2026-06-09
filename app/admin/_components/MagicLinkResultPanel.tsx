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
    <div className="rounded-[6px] border border-ln-op-ok-bd bg-ln-op-ok-bg p-6 space-y-4">
      <div>
        <h3 className="text-[16px] font-semibold text-ln-op-ok">Cuenta institucional creada</h3>
        <p className="mt-1 text-[13px] text-ln-op-ok">
          {displayName} &middot; {email}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-ln-op-ink-2">Link de acceso (magic link)</p>
        <div className="flex gap-2">
          <code
            id="magic-link-display"
            className="flex-1 block overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-2 font-ln-mono text-[11px] text-ln-op-ink"
          >
            {magicLink || "(link no disponible - usa Resetear credentials)"}
          </code>
          {magicLink && (
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-[6px] bg-ln-op-azul px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-ln-op-azul-700"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          )}
        </div>
        <p className="text-[11px] text-ln-op-mute">
          Compartilo manualmente con el operador. El link expira en 24h. Si lo perdes, podes
          regenerarlo desde la pagina de detalle del operador.
        </p>
      </div>

      <div className="flex gap-3 pt-2">
        <a
          href={detailPath}
          className="rounded-[6px] bg-ln-op-azul px-4 py-2 text-[13px] font-medium text-white no-underline transition-colors hover:bg-ln-op-azul-700"
        >
          Ver cuenta
        </a>
        {onCreateAnother && (
          <button
            type="button"
            onClick={onCreateAnother}
            className="rounded-[6px] border border-ln-op-line px-4 py-2 text-[13px] font-medium text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe"
          >
            Crear otra
          </button>
        )}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-[6px] border border-ln-op-line px-4 py-2 text-[13px] font-medium text-ln-op-ink-2 transition-colors hover:bg-ln-op-stripe"
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
