"use client";

// LnSuccessScreen — LN-skinned closing screen for trámite-style flows.
//
// Styled with LN tokens (no gob-* classes).
// Per design rule: flows MUST end on this screen rather than silently redirecting.

import Link from "next/link";
import { useState } from "react";

export type SuccessAction =
  | {
      label: string;
      href: string;
      variant?: "primary" | "secondary" | "tertiary";
    }
  | {
      label: string;
      onClick: () => void;
      variant?: "primary" | "secondary" | "tertiary";
    };

export type LnSuccessScreenProps = {
  title: string;
  /** Optional confirmation code (e.g. DEN-A1B2-C3D4). Rendered as a hero
   * element with a "tap to copy" affordance. */
  code?: string;
  /** Optional one-line description below the title. */
  description?: string;
  /** Optional cautionary line (smaller, muted) shown under the code block. */
  codeWarning?: string;
  /** 1–3 actions in priority order. First action takes the primary slot. */
  next: SuccessAction[];
};

export function LnSuccessScreen({
  title,
  code,
  description,
  codeWarning,
  next,
}: LnSuccessScreenProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — silently degrade.
    }
  }

  return (
    <div className="bg-[var(--color-ln-paper)] flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full space-y-8 text-center">
        {/* Success icon badge — green tint, LN ok token */}
        <div
          className="w-16 h-16 rounded-full bg-[var(--color-ln-ok-050)] border border-[var(--color-ln-ok-100)] flex items-center justify-center mx-auto"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-[var(--color-ln-ok)]"
            role="img"
            aria-label="Éxito"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-[var(--color-ln-ink)]">{title}</h1>
          {description ? (
            <p className="text-sm text-[var(--color-ln-mute)] leading-relaxed">{description}</p>
          ) : null}
        </div>

        {/* Confirmation code block */}
        {code ? (
          <div className="rounded-[var(--radius-sm)] border-2 border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] px-6 py-6 space-y-3">
            <p className="font-[var(--font-ln-mono)] text-xs uppercase tracking-widest text-[var(--color-ln-mute)] font-medium">
              Tu código de seguimiento
            </p>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? "Código copiado" : "Tocar para copiar el código"}
              className="block w-full focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)] rounded-[3px]"
            >
              <span className="block font-[var(--font-ln-mono)] text-3xl font-bold tracking-widest tabular-nums text-[var(--color-ln-ink)] break-all">
                {code}
              </span>
              <span className="block text-xs text-[var(--color-ln-mute)] mt-2">
                {copied ? "¡Copiado!" : "Tocá para copiar"}
              </span>
            </button>
          </div>
        ) : null}

        {codeWarning ? (
          <p className="text-xs text-[var(--color-ln-mute)] leading-relaxed">{codeWarning}</p>
        ) : null}

        {/* Actions */}
        <div className="space-y-3">
          {next.map((action, idx) => {
            const variant = action.variant ?? (idx === 0 ? "primary" : "secondary");
            const cls = actionClass(variant);
            const key = action.label;
            if ("href" in action) {
              return (
                <Link key={key} href={action.href} className={cls}>
                  {action.label}
                </Link>
              );
            }
            return (
              <button key={key} type="button" onClick={action.onClick} className={cls}>
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function actionClass(variant: NonNullable<SuccessAction["variant"]>): string {
  const base =
    "block w-full px-4 py-3.5 rounded-[3px] font-semibold text-sm text-center transition-colors";
  switch (variant) {
    case "primary":
      return `${base} bg-[var(--color-ln-azul)] text-white border border-[var(--color-ln-azul)] hover:bg-[var(--color-ln-azul-700)] hover:border-[var(--color-ln-azul-700)]`;
    case "secondary":
      return `${base} border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink-2)] hover:bg-[var(--color-ln-stripe)]`;
    case "tertiary":
      return `${base} text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink)] font-medium`;
  }
}
