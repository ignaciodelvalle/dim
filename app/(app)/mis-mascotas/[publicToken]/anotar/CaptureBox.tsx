"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import type { EventType } from "@/db/schema";
import { matchCaptureIntent } from "@/lib/event-capture-matcher";
import { EVENT_CAPTURE_REGISTRY, buildCaptureDeeplink } from "@/lib/event-capture-registry";
import { QUICK_ACTIONS, buildKindDeeplink, findQuickAction, getNoteSlotKey } from "./handoff";

// Re-exports keep existing callers (tests, EventCatcher) working without churn.
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
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(initialText ?? "");
  const [unmatched, setUnmatched] = useState(false);
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect — initialText/initialKind drive a one-shot router.replace, not reactive updates.
  useEffect(() => {
    if (initialKind) {
      const url = buildKindDeeplink(
        initialKind as EventType,
        petPublicToken,
        initialText?.trim() || undefined,
      );
      if (url) {
        router.replace(url);
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
      let url: string | null;
      if (match.routeOverride) {
        const base = `/mis-mascotas/${petPublicToken}${match.routeOverride}`;
        const sep = match.routeOverride.includes("?") ? "&" : "?";
        const slotParams = new URLSearchParams();
        for (const [k, v] of Object.entries(match.slots)) {
          if (v !== "" && v !== undefined) slotParams.set(k, v);
        }
        const qs = slotParams.toString();
        url = qs ? `${base}${sep}${qs}` : base;
      } else {
        url = buildCaptureDeeplink(match.eventType, petPublicToken, match.slots);
      }
      if (url) {
        startTransition(() => {
          router.push(url);
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
    let url: string | null;
    if (match.routeOverride) {
      const base = `/mis-mascotas/${petPublicToken}${match.routeOverride}`;
      const sep = match.routeOverride.includes("?") ? "&" : "?";
      const slotParams = new URLSearchParams();
      for (const [k, v] of Object.entries(match.slots)) {
        if (v !== "" && v !== undefined) slotParams.set(k, v);
      }
      const qs = slotParams.toString();
      url = qs ? `${base}${sep}${qs}` : base;
    } else {
      url = buildCaptureDeeplink(match.eventType, petPublicToken, match.slots);
    }
    if (!url) {
      // Registry entry missing for the matched event type. Shouldn't
      // happen because the matcher only emits types that we registered,
      // but defensive fallback.
      setUnmatched(true);
      return;
    }

    startTransition(() => {
      router.push(url);
    });
  }

  // For the quick-action cards we prefill `occurredAt=today` so the
  // form lands ready-to-submit on the most common case (an event that
  // just happened). Date formatting is local.
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <form onSubmit={identify} className="space-y-3">
        <label htmlFor="capture-text" className="sr-only">
          ¿Qué pasó?
        </label>
        <textarea
          id="capture-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (unmatched) setUnmatched(false);
          }}
          rows={3}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
          className="w-full px-4 py-3 rounded-lg border border-gob-border-strong  bg-white  text-gob-text  text-base focus:outline-none focus:ring-2 focus:ring-gob-primary  focus:border-transparent"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="px-5 py-2.5 rounded-lg bg-gob-success text-white text-sm font-semibold hover:bg-gob-success disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Buscando formulario..." : "Identificar →"}
        </button>
        {unmatched && (
          <p className="text-sm text-gob-warning-text ">
            No pude identificar el tipo de evento. Probá decirlo distinto, o tocá uno de los atajos.
          </p>
        )}
      </form>

      <div className="flex items-center gap-3 text-xs text-gob-text-muted">
        <div className="flex-1 h-px bg-gob-surface-alt " />
        <span>o cargá directamente</span>
        <div className="flex-1 h-px bg-gob-surface-alt " />
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
              className="text-center px-3 py-3 rounded-lg border border-gob-border-strong  hover:bg-gob-surface-alt  text-sm font-medium text-gob-text "
            >
              {qa.label}
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-gob-text-muted text-center pt-2">
        Si lo que necesitás registrar no aparece arriba,{" "}
        <Link
          href={`/mis-mascotas/${petPublicToken}/eventos/nuevo`}
          className="underline hover:text-gob-text "
        >
          ver todos los tipos de evento
        </Link>{" "}
        para {petName}.
      </p>
    </div>
  );
}
