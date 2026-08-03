"use client";

// LostDisclosureCard — the owner-facing surface for the 5 disclosure
// toggles that already exist on `pets`:
//   - disclose_first_name_when_lost
//   - disclose_phone_when_lost
//   - disclose_email_when_lost
//   - disclose_last_location_when_lost
//   - allow_finder_form_when_lost
//
// Toggles persist via the existing `setPetDisclosurePrefsAction` (or
// equivalent — wire by the page). Below the toggles, a small public
// preview card shows the resulting view.
//
// This intentionally duplicates the disclosure list from the existing
// MarkLostForm — once both surfaces live, that form's toggles can be
// replaced by importing this component.
//
// wave-3 D2 (design-system audit finding 2): the 5 rows used to hand-roll
// their own toggle switch (px values copied from Toggle.tsx internals),
// duplicating LnToggle's amber variant, which was purpose-built for
// disclosure/lost-mode settings per its own docblock. Now a "use client"
// component using LnToggleGroup directly — this DROPS the previous
// no-JS-required <form action={...}> submit-per-row model in favor of a
// client onChange calling `toggleAction` directly. This is safe: the LostCaseBlock
// doc comment (this component's only caller) already anticipated exactly
// this alternative ("or the action must be pre-bound and passed down as a
// prop") — `toggleAction` IS a pre-bound Server Action
// (setPetDisclosurePrefsAction.bind(null, publicToken)), fully callable
// from a client event handler. LostCaseBlock itself stays a Server
// Component (for LostScanFeed's server-only db import, unrelated to this).

import Link from "next/link";

import { Icon } from "@/components/Icon";
import { LnToggleGroup } from "@/components/ui/Toggle";
import { notifyActionError, notifySaved } from "@/lib/ui/action-feedback";

export type DisclosurePrefs = {
  discloseFirstNameWhenLost: boolean;
  disclosePhoneWhenLost: boolean;
  discloseEmailWhenLost: boolean;
  discloseLastLocationWhenLost: boolean;
  allowFinderFormWhenLost: boolean;
};

interface Props {
  prefs: DisclosurePrefs;
  /** Server-action bound by the page, one update per change. */
  toggleAction: (key: keyof DisclosurePrefs, next: boolean) => Promise<void>;
  /** Public credential URL — preview opens it in a new tab. */
  publicHref: string;
  /** Owner first name as it'd show on the public page. */
  ownerFirstName: string;
}

// Row descriptions double as the concrete preview of what the public sees
// (QA 2026-08-03: the old standalone `Hoy verán "Lo busca X"` footer line
// was easy to misread out of context — the preview now lives on the option
// it belongs to; the name row interpolates the real first name at render).
const ROWS: Array<{
  key: keyof DisclosurePrefs;
  label: string;
  description: string;
}> = [
  {
    key: "discloseFirstNameWhenLost",
    label: "Tu nombre",
    description: "El público ve quién busca a la mascota.",
  },
  {
    key: "disclosePhoneWhenLost",
    label: "Tu teléfono",
    description: "Aparece un botón directo de llamada.",
  },
  {
    key: "discloseEmailWhenLost",
    label: "Tu email",
    description: "Link mailto: en la credencial pública.",
  },
  {
    key: "discloseLastLocationWhenLost",
    label: "Última ubicación",
    description: "Muestra el mapa con el pin donde se perdió.",
  },
  {
    key: "allowFinderFormWhenLost",
    label: "Formulario de finder",
    description: "Permite avisar sin necesitar tu contacto.",
  },
];

export function LostDisclosureCard({ prefs, toggleAction, publicHref, ownerFirstName }: Props) {
  return (
    <section aria-labelledby="lp-discl-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h3
          id="lp-discl-h"
          className="m-0 flex items-center gap-1.5 font-ln-serif text-md font-semibold"
          style={{ color: "var(--color-ln-ink)" }}
        >
          <span className="text-[var(--color-ln-mute)]">
            <Icon name="shield" size="sm" decorative />
          </span>
          Qué se muestra al público
        </h3>
        <Link
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          className="font-ln-mono text-xs tracking-[.04em] no-underline hover:underline"
          style={{ color: "var(--color-ln-azul)" }}
        >
          Ver como público →
        </Link>
      </div>

      <LnToggleGroup
        items={ROWS.map((row) => ({
          key: row.key,
          label: row.label,
          description:
            row.key === "discloseFirstNameWhenLost" && prefs.discloseFirstNameWhenLost
              ? `El público ve "Lo busca ${ownerFirstName}".`
              : row.description,
          checked: prefs[row.key],
          variant: "amber",
        }))}
        onChange={(key, next) => {
          // No local optimistic state here (checked mirrors the `prefs` prop
          // directly) and toggleAction has no error surface of its own — the
          // toast is the ONLY feedback the owner gets that a toggle landed
          // (mutation-feedback convention, lib/ui/action-feedback.ts).
          toggleAction(key as keyof DisclosurePrefs, next)
            .then(() => notifySaved("Preferencia actualizada"))
            .catch(() => notifyActionError("No se pudo guardar. Probá de nuevo."));
        }}
      />
    </section>
  );
}
