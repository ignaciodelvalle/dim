// Preview-only redesign of the owner home — v3.
//
// v3 changes (per design critique 2026-05-20):
//   - "Mis mascotas" mini-grid removed. The EventCatcher's pet picker is
//     now the pet list — tap twice on a chip to open the profile.
//   - Pet avatars in the chip row are 72px (was 26px).
//   - Submit uses the Poncho `success` button variant.
//   - Section #2 is "Mis casos" — open workflows that need attention.
//
// Uses hardcoded sample data so the layout can be reviewed without wiring
// real queries yet. To activate live, replace:
//   - SAMPLE_PETS → fetchPetsForOwner(user.id)
//   - SAMPLE_CASES → fetchOpenWorkflows(user.id)  (already exists,
//     returns WorkflowItem[]; map onto CaseRow shape)
//
// Access: same guard as the live /inicio.

import Link from "next/link";

import { type CaseRow, CasesWidget } from "@/components/CasesWidget";
import { EventCatcher, type EventCatcherPet } from "@/components/EventCatcher";
import { requireUserOrRedirect } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function InicioV2Page() {
  await requireUserOrRedirect();

  const SAMPLE_PETS: EventCatcherPet[] = [
    {
      id: "1",
      name: "Roma",
      publicToken: "pet-roma",
      photoUrl: null,
      status: "lost",
      state: "urgent",
      stateLabel: "Perdida",
    },
    {
      id: "2",
      name: "Mishi",
      publicToken: "pet-mishi",
      photoUrl: null,
      status: "active",
      state: "attention",
      stateLabel: "Obs 4/10",
    },
    {
      id: "3",
      name: "Toto",
      publicToken: "pet-toto",
      photoUrl: null,
      status: "active",
      state: "ok",
    },
    {
      id: "4",
      name: "Luna",
      publicToken: "pet-luna",
      photoUrl: null,
      status: "active",
      state: "info",
      stateLabel: "En adopción",
    },
  ];

  const SAMPLE_CASES: CaseRow[] = [
    {
      id: "los-3f7a",
      title: "Roma está perdida",
      subtitle: "LOS-3F7A · La Plata · 18 escaneos del QR",
      ctaUrl: "/casos/LOS-3F7A",
      since: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      severity: "warning",
      icon: "🧭",
    },
    {
      id: "ado-9c12",
      title: "Postulación para adoptar a Pelusa",
      subtitle: "ADO-9C12 · Refugio Patitas · esperando entrevista",
      ctaUrl: "/casos/ADO-9C12",
      since: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      severity: "info",
      icon: "📨",
    },
    {
      id: "den-a4f1",
      title: "Denuncia DEN-A4F1",
      subtitle: "Maltrato reportado · en investigación · DPZ Buenos Aires",
      ctaUrl: "/casos/DEN-A4F1",
      since: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      severity: "danger",
      icon: "🚨",
    },
  ];

  return (
    <main className="min-h-screen bg-white p-6 dark:bg-neutral-950">
      <div className="mx-auto max-w-2xl space-y-5 pb-10 pt-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Hola, Ignacio
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            ¿Qué le pasó a alguna mascota hoy?
          </p>
        </header>

        <EventCatcher pets={SAMPLE_PETS} />

        <CasesWidget cases={SAMPLE_CASES} />

        <section
          aria-labelledby="oh-soon-h"
          className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2
              id="oh-soon-h"
              className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
            >
              Próximos turnos
            </h2>
            <Link
              href="/mis-turnos"
              className="text-xs font-medium text-gob-azul-link hover:underline"
            >
              Ver agenda →
            </Link>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <li className="flex items-center gap-3 py-2">
              <DateChip day="22" month="MAY" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  Vacuna antirrábica · Roma
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">10:30 · Dra. Pérez</p>
              </div>
            </li>
            <li className="flex items-center gap-3 py-2">
              <DateChip day="27" month="MAY" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900 dark:text-neutral-50">Control · Mishi</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  16:00 · Veterinaria Norte
                </p>
              </div>
            </li>
          </ul>
        </section>

        <p className="text-center text-xs text-neutral-400 dark:text-neutral-600">
          Notificaciones, medicaciones y workflows se mantienen accesibles desde el menú.
        </p>
      </div>
    </main>
  );
}

function DateChip({ day, month }: { day: string; month: string }) {
  return (
    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-neutral-200 text-center dark:border-neutral-700">
      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{month}</span>
      <span className="text-sm font-semibold leading-tight text-neutral-900 dark:text-neutral-50">
        {day}
      </span>
    </div>
  );
}
