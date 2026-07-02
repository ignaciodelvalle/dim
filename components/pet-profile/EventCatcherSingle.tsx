"use client";

// EventCatcherSingle — embedded single-pet capture surface for the pet
// profile (pet-document-redesign ADR-12a/Phase 3; wave-3 P4, PO decision
// #645 point 4, dropped the quick-chip row). Sits directly under FlipCard;
// owner + active pet only (HIDDEN when deceased, REQ-9.3 — the caller gates
// rendering entirely, this component assumes it's always allowed to
// render). Reuses the SAME free-text matcher (`quickCaptureAction`) as the
// home-screen `EventCatcher`, minus the pet picker — the pet is already
// fixed by the profile it's embedded in, so there's no active-pet state, no
// long-press. Layout is a single row: the "¿Qué pasó?" textarea and the
// Anotar control sit at the same level (design finding 6 — LnCard/LnTextarea
// instead of a hand-rolled bordered section + native textarea).
//
// go() (router-hot-path fix): a submit target that's a `?sheet=` shorthand
// on THIS route (e.g. weight_recorded → ?sheet=peso) opens via pushSheetUrl
// (History API, no router involved) instead of router.push — see
// lib/ui/sheet-nav.ts. A target on a different route (a full page, e.g.
// vaccination_administered → /eventos/nuevo/vacuna, or the /anotar fallback)
// is a real navigation and still goes through router.push as before.

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buildAnotarUrl } from "@/app/(app)/mis-mascotas/[publicToken]/anotar/handoff";
import { quickCaptureAction } from "@/app/actions/quick-capture";
import { LnButton } from "@/components/ui/Button";
import { LnCard } from "@/components/ui/Card";
import { LnTextarea } from "@/components/ui/Field";
import { isSameRouteUrl, pushSheetUrl } from "@/lib/ui/sheet-nav";

type Props = {
  petPublicToken: string;
  petName: string;
};

export function EventCatcherSingle({ petPublicToken, petName }: Props) {
  const router = useRouter();
  const pathname = usePathname();
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

  return (
    <section data-section="event-catcher-single">
      <LnCard>
        <div className="flex items-end gap-3 p-4">
          <h2 className="sr-only">Anotar un evento para {petName}</h2>
          <LnTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit();
            }}
            placeholder={`${petName} — ¿qué pasó?`}
            rows={2}
            className="flex-1"
            aria-label={`Describí el evento de ${petName}`}
          />
          <LnButton
            variant="ok"
            size="md"
            onClick={onSubmit}
            disabled={text.trim().length < 3 || isPending}
          >
            {isPending ? "Abriendo…" : "Anotar"}
          </LnButton>
        </div>
      </LnCard>
    </section>
  );
}
