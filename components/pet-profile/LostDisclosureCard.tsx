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

import Link from "next/link";

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
    <section
      aria-labelledby="lp-discl-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="lp-discl-h" className="text-base font-semibold text-gob-text ">
          Qué se muestra al público
        </h2>
        <Link
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-gob-azul-link hover:underline"
        >
          Ver como público →
        </Link>
      </div>

      <ul className="space-y-1.5">
        {ROWS.map((row) => (
          <li key={row.key}>
            <form
              action={async () => {
                "use server";
                await toggleAction(row.key, !prefs[row.key]);
              }}
              className="flex items-center gap-3 rounded-lg bg-gob-surface-alt px-3 py-2 "
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gob-text ">{row.label}</p>
                <p className="text-xs text-gob-text-muted ">{row.description}</p>
              </div>
              <button
                type="submit"
                role="switch"
                aria-checked={prefs[row.key]}
                aria-label={`Mostrar ${row.label.toLowerCase()}`}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-success focus-visible:ring-offset-2 ${prefs[row.key] ? "bg-gob-success" : "bg-gob-border-strong "}`}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${prefs[row.key] ? "translate-x-5" : "translate-x-0.5"}`}
                />
              </button>
            </form>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-gob-text-muted ">
        {prefs.discloseFirstNameWhenLost
          ? `Hoy verán "Lo busca ${ownerFirstName}".`
          : "Hoy no se muestra tu nombre."}
      </p>
    </section>
  );
}
