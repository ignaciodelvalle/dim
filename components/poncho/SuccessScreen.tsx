"use client";

// SuccessScreen — shared closing screen for trámite-style flows (denuncia,
// adoption application, intake, devolución, mordedura, …). Per AGENTS.md →
// 'Design rules' rule #4, these flows MUST end on this screen rather than
// silently redirecting. The flow surfaces the optional confirmation code,
// a short description of what's next, and 2-3 contextual actions.
//
// Trilogy unification handoff §2 PR-011.

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

type SuccessScreenProps = {
  title: string;
  /** Optional confirmation code (e.g. DEN-A1B2-C3D4). When present, it's
   * rendered as a hero element with a "tap to copy" affordance. */
  code?: string;
  /** Optional one-line description below the title. */
  description?: string;
  /** Optional cautionary line (smaller, muted) shown under the code block. */
  codeWarning?: string;
  /** 1-3 actions in priority order. First action takes the primary slot. */
  next: SuccessAction[];
};

export function SuccessScreen({ title, code, description, codeWarning, next }: SuccessScreenProps) {
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
    <div className="bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-sm w-full space-y-8 text-center">
        <div
          className="w-16 h-16 rounded-full bg-gob-success/10 flex items-center justify-center mx-auto text-3xl"
          aria-hidden="true"
        >
          ✅
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-gob-text">{title}</h1>
          {description ? (
            <p className="text-sm text-gob-text-muted leading-relaxed">{description}</p>
          ) : null}
        </div>

        {code ? (
          <div className="rounded-2xl border-2 border-gob-border bg-gob-surface-alt px-6 py-6 space-y-3">
            <p className="text-xs uppercase tracking-widest text-gob-text-muted font-medium">
              Tu código de seguimiento
            </p>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? "Código copiado" : "Tocar para copiar el código"}
              className="block w-full focus:outline-none focus:ring-2 focus:ring-gob-primary rounded-lg"
            >
              <span className="block text-3xl font-mono font-bold tracking-widest tabular-nums text-gob-text break-all">
                {code}
              </span>
              <span className="block text-xs text-gob-text-muted mt-2">
                {copied ? "¡Copiado!" : "Tocá para copiar"}
              </span>
            </button>
          </div>
        ) : null}

        {codeWarning ? (
          <p className="text-xs text-gob-text-muted leading-relaxed">{codeWarning}</p>
        ) : null}

        <div className="space-y-3">
          {next.map((action, idx) => {
            const variant = action.variant ?? (idx === 0 ? "primary" : "secondary");
            const className = variantClass(variant);
            const key = action.label;
            if ("href" in action) {
              return (
                <Link key={key} href={action.href} className={className}>
                  {action.label}
                </Link>
              );
            }
            return (
              <button key={key} type="button" onClick={action.onClick} className={className}>
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function variantClass(variant: NonNullable<SuccessAction["variant"]>): string {
  const base =
    "block w-full px-4 py-3.5 rounded-xl font-semibold text-sm text-center transition-colors";
  switch (variant) {
    case "primary":
      return `${base} bg-gob-primary text-white hover:opacity-90`;
    case "secondary":
      return `${base} border border-gob-border text-gob-text-gray font-medium hover:bg-gob-surface-alt`;
    case "tertiary":
      return `${base} text-gob-text-muted hover:text-gob-text font-medium`;
  }
}
