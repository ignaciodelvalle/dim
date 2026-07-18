"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Icon } from "@/components/Icon";
import type { EventType } from "@/db/schema";
import { matchCaptureIntent, matchToCaptureUrl } from "@/lib/events/event-capture-matcher";
import { EVENT_CAPTURE_REGISTRY, buildCaptureDeeplink } from "@/lib/events/event-capture-registry";
import { goToCaptureUrl } from "@/lib/ui/capture-nav";
import { todayIsoInAr } from "@/lib/utils/format";
import { QUICK_ACTIONS, buildKindDeeplink, findQuickAction, getNoteSlotKey } from "./handoff";

// Re-exports keep existing callers (tests, deeplink handoff) working without churn.
export { QUICK_ACTIONS, buildKindDeeplink, findQuickAction, getNoteSlotKey };
export type { QuickAction } from "./handoff";

const PLACEHOLDER_EXAMPLES = [
  'ej: "le di la antirrábica hoy"',
  'ej: "pesa 12.5 kg"',
  'ej: "lo castraron ayer"',
  'ej: "le pusieron el chip"',
  'ej: "tiene vómitos hace 2 días"',
];

export function CaptureBox({
  petPublicToken,
  petName,
  initialText,
  initialKind,
}: {
  petPublicToken: string;
  petName: string;
  initialText?: string;
  initialKind?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(initialText ?? "");
  const [unmatched, setUnmatched] = useState(false);
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect — initialText/initialKind drive a one-shot redirect, not reactive updates.
  useEffect(() => {
    if (initialKind) {
      const url = buildKindDeeplink(
        initialKind as EventType,
        petPublicToken,
        initialText?.trim() || undefined,
      );
      if (url) {
        // Router-hot-path fix (same as identify() below): a same-route
        // ?sheet= destination (CaptureBox mounted inside SheetMounter at
        // `?sheet=anotar` on the profile route) must go through pushSheetUrl,
        // not router.replace — see lib/ui/capture-nav.ts.
        goToCaptureUrl(pathname, url, router, "replace");
        return;
      }
    }
    if (initialText) {
      const trimmed = initialText.trim();
      if (!trimmed) return;
      setUnmatched(false);
      const match = matchCaptureIntent(trimmed);
      if (!match) {
        setUnmatched(true);
        return;
      }
      const url = matchToCaptureUrl(petPublicToken, match, buildCaptureDeeplink);
      if (url) {
        startTransition(() => {
          goToCaptureUrl(pathname, url, router);
        });
      } else {
        setUnmatched(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function identify(e: React.FormEvent) {
    e.preventDefault();
    setUnmatched(false);
    const trimmed = text.trim();
    if (!trimmed) return;

    const match = matchCaptureIntent(trimmed);
    if (!match) {
      setUnmatched(true);
      return;
    }

    // Sub-flows of a shared eventType (e.g. pregnancy started/ended over
    // clinical_info_logged) opt into a routeOverride. When present, build
    // the URL by appending slots as querystring; otherwise fall back to
    // the registry deeplink.
    const url = matchToCaptureUrl(petPublicToken, match, buildCaptureDeeplink);
    if (!url) {
      // Registry entry missing for the matched event type. Shouldn't
      // happen because the matcher only emits types that we registered,
      // but defensive fallback.
      setUnmatched(true);
      return;
    }

    startTransition(() => {
      goToCaptureUrl(pathname, url, router);
    });
  }

  // No-match fallback (QA A8/B): the matcher must NEVER silently discard the
  // owner's text. When nothing matches, offer to keep it as a free note with
  // the raw text prefilled — a one-tap escape hatch to the nota sheet — instead
  // of leaving the user with only a "probá de nuevo" dead end.
  function saveAsNote() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const url = buildCaptureDeeplink("note_added", petPublicToken, { text: trimmed });
    if (!url) return;
    startTransition(() => {
      goToCaptureUrl(pathname, url, router);
    });
  }

  // For the quick-action cards we prefill `occurredAt=today` so the
  // form lands ready-to-submit on the most common case (an event that
  // just happened). Date formatting is local.
  const today = todayIsoInAr();

  return (
    <div className="space-y-6">
      <form onSubmit={identify} className="space-y-3">
        <label htmlFor="capture-text" className="sr-only">
          ¿Qué pasó?
        </label>
        <div className="flex items-start gap-2">
          <textarea
            id="capture-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (unmatched) setUnmatched(false);
            }}
            rows={3}
            placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
            className="w-full flex-1 px-4 py-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink)] text-base outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
          />
          {/* Roadmap placeholder — voice dictation (PO-approved pattern:
              visible, disabled, reads as "coming", never as broken —
              precedent: "Informe de situación (en desarrollo)" in panorama's
              SituationalMap). Disabled semantics only: no submit, no focus
              trap, doesn't touch the textarea's onChange/value wiring. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            aria-label="Dictado por voz (próximamente)"
            title="Dictado por voz (próximamente)"
            className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] text-[var(--color-ln-faint)] cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="mic" size="sm" decorative />
          </button>
        </div>
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="px-5 py-2.5 rounded-[3px] bg-[var(--color-ln-ok)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Buscando formulario..." : "Identificar →"}
        </button>
        {unmatched && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-ln-warn)]">
              No reconocimos el evento. Podés decirlo distinto, tocar uno de los atajos, o guardarlo
              como nota tal cual lo escribiste.
            </p>
            <button
              type="button"
              onClick={saveAsNote}
              disabled={pending || !text.trim()}
              className="px-4 py-2 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] text-sm font-semibold text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar como nota
            </button>
          </div>
        )}
      </form>

      <div className="flex items-center gap-3 text-xs text-[var(--color-ln-mute)]">
        <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
        <span>o cargá directamente</span>
        <div className="flex-1 h-px bg-[var(--color-ln-stripe)]" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {QUICK_ACTIONS.map((qa) => {
          const entry = EVENT_CAPTURE_REGISTRY[qa.eventType];
          if (!entry) return null;
          const slots: Record<string, string> = entry.prefillSlots.includes("occurredAt")
            ? { occurredAt: today }
            : {};
          const href = buildCaptureDeeplink(qa.eventType, petPublicToken, slots) ?? "#";
          return (
            <Link
              key={qa.eventType}
              href={href}
              className="text-center px-3 py-3 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] hover:bg-[var(--color-ln-stripe)] text-sm font-medium text-[var(--color-ln-ink)]"
            >
              {qa.label}
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-[var(--color-ln-mute)] text-center pt-2">
        Si lo que necesitás registrar no aparece arriba,{" "}
        <Link
          href={`/mis-mascotas/${petPublicToken}/eventos/nuevo`}
          className="underline hover:text-[var(--color-ln-ink)]"
        >
          ver todos los tipos de evento
        </Link>{" "}
        para {petName}.
      </p>
    </div>
  );
}
