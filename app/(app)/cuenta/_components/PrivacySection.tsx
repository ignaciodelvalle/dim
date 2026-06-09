// PrivacySection — handoff P3-3
//
// Four iOS-style toggles wired to the existing privacy columns on profiles.
// One toggle = one server-action invocation, no batching. The action
// revalidates /cuenta so the toggle reflects the persisted value on next
// paint without any client-side state.

import { updatePrivacyPrefAction } from "@/app/actions/profile-self-service";
import type { PrivacyPrefKey } from "@/lib/privacy-prefs";

type PrivacyPrefs = Record<PrivacyPrefKey, boolean>;

interface Props {
  prefs: PrivacyPrefs;
}

const ROWS: Array<{
  key: PrivacyPrefKey;
  label: string;
  description?: string;
}> = [
  {
    key: "discloseNameCredential",
    label: "Mostrar mi nombre en la credencial pública",
    description: "Cuando alguien escanea el QR de tu mascota perdida.",
  },
  {
    key: "disclosePhoneCredential",
    label: "Mostrar mi teléfono en la credencial",
  },
  {
    key: "allowOrgContact",
    label: "Permitir que refugios y clínicas me contacten",
    description: "Para responder postulaciones de adopción o consultas.",
  },
  {
    key: "allowLostAlertsInZone",
    label: "Recibir alertas de mascotas perdidas en mi zona",
    description: "Notificación cuando un perro/gato se reporta perdido cerca tuyo.",
  },
];

export function PrivacySection({ prefs }: Props) {
  return (
    <section
      aria-labelledby="privacy-heading"
      className="rounded-[4px] border border-[var(--color-ln-line)] p-6 space-y-4"
    >
      <div>
        <h2 id="privacy-heading" className="text-base font-semibold text-[var(--color-ln-ink)]">
          Privacidad
        </h2>
        <p className="text-xs text-[var(--color-ln-mute)] mt-1">
          Controlá qué información mostramos sobre vos y a quién dejamos contactarte.
        </p>
      </div>

      <ul className="space-y-2">
        {ROWS.map((row) => {
          const value = prefs[row.key];
          return (
            <li key={row.key}>
              <form
                action={async () => {
                  "use server";
                  await updatePrivacyPrefAction(row.key, !value);
                }}
                className="flex items-center gap-3 rounded-[4px] bg-[var(--color-ln-stripe)] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-ln-ink)]">{row.label}</p>
                  {row.description && (
                    <p className="text-xs text-[var(--color-ln-mute)] mt-0.5">{row.description}</p>
                  )}
                </div>
                <button
                  type="submit"
                  role="switch"
                  aria-checked={value}
                  aria-label={row.label}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ln-azul)] focus-visible:ring-offset-2 ${
                    value ? "bg-[var(--color-ln-azul)]" : "bg-[var(--color-ln-line-strong)]"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      value ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      <div className="pt-3 border-t border-[var(--color-ln-line)]">
        <a
          href="/cuenta/privacidad"
          className="text-sm text-[var(--color-ln-azul)] hover:underline underline-offset-2"
        >
          Datos personales (Ley 25.326): descargar mis datos o eliminar mi cuenta →
        </a>
      </div>
    </section>
  );
}
