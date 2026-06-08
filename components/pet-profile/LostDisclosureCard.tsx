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
    <section aria-labelledby="lp-discl-h">
      <div className="mb-[12px] flex items-baseline justify-between">
        <h3
          id="lp-discl-h"
          className="m-0 font-[var(--font-ln-serif)] text-[14px] font-semibold"
          style={{ color: "var(--color-ln-ink)" }}
        >
          Qué se muestra al público
        </h3>
        <Link
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          className="font-[var(--font-ln-mono)] text-[11px] tracking-[.04em] no-underline hover:underline"
          style={{ color: "var(--color-ln-azul)" }}
        >
          Ver como público →
        </Link>
      </div>

      <ul className="flex flex-col gap-[7px]">
        {ROWS.map((row) => (
          <li key={row.key}>
            <form
              action={async () => {
                "use server";
                await toggleAction(row.key, !prefs[row.key]);
              }}
              className="flex items-center gap-[10px] rounded-[4px] border border-[var(--color-ln-line-2)] bg-[var(--color-ln-stripe)] px-[12px] py-[9px]"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-[12.5px] font-semibold leading-tight"
                  style={{ color: "var(--color-ln-ink)" }}
                >
                  {row.label}
                </p>
                <p className="text-[11px]" style={{ color: "var(--color-ln-mute)" }}>
                  {row.description}
                </p>
              </div>
              {/* Amber toggle knob — server-rendered, submit on click */}
              <button
                type="submit"
                role="switch"
                aria-checked={prefs[row.key]}
                aria-label={`Mostrar ${row.label.toLowerCase()}`}
                className="relative mt-[1px] h-[21px] w-[38px] flex-shrink-0 cursor-pointer rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--color-ln-celeste-050)]"
                style={{
                  background: prefs[row.key]
                    ? "var(--color-ln-warn)"
                    : "var(--color-ln-line-strong)",
                }}
              >
                <span
                  aria-hidden
                  className="absolute top-[2px] h-[17px] w-[17px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-[left] duration-150"
                  style={{ left: prefs[row.key] ? 19 : 2 }}
                />
              </button>
            </form>
          </li>
        ))}
      </ul>

      <p
        className="mt-[10px] font-[var(--font-ln-mono)] text-[10.5px] uppercase tracking-[.04em]"
        style={{ color: "var(--color-ln-mute)" }}
      >
        {prefs.discloseFirstNameWhenLost
          ? `Hoy verán "Lo busca ${ownerFirstName}".`
          : "Hoy no se muestra tu nombre."}
      </p>
    </section>
  );
}
