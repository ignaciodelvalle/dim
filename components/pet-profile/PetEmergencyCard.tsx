import Link from "next/link";

// PetEmergencyCard — sits high on the owner profile because emergencies
// are the most time-critical reason an owner opens the app.
//
// Three things in one card:
//   1) Vet of record (tap = tel: link)
//   2) Owner emergency contact (tap = tel: link)
//   3) Medical alerts list (allergies, ongoing observations, conditions)
//
// The vet + contact are taken from `profile` + per-pet overrides. The
// alerts are derived from petEvents (incident_reported with type=bite_*,
// rabies_observation_started without _ended, clinical_info_logged with
// sub_kind=allergy_detection) — derivation lives in lib/pet-alerts.ts
// (to be added). For now the component takes them as plain props.

export type PetEmergencyContact = {
  /** Display label (Dra. Pérez, Lucía F.) */
  name: string;
  /** Role label above the name (Vet de cabecera / Contacto emergencia) */
  role: string;
  /** E.164 phone number for the tel: link. */
  phone: string;
};

export type PetMedicalAlert = {
  id: string;
  /** One line; keep terse. */
  text: string;
  /** Optional anchor URL — typically the event detail that generated it. */
  href?: string;
};

interface Props {
  vet: PetEmergencyContact | null;
  emergencyContact: PetEmergencyContact | null;
  alerts: PetMedicalAlert[];
  /** Where to go to edit. Usually /cuenta/emergencia or per-pet /editar. */
  editHref: string;
}

export function PetEmergencyCard({ vet, emergencyContact, alerts, editHref }: Props) {
  return (
    <section
      aria-labelledby="pp-emerg-h"
      className="rounded-2xl border border-gob-border bg-white p-4  "
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="pp-emerg-h" className="text-base font-semibold text-gob-text ">
          Emergencias
        </h2>
        <Link href={editHref} className="text-xs font-medium text-gob-azul-link hover:underline">
          Editar contactos →
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ContactCard contact={vet} icon="🏥" emptyLabel="Sin vet de cabecera" />
        <ContactCard contact={emergencyContact} icon="📞" emptyLabel="Sin contacto de emergencia" />
      </div>

      {alerts.length > 0 && (
        <div className="mt-3 rounded-lg border-l-[3px] border-gob-danger bg-gob-danger/10 px-3 py-2 ">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gob-danger ">
            Alertas médicas
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gob-danger ">
            {alerts.map((a) =>
              a.href ? (
                <li key={a.id}>
                  <Link href={a.href} className="hover:underline">
                    {a.text}
                  </Link>
                </li>
              ) : (
                <li key={a.id}>{a.text}</li>
              ),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

function ContactCard({
  contact,
  icon,
  emptyLabel,
}: {
  contact: PetEmergencyContact | null;
  icon: string;
  emptyLabel: string;
}) {
  if (!contact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gob-border-strong bg-gob-surface-alt p-3 text-sm text-gob-text-muted  ">
        <span aria-hidden>{icon}</span>
        <span className="text-xs">{emptyLabel}</span>
      </div>
    );
  }
  return (
    <a
      href={`tel:${contact.phone.replace(/\s+/g, "")}`}
      className="flex items-center gap-2.5 rounded-lg bg-gob-surface-alt p-3 transition-colors hover:bg-gob-danger/10  "
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gob-danger/10 text-gob-danger  "
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-gob-text-muted ">
          {contact.role}
        </span>
        <span className="block text-sm font-semibold text-gob-text ">
          {contact.name} · {contact.phone}
        </span>
      </span>
    </a>
  );
}
