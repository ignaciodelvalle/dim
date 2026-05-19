"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { EventType } from "@/db/schema";
import { matchCaptureIntent } from "@/lib/event-capture-matcher";
import { EVENT_CAPTURE_REGISTRY, buildCaptureDeeplink } from "@/lib/event-capture-registry";

const PLACEHOLDER_EXAMPLES = [
  'ej: "le di la antirrábica hoy"',
  'ej: "pesa 12.5 kg"',
  'ej: "lo castraron ayer"',
  'ej: "le pusieron el chip"',
  'ej: "tiene vómitos hace 2 días"',
];

// Quick-action cards. Each links to a form prefilled with `occurredAt=today`
// where applicable. Order is roughly by frequency of use.
const QUICK_ACTIONS: Array<{ eventType: EventType; label: string }> = [
  { eventType: "vaccination_administered", label: "Vacuna" },
  { eventType: "deworming_administered", label: "Antiparasit." },
  { eventType: "weight_recorded", label: "Peso" },
  { eventType: "vet_visit_logged", label: "Visita al vet" },
  { eventType: "sterilization_performed", label: "Castración" },
  { eventType: "microchip_implanted", label: "Microchip" },
  { eventType: "note_added", label: "Nota" },
  { eventType: "symptom_observed", label: "Síntoma" },
];

export function CaptureBox({
  petPublicToken,
  petName,
}: {
  petPublicToken: string;
  petName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [unmatched, setUnmatched] = useState(false);
  const [placeholderIdx] = useState(() => Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));

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
          className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 text-base focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50 focus:border-transparent"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Buscando formulario..." : "Identificar →"}
        </button>
        {unmatched && (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            No pude identificar el tipo de evento. Probá decirlo distinto, o tocá uno de los atajos.
          </p>
        )}
      </form>

      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
        <span>o cargá directamente</span>
        <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
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
              className="text-center px-3 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 text-sm font-medium text-neutral-900 dark:text-neutral-50"
            >
              {qa.label}
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500 text-center pt-2">
        Si lo que necesitás registrar no aparece arriba,{" "}
        <Link
          href={`/mis-mascotas/${petPublicToken}/eventos/nuevo`}
          className="underline hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ver todos los tipos de evento
        </Link>{" "}
        para {petName}.
      </p>
    </div>
  );
}
