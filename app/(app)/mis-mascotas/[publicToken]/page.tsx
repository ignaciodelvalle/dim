import { markMedicationDoseTakenAction } from "@/app/actions/events";
import { deleteVaccineReminderAction } from "@/app/actions/reminders";
import { PetOpenCasesSection } from "@/components/PetOpenCasesSection";
import {
  appointments,
  attachments,
  db,
  ownerships,
  petEvents,
  pets,
  reminders,
  serviceOfferings,
  timeSlots,
} from "@/db";
import type { Pet, Reminder } from "@/db";
import { excludeSelfScansClause } from "@/lib/events";
import { ageFromDateOfBirth, formatDate, sexLabel, speciesLabel, statusLabel } from "@/lib/format";
import { LIBRETA_FILTER_CHIPS, isLibretaSanitariaEvent } from "@/lib/libreta-sanitaria";
import { requirePetAccess } from "@/lib/pet-access";
import { eventAttachmentSignedUrl, petPhotoUrl } from "@/lib/storage";
import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventTimeline } from "./EventTimeline";
import { MarkFoundButton } from "./MarkFoundButton";

// NOTE: eventsWithAttachments is still fetched on this page because it is
// needed by the DeceasedView (which renders the timeline inline) and by
// MedicationDosesSection (which needs medication_started payloads to group doses).
// The historial route fetches its own copy independently.

// Returns a human-readable proximity hint for an upcoming medication dose.
// Examples: "Atrasada por 2h", "En 30 min", "Mañana 08:00", "Hoy 14:30".
function formatDoseProximity(dueAt: Date | string): string {
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / (1000 * 60));
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffMin < 0) {
    const absMins = Math.abs(diffMin);
    if (absMins < 60) return `Atrasada por ${absMins} min`;
    const absHours = Math.round(absMins / 60);
    if (absHours < 24) return `Atrasada por ${absHours}h`;
    const absDays = Math.floor(absHours / 24);
    return `Atrasada ${absDays} día${absDays === 1 ? "" : "s"}`;
  }
  if (diffMin === 0) return "Ahora";
  if (diffMin < 60) return `En ${diffMin} min`;
  if (diffHours < 24) {
    const timeStr = due.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `Hoy ${timeStr}`;
  }
  // Check if tomorrow.
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (
    due.getDate() === tomorrow.getDate() &&
    due.getMonth() === tomorrow.getMonth() &&
    due.getFullYear() === tomorrow.getFullYear()
  ) {
    const timeStr = due.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `Mañana ${timeStr}`;
  }
  // Further future: show date + time.
  return due.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function trainingLevelLabel(level: string): string {
  switch (level) {
    case "none":
      return "Ninguno";
    case "basic":
      return "Básico";
    case "intermediate":
      return "Intermedio";
    case "advanced":
      return "Avanzado";
    case "professional":
      return "Profesional";
    default:
      return level;
  }
}

// ---------------------------------------------------------------------------
// Deceased (in-memoriam) view
// ---------------------------------------------------------------------------

function deceasedSubtitle(pet: Pet): string {
  const deceasedYear = pet.deceasedAt ? new Date(pet.deceasedAt).getFullYear() : null;
  if (pet.dateOfBirth && deceasedYear) {
    const birthYear = new Date(pet.dateOfBirth).getFullYear();
    return `En memoria · ${birthYear} – ${deceasedYear}`;
  }
  if (deceasedYear) {
    const genderedWord = pet.sex === "male" ? "Fallecido" : "Fallecida";
    const fullDate = formatDate(pet.deceasedAt);
    return `En memoria · ${genderedWord} el ${fullDate}`;
  }
  return "En memoria";
}

function DeceasedView({
  pet,
  photoUrl,
  eventsWithAttachments,
}: {
  pet: Pet;
  photoUrl: string | null;
  eventsWithAttachments: Parameters<typeof EventTimeline>[0]["events"];
}) {
  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a mis mascotas
        </Link>

        {/* In-memoriam hero — centered, muted */}
        <section className="flex flex-col items-center gap-3 pt-4">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={pet.name}
              className="w-24 h-24 rounded-full object-cover opacity-80"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-3xl font-semibold text-neutral-400 dark:text-neutral-600 opacity-80">
              {pet.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-center space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {pet.name}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              {deceasedSubtitle(pet)}
            </p>
          </div>

          {/* Quiet action links */}
          <p className="text-sm text-neutral-500 dark:text-neutral-500 pt-1">
            <Link
              href={`/mis-mascotas/${pet.publicToken}/editar`}
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Editar mascota
            </Link>
            {" · "}
            <Link
              href={`/p/${pet.publicToken}`}
              target="_blank"
              rel="noopener"
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Ver credencial pública
            </Link>
            {" · "}
            <Link
              href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/nota`}
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              + Agregar nota
            </Link>
          </p>
        </section>

        {/* Libreta sanitaria — filtered subset of pet_events. The full
            event log (including identity / system entries) lives at
            /historial. */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Libreta sanitaria
          </h2>
          <EventTimeline
            events={eventsWithAttachments.filter((e) => isLibretaSanitariaEvent(e.eventType))}
            publicToken={pet.publicToken}
            chips={LIBRETA_FILTER_CHIPS}
          />
        </section>
      </div>
    </main>
  );
}

export default async function PetDetailPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;

  const access = await requirePetAccess(publicToken);
  if (!access.ok) notFound();
  const { supabase, user, pet, accessPath, organization } = access;

  // Photo: separate small query indexed on primaryPhotoId, only if set.
  const [photo] = pet.primaryPhotoId
    ? await db.select().from(attachments).where(eq(attachments.id, pet.primaryPhotoId)).limit(1)
    : [];
  const photoUrl = petPhotoUrl(photo?.storagePath);

  // "En tránsito" badge is owner-side semantics — the user is personally
  // caretaking a stray they picked up. For org-mediated access, the org's
  // relationship is surfaced via the org banner instead, so isTransit stays
  // false on that path.
  let isTransit = false;
  // Active ownership role of the caller over this pet. Used to gate
  // owner-only links like "Perro de asistencia" (Ley 26.858 is
  // owner-only). Stays null when accessPath !== "owner" — org-mediated
  // viewers aren't owners by definition.
  let ownershipRole: string | null = null;
  if (accessPath === "owner") {
    const [ownerRow] = await db
      .select({ role: ownerships.role })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, pet.id),
          eq(ownerships.ownerUserId, user.id),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    isTransit = ownerRow?.role === "shelter_custody";
    ownershipRole = ownerRow?.role ?? null;
  }

  // Event timeline, newest first. Self-scans are filtered at the DB level
  // so the JS-side timeline doesn't have to know about credential_scanned
  // payload internals.
  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))
    .orderBy(desc(petEvents.occurredAt));

  // Per-event attachments (private bucket — signed URLs generated server-side).
  const eventIds = events.map((e) => e.id);
  const eventAttachmentRows =
    eventIds.length > 0
      ? await db.select().from(attachments).where(inArray(attachments.eventId, eventIds))
      : [];
  const eventAttachmentUrls = new Map<string, string>();
  await Promise.all(
    eventAttachmentRows.map(async (a) => {
      if (!a.eventId) return;
      const url = await eventAttachmentSignedUrl(supabase, a.storagePath);
      if (url) eventAttachmentUrls.set(a.eventId, url);
    }),
  );
  const eventsWithAttachments = events.map((e) => ({
    ...e,
    attachmentUrl: eventAttachmentUrls.get(e.id) ?? null,
  }));

  // Deceased pets get the in-memoriam screen instead of the full detail page.
  if (pet.status === "deceased") {
    return (
      <DeceasedView pet={pet} photoUrl={photoUrl} eventsWithAttachments={eventsWithAttachments} />
    );
  }

  // Pending vaccine reminders, soonest first.
  const pendingVaccineReminders = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.petId, pet.id),
        eq(reminders.reminderType, "vaccine"),
        isNull(reminders.completedAt),
      ),
    )
    .orderBy(asc(reminders.dueAt));

  // Pending medication dose reminders, soonest first.
  const pendingMedicationReminders = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.petId, pet.id),
        eq(reminders.reminderType, "medication"),
        isNull(reminders.completedAt),
      ),
    )
    .orderBy(asc(reminders.dueAt));

  // Upcoming confirmed appointments for this pet, soonest first (max 10).
  const upcomingAppointments = await db
    .select({
      publicToken: appointments.publicToken,
      status: appointments.status,
      offeringDisplayName: serviceOfferings.displayName,
      slotStartsAt: timeSlots.startsAt,
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
    .where(
      and(
        eq(appointments.petId, pet.id),
        eq(appointments.status, "confirmed"),
        gt(timeSlots.startsAt, new Date()),
      ),
    )
    .orderBy(asc(timeSlots.startsAt))
    .limit(10);

  const age = ageFromDateOfBirth(pet.dateOfBirth);

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        <Link
          href={
            accessPath === "org" && organization
              ? `/org/${organization.publicToken}/mascotas`
              : "/mis-mascotas"
          }
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← {accessPath === "org" ? "Animales en custodia" : "Mis mascotas"}
        </Link>

        {accessPath === "org" && organization && (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            Estás viendo {pet.name} como miembro de <strong>{organization.displayName}</strong>.
            Cualquier evento que registres queda atribuido a la organización.
          </div>
        )}

        {isTransit && <TransitBanner petName={pet.name} />}

        {pet.rabiesObservationStatus === "in_progress" && (
          <RabiesObservationBanner pet={pet} events={eventsWithAttachments} />
        )}

        {/* Cases system (Fase E): surface open cases attached to this pet
            above the libreta so the owner can jump to /casos/[publicCode]
            from their pet profile. Renders nothing when there are no
            open cases. */}
        <PetOpenCasesSection petId={pet.id} />

        {/* Hero: photo + name + key facts */}
        <section className="flex items-start gap-5">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={pet.name}
              className="w-24 h-24 rounded-2xl object-cover shrink-0"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-3xl font-semibold text-neutral-600 dark:text-neutral-400 shrink-0">
              {pet.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 truncate">
              {pet.name}
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {speciesLabel(pet.species)} · {sexLabel(pet.sex)}
              {age && ` · ${age}`}
            </p>
            <p className="text-xs font-mono text-neutral-400 dark:text-neutral-600 tracking-wider">
              {pet.publicToken}
            </p>
          </div>
        </section>

        {/* Info grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Detail label="Estado" value={statusLabel(pet.status)} />
          <Detail
            label="Fecha de nacimiento"
            value={
              pet.dateOfBirth
                ? `${formatDate(pet.dateOfBirth)}${pet.birthDateIsEstimated ? " (aprox.)" : ""}`
                : null
            }
          />
          <Detail
            label="Raza"
            value={
              pet.breed ? `${pet.breed}${pet.potentiallyDangerousBreed ? " ⚠ PPP" : ""}` : null
            }
          />
          <Detail label="Color / marcas" value={pet.color} />
          <Detail
            label="Peso estimado"
            value={pet.estimatedWeightKg ? `${pet.estimatedWeightKg} kg` : null}
          />
          <Detail
            label="Nivel de entrenamiento"
            value={pet.trainingLevel ? trainingLevelLabel(pet.trainingLevel) : null}
          />
          <Detail label="Microchip" value={pet.microchipId} />
          <Detail
            label="Ubicación"
            value={
              [pet.jurisdictionLocality, pet.jurisdictionProvince].filter(Boolean).join(", ") ||
              null
            }
          />
          <Detail
            label="Comidas favoritas"
            value={pet.favouriteFoods?.length ? pet.favouriteFoods.join(", ") : null}
          />
          <Detail
            label="Alergias conocidas"
            value={pet.knownAllergies?.length ? pet.knownAllergies.join(", ") : null}
          />
          <Detail label="Aseguradora" value={pet.insuranceCompany} />
          <Detail label="N° de póliza" value={pet.insurancePolicyNumber} />
          {pet.distinguishingFeatures && (
            <div className="sm:col-span-2">
              <Detail label="Señas particulares" value={pet.distinguishingFeatures} />
            </div>
          )}
        </section>

        {pet.potentiallyDangerousBreed && (
          <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 space-y-2">
            <p className="text-xs text-amber-900 dark:text-amber-200">
              Esta mascota está marcada como raza potencialmente peligrosa (Ley CABA 4078, Ley
              Provincial 14.107). Recordá registrarla en el registro provincial correspondiente.
            </p>
            {(() => {
              const latestAttestation = eventsWithAttachments.find(
                (e) => e.eventType === "dangerous_breed_attested",
              );
              if (latestAttestation) {
                return (
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}/historial`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-900 dark:text-amber-200 underline underline-offset-4 hover:text-amber-950 dark:hover:text-amber-100"
                  >
                    ✓ Atestación registrada — ver historial
                  </Link>
                );
              }
              // Transit custodians can't atestar — the legal PPP registry
              // obligation belongs to the legal owner, not a caretaker.
              if (isTransit) {
                return (
                  <button
                    type="button"
                    disabled
                    title="Lo registra el dueño cuando aparezca"
                    className="inline-block px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-xs font-medium text-amber-800 dark:text-amber-300 opacity-60 cursor-not-allowed"
                  >
                    Registrar atestación de raza peligrosa
                  </button>
                );
              }
              return (
                <Link
                  href={`/mis-mascotas/${pet.publicToken}/eventos/atestar-raza-peligrosa`}
                  className="inline-block px-3 py-1.5 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-xs font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
                >
                  Registrar atestación de raza peligrosa
                </Link>
              );
            })()}
          </div>
        )}

        {/* Action buttons */}
        <section className="flex flex-wrap gap-3">
          <Link
            href={`/mis-mascotas/${pet.publicToken}/anotar`}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            ✎ Anotar algo
          </Link>
          <Link
            href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo`}
            className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            + Todos los eventos
          </Link>
          <Link
            href={`/mis-mascotas/${pet.publicToken}/editar`}
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Editar mascota
          </Link>
          <Link
            href={`/p/${pet.publicToken}`}
            target="_blank"
            rel="noopener"
            className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Ver credencial pública ↗
          </Link>
          {pet.status === "lost" ? (
            <MarkFoundButton publicToken={pet.publicToken} />
          ) : (
            pet.status === "active" && (
              <Link
                href={`/mis-mascotas/${pet.publicToken}/perdida`}
                className="px-4 py-2 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-sm font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
              >
                Marcar como perdida
              </Link>
            )
          )}
        </section>

        {/* Unified "Próximas citas y recordatorios" — mixes active appointments + vaccine reminders */}
        <UpcomingAppointmentsAndReminders
          pet={pet}
          upcomingAppointments={upcomingAppointments}
          pendingVaccineReminders={pendingVaccineReminders}
        />

        {/* Upcoming medication dose reminders */}
        <MedicationDosesSection
          pet={pet}
          reminders={pendingMedicationReminders}
          sourceEvents={eventsWithAttachments}
        />

        <section>
          <Link
            href={`/mis-mascotas/${pet.publicToken}/libreta`}
            className="block w-full text-center px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Ver libreta completa →
          </Link>
        </section>

        {/* Ley 26.858 ata la credencial al dueño legal permanente. Foster,
            shelter_custody (vecino-en-tránsito), co_owner y caretaker no
            pueden registrar la pet como de asistencia — el link se
            esconde para ellos para evitar el 404 cryptico. */}
        {pet.species === "dog" && ownershipRole === "owner" && (
          <section>
            <Link
              href={`/mis-mascotas/${pet.publicToken}/asistencia`}
              className="block w-full text-center px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              Perro de asistencia / guía (Ley 26.858) →
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Medication doses section — mirrors "Próximas vacunas" pattern.
// Groups reminders by sourceEventId so all doses of the same medication
// cluster visually.
// ---------------------------------------------------------------------------

type SourceEvent = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date | string;
  notes: string | null;
  attachmentUrl: string | null;
};

function MedicationDosesSection({
  pet,
  reminders: allReminders,
  sourceEvents,
}: {
  pet: Pet;
  reminders: Reminder[];
  sourceEvents: SourceEvent[];
}) {
  // Build a map: sourceEventId → drug name (from the medication_started payload).
  const drugNameBySourceId = new Map<string, string>();
  for (const ev of sourceEvents) {
    if (ev.eventType === "medication_started") {
      const p = (ev.payload ?? {}) as Record<string, unknown>;
      const name = typeof p.drug_name === "string" ? p.drug_name : null;
      if (name) drugNameBySourceId.set(ev.id, name);
    }
  }

  // Group reminders by sourceEventId.
  const groups = new Map<string, { drugName: string; reminders: Reminder[] }>();
  const ungroupedKey = "__ungrouped__";
  for (const reminder of allReminders) {
    const key = reminder.sourceEventId ?? ungroupedKey;
    if (!groups.has(key)) {
      const drugName = reminder.sourceEventId
        ? (drugNameBySourceId.get(reminder.sourceEventId) ?? reminder.title)
        : reminder.title;
      groups.set(key, { drugName, reminders: [] });
    }
    (groups.get(key) as { drugName: string; reminders: Reminder[] }).reminders.push(reminder);
  }

  const boundAction = markMedicationDoseTakenAction;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Próximas dosis
        </h2>
        <Link
          href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/medicacion-inicio`}
          className="text-sm text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          + Nueva medicación
        </Link>
      </div>
      {allReminders.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-500">Sin dosis pendientes.</p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([key, group]) => (
            <div key={key} className="space-y-2">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {group.drugName}
              </p>
              <ul className="space-y-2">
                {group.reminders.map((reminder) => {
                  const proximity = formatDoseProximity(reminder.dueAt);
                  const isOverdue = new Date(reminder.dueAt) < new Date();
                  return (
                    <li
                      key={reminder.id}
                      className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm text-neutral-900 dark:text-neutral-50">
                          {reminder.description ?? reminder.title}
                        </p>
                        <p
                          className={`text-xs font-medium ${
                            isOverdue
                              ? "text-red-600 dark:text-red-400"
                              : "text-neutral-500 dark:text-neutral-500"
                          }`}
                        >
                          {proximity}
                        </p>
                      </div>
                      <form action={boundAction}>
                        <input type="hidden" name="reminderId" value={reminder.id} />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shrink-0"
                        >
                          Marcar dada
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type RabiesObservationBannerProps = {
  pet: { name: string; publicToken: string };
  events: Array<{ id: string; eventType: string; occurredAt: Date | string; payload: unknown }>;
};

// Banner shown while pet.rabies_observation_status='in_progress'. Pulls the
// originating bite event (incident_reported with payload.incident_type='bite_inflicted')
// and the rabies_observation_started event to render the dates. When the 10
// days have elapsed AND there were no escalating symptoms during the period,
// shows a button that calls ownerCloseRabiesObservationAction.
function RabiesObservationBanner({ pet, events }: RabiesObservationBannerProps) {
  const startedEvent = events.find((e) => e.eventType === "rabies_observation_started");
  const startedPayload = (startedEvent?.payload ?? {}) as Record<string, unknown>;
  const observationUntilRaw = startedPayload.observation_until as string | undefined;
  const observationUntil = observationUntilRaw ? new Date(observationUntilRaw) : null;

  const biteEvent = events.find(
    (e) =>
      e.eventType === "incident_reported" &&
      (e.payload as Record<string, unknown> | null)?.incident_type === "bite_inflicted",
  );
  const biteDate = biteEvent ? new Date(biteEvent.occurredAt) : null;

  const periodClosed =
    observationUntil !== null &&
    Number.isFinite(observationUntil.getTime()) &&
    observationUntil <= new Date();

  return (
    <section className="rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <p className="font-medium text-amber-900 dark:text-amber-200">
        Observación antirrábica en curso
      </p>
      <p className="text-sm text-amber-800 dark:text-amber-300">
        {biteDate
          ? `Por la mordedura del ${biteDate.toLocaleDateString("es-AR")}, `
          : "Por una mordedura reportada recientemente, "}
        {pet.name} está en observación obligatoria de 10 días.
        {observationUntil && ` Cierre estimado: ${observationUntil.toLocaleDateString("es-AR")}.`}
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-400">
        Si {pet.name} muestra salivación excesiva, agresividad inusual, parálisis o cambios bruscos
        de comportamiento, consultá al veterinario de inmediato.
      </p>
      {periodClosed && (
        <form
          action={async () => {
            "use server";
            const { ownerCloseRabiesObservationAction } = await import("@/app/actions/bite");
            await ownerCloseRabiesObservationAction(pet.publicToken);
          }}
        >
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-amber-600 dark:bg-amber-500 text-white text-sm font-medium hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors"
          >
            Confirmar fin de observación
          </button>
        </form>
      )}
    </section>
  );
}

function TransitBanner({ petName }: { petName: string }) {
  return (
    <section className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
      <p className="text-sm text-amber-900 dark:text-amber-200">
        Estás cuidando a <strong>{petName}</strong> en tránsito. La libreta sanitaria que armes acá
        viaja con la mascota.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled
          title="Próximamente"
          className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200 opacity-60 cursor-not-allowed"
        >
          Convertir en mi mascota
        </button>
        <button
          type="button"
          disabled
          title="Próximamente"
          className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200 opacity-60 cursor-not-allowed"
        >
          Buscar nuevo hogar
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Upcoming appointments + vaccine reminders — unified section (Fase 7)
// ---------------------------------------------------------------------------
// Rows are merged by date (appointments by slot.starts_at, reminders by due_at)
// and sorted ascending so the soonest item appears first.
// ---------------------------------------------------------------------------

type UpcomingAppointmentRow = {
  publicToken: string;
  status: string;
  offeringDisplayName: string;
  slotStartsAt: Date;
};

function UpcomingAppointmentsAndReminders({
  pet,
  upcomingAppointments,
  pendingVaccineReminders,
}: {
  pet: Pet;
  upcomingAppointments: UpcomingAppointmentRow[];
  pendingVaccineReminders: Reminder[];
}) {
  type MergedRow =
    | { kind: "appointment"; date: Date; apt: UpcomingAppointmentRow }
    | { kind: "reminder"; date: Date; reminder: Reminder };

  const merged: MergedRow[] = [
    ...upcomingAppointments.map(
      (apt): MergedRow => ({ kind: "appointment", date: new Date(apt.slotStartsAt), apt }),
    ),
    ...pendingVaccineReminders.map(
      (r): MergedRow => ({ kind: "reminder", date: new Date(r.dueAt), reminder: r }),
    ),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          Próximas citas y recordatorios
        </h2>
        <Link
          href={`/mis-mascotas/${pet.publicToken}/vacunas/programar`}
          className="text-sm text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          + Programar
        </Link>
      </div>
      {merged.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-500">
          No hay citas ni recordatorios próximos para {pet.name}.
        </p>
      ) : (
        <ul className="space-y-3">
          {merged.map((row) => {
            if (row.kind === "appointment") {
              const { apt } = row;
              return (
                <li
                  key={`apt-${apt.publicToken}`}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-neutral-900 dark:text-neutral-50">
                        {apt.offeringDisplayName}
                      </p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        {row.date.toLocaleString("es-AR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                      turno
                    </span>
                  </div>
                  <Link
                    href={`/mis-turnos/${apt.publicToken}`}
                    className="inline-block text-xs text-neutral-700 dark:text-neutral-300 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50"
                  >
                    Ver detalle →
                  </Link>
                </li>
              );
            }

            // reminder row
            const { reminder } = row;
            const diffDays = Math.floor((row.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const isSoon = diffDays >= 0 && diffDays <= 30;
            const isOverdue = diffDays < 0;
            return (
              <li
                key={`rem-${reminder.id}`}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {reminder.title}
                    </p>
                    {reminder.description && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-500">
                        {reminder.description}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400">
                      recordatorio
                    </span>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300">
                      {formatDate(reminder.dueAt)}
                    </p>
                    {isOverdue && (
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                        Atrasada {Math.abs(diffDays)} día{Math.abs(diffDays) === 1 ? "" : "s"}
                      </p>
                    )}
                    {isSoon && !isOverdue && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        En {diffDays} día{diffDays === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/mis-mascotas/${pet.publicToken}/eventos/nuevo/vacuna?reminderId=${reminder.id}`}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                  >
                    Registrar aplicación
                  </Link>
                  <form
                    action={deleteVaccineReminderAction.bind(null, pet.publicToken, reminder.id)}
                  >
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                    >
                      Eliminar
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-500">
        {label}
      </dt>
      <dd className="text-neutral-900 dark:text-neutral-50">{value || "—"}</dd>
    </div>
  );
}
