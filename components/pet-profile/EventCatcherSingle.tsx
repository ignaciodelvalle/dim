"use client";

// EventCatcherSingle — embedded single-pet capture surface for the pet
// profile (pet-document-redesign ADR-12a/Phase 3). Sits directly under
// FlipCard; owner + active pet only (HIDDEN when deceased, REQ-9.3 — the
// caller gates rendering entirely, this component assumes it's always
// allowed to render). Reuses the SAME free-text matcher
// (`quickCaptureAction`) and quick-chip deeplink resolution
// (`buildKindDeeplink`/`buildAnotarUrl`) as the home-screen `EventCatcher`,
// minus the pet picker — the pet is already fixed by the profile it's
// embedded in, so there's no chip row, no active-pet state, no long-press.
//
// go() (router-hot-path fix): a chip/submit target that's a `?sheet=`
// shorthand on THIS route (e.g. weight_recorded → ?sheet=peso) opens via
// pushSheetUrl (History API, no router involved) instead of router.push —
// see lib/ui/sheet-nav.ts. A target on a different route (a full page, e.g.
// vaccination_administered → /eventos/nuevo/vacuna, or the /anotar fallback)
// is a real navigation and still goes through router.push as before.

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  QUICK_ACTIONS,
  buildAnotarUrl,
  buildKindDeeplink,
} from "@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff";
import { quickCaptureAction } from "@/app/actions/quick-capture";
import { LnButton } from "@/components/ui/Button";
import type { EventType } from "@/db/schema";
import { isSameRouteUrl, pushSheetUrl } from "@/lib/ui/sheet-nav";

type Props = {
  petPublicToken: string;
  petName: string;
};

// Same 5-chip cadence as the home-screen EventCatcher (vacuna/peso/vet/
// medicación/nota) — the most frequent quick captures. The full 8-option
// grid stays reserved for the dedicated /anotar picker.
const SINGLE_QUICK_TYPES: EventType[] = [
  "vaccination_administered",
  "weight_recorded",
  "vet_visit_logged",
  "medication_started",
  "note_added",
];

const singleQuickActions = SINGLE_QUICK_TYPES.map((eventType) =>
  QUICK_ACTIONS.find((qa) => qa.eventType === eventType),
).filter((qa): qa is (typeof QUICK_ACTIONS)[number] => qa !== undefined);

export function EventCatcherSingle({ petPublicToken, petName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();

  function go(href: string) {
    if (isSameRouteUrl(pathname, href)) {
      pushSheetUrl(href);
      return;
    }
    router.push(href);
  }

  function onSubmit() {
    if (text.trim().length < 3) return;
    const trimmed = text.trim();
    startTransition(async () => {
      const { url } = await quickCaptureAction(petPublicToken, trimmed);
      // Same fallback contract as EventCatcher: no matched pattern → land on
      // /anotar?text=... so CaptureBox surfaces the "no reconocemos eso" UI.
      go(url ?? buildAnotarUrl(petPublicToken, { text: trimmed }));
    });
  }

  function onQuick(kind: EventType) {
    const direct = buildKindDeeplink(kind, petPublicToken, text.trim() || undefined);
    if (direct) {
      go(direct);
      return;
    }
    go(buildAnotarUrl(petPublicToken, { kind, text: text.trim() || undefined }));
  }

  return (
    <section
      data-section="event-catcher-single"
      className="rounded-2xl border border-ln-line bg-ln-card p-4"
    >
      <h2 className="sr-only">Anotar un evento para {petName}</h2>

      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit();
        }}
        placeholder={`${petName} — ¿qué pasó?`}
        rows={3}
        className="w-full resize-y rounded-xl border border-ln-line bg-ln-card p-3 text-sm text-ln-ink outline-none focus:border-ln-azul focus:ring-2 focus:ring-ln-azul/30"
        aria-label={`Describí el evento de ${petName}`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {singleQuickActions.map((qa) => (
          <button
            key={qa.eventType}
            type="button"
            onClick={() => onQuick(qa.eventType)}
            disabled={isPending}
            className="rounded-md border border-ln-line bg-ln-card px-3 py-2 text-sm font-medium text-ln-ink-2 transition-colors hover:bg-ln-stripe disabled:bg-ln-stripe disabled:text-ln-mute"
          >
            {qa.label}
          </button>
        ))}
        <div className="ml-auto" />
        <LnButton
          variant="ok"
          size="md"
          onClick={onSubmit}
          disabled={text.trim().length < 3 || isPending}
        >
          {isPending ? "Abriendo…" : "Anotar"}
        </LnButton>
      </div>
    </section>
  );
}
