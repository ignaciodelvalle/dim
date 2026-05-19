import Link from "next/link";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";

// "Mis postulaciones" — applicant-side surface (spec adoption-listing-public
// §8.4 + D17). Lists the user's own `adoption_application_submitted` events,
// derives each application's status from later events.
//
// D17 enforced strictly: at no point do we expose how many other
// applications exist for the same pet, who else applied, or any queue
// position. The applicant only sees THEIR OWN row.
//
// State derivation:
//   - approved      → there is a later _approved with application_event_id = me
//   - finalized_to_me → adoption_finalized for this pet AND adopter_user_id = me
//   - auto_rejected → later _rejected with auto_generated=true (the F5.5 cascade)
//   - rejected      → later _rejected (manual)
//   - pending       → none of the above

export const dynamic = "force-dynamic";

type ApplicationStatus = "pending" | "approved" | "finalized_to_me" | "auto_rejected" | "rejected";

type ApplicationRow = {
  applicationId: string;
  petPublicToken: string;
  petName: string;
  petCurrentStatus: string;
  orgDisplayName: string;
  orgPublicToken: string;
  submittedAt: Date;
  status: ApplicationStatus;
  decisionAt: Date | null;
  stillListed: boolean;
};

export default async function MisPostulacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const params = await searchParams;
  const justSubmittedId = params.nueva ?? null;

  // One SQL pass: gather every _submitted authored by the user along with
  // any later resolution. The OUTER joins on a per-row CASE allow us to do
  // status derivation in DB-land instead of fanning out to per-row queries.
  const rows = await db.execute<{
    application_id: string;
    pet_public_token: string;
    pet_name: string;
    pet_status: string;
    pet_listed_at: string | null;
    pet_listing_paused_at: string | null;
    pet_eligible: boolean | null;
    pet_in_dispute: boolean | null;
    pet_rabies_status: string;
    org_display_name: string;
    org_public_token: string;
    org_verified: boolean;
    org_type: string;
    submitted_at: string;
    status: ApplicationStatus;
    decision_at: string | null;
  }>(sql`
    WITH my_submissions AS (
      SELECT
        e.id,
        e.pet_id,
        e.recorded_at AS submitted_at
      FROM pet_events e
      WHERE e.event_type = 'adoption_application_submitted'
        AND e.payload->>'applicant_user_id' = ${user.id}
    ),
    decisions AS (
      SELECT
        s.id AS application_id,
        d.event_type,
        d.payload->>'auto_generated' AS auto_generated,
        d.recorded_at AS decision_at
      FROM my_submissions s
      JOIN pet_events d
        ON d.pet_id = s.pet_id
       AND d.event_type IN ('adoption_application_approved', 'adoption_application_rejected')
       AND d.payload->>'application_event_id' = s.id::text
    ),
    finalizations AS (
      SELECT
        s.id AS application_id,
        f.recorded_at AS finalized_at
      FROM my_submissions s
      JOIN pet_events f
        ON f.pet_id = s.pet_id
       AND f.event_type = 'adoption_finalized'
       AND f.payload->>'adopter_user_id' = ${user.id}
    )
    SELECT
      s.id::text AS application_id,
      p.public_token AS pet_public_token,
      p.name AS pet_name,
      p.status AS pet_status,
      p.adoption_listed_at AS pet_listed_at,
      p.adoption_listing_paused_at AS pet_listing_paused_at,
      p.adoption_eligible AS pet_eligible,
      p.in_custody_dispute AS pet_in_dispute,
      p.rabies_observation_status AS pet_rabies_status,
      o.display_name AS org_display_name,
      o.public_token AS org_public_token,
      o.verified AS org_verified,
      o.org_type AS org_type,
      s.submitted_at::text AS submitted_at,
      CASE
        WHEN f.finalized_at IS NOT NULL THEN 'finalized_to_me'
        WHEN d.event_type = 'adoption_application_approved' THEN 'approved'
        WHEN d.event_type = 'adoption_application_rejected'
          AND COALESCE(d.auto_generated, 'false') = 'true' THEN 'auto_rejected'
        WHEN d.event_type = 'adoption_application_rejected' THEN 'rejected'
        ELSE 'pending'
      END AS status,
      COALESCE(f.finalized_at, d.decision_at)::text AS decision_at
    FROM my_submissions s
    JOIN pets p ON p.id = s.pet_id
    LEFT JOIN LATERAL (
      SELECT o2.*
      FROM ownerships ow
      JOIN organizations o2 ON o2.id = ow.owner_organization_id
      WHERE ow.pet_id = s.pet_id
        AND ow.role = 'shelter_custody'
        AND ow.ended_at IS NULL
      ORDER BY ow.started_at DESC
      LIMIT 1
    ) o ON TRUE
    LEFT JOIN LATERAL (
      SELECT *
      FROM decisions
      WHERE application_id = s.id
      ORDER BY decision_at DESC
      LIMIT 1
    ) d ON TRUE
    LEFT JOIN LATERAL (
      SELECT *
      FROM finalizations
      WHERE application_id = s.id
      LIMIT 1
    ) f ON TRUE
    ORDER BY s.submitted_at DESC
    LIMIT 100
  `);

  const applications: ApplicationRow[] = rows
    .filter((r) => r.org_display_name !== null)
    .map((r) => ({
      applicationId: r.application_id,
      petPublicToken: r.pet_public_token,
      petName: r.pet_name,
      petCurrentStatus: r.pet_status,
      orgDisplayName: r.org_display_name,
      orgPublicToken: r.org_public_token,
      submittedAt: new Date(r.submitted_at),
      decisionAt: r.decision_at ? new Date(r.decision_at) : null,
      status: r.status,
      stillListed:
        r.pet_listed_at !== null &&
        r.pet_listing_paused_at === null &&
        r.pet_status !== "lost" &&
        r.pet_status !== "deceased" &&
        r.pet_eligible === true &&
        r.pet_in_dispute !== true &&
        r.pet_rabies_status !== "in_progress" &&
        r.org_verified === true &&
        (r.org_type === "shelter" || r.org_type === "rescue_network"),
    }));

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <Link
          href="/mis-mascotas"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Mis mascotas
        </Link>

        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Mis postulaciones para adoptar
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Acá ves el estado de tus postulaciones. El refugio te contacta por email cuando avanza.
          </p>
        </header>

        {justSubmittedId && (
          <output className="block rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4 text-sm text-emerald-900 dark:text-emerald-200">
            ¡Postulación enviada! El refugio la recibió y te va a contactar por mail. Mientras tanto
            podés seguir viendo otras mascotas en{" "}
            <Link href="/adoptar" className="underline">
              /adoptar
            </Link>
            .
          </output>
        )}

        {applications.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              Todavía no te postulaste para adoptar.
            </p>
            <Link
              href="/adoptar"
              className="inline-block px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              Ver mascotas en adopción
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {applications.map((app) => (
              <ApplicationCard
                key={app.applicationId}
                app={app}
                highlight={app.applicationId === justSubmittedId}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function ApplicationCard({ app, highlight }: { app: ApplicationRow; highlight: boolean }) {
  return (
    <li
      className={`rounded-lg border p-4 space-y-2 ${
        highlight
          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-700"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
          {app.petName}
        </h2>
        <StatusBadge status={app.status} />
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        Refugio: {app.orgDisplayName}
      </p>
      <p className="text-xs text-neutral-500">
        Enviada el {app.submittedAt.toLocaleDateString("es-AR")}
        {app.decisionAt && (
          <>
            {" · "}Última actualización: {app.decisionAt.toLocaleDateString("es-AR")}
          </>
        )}
      </p>
      <StatusBody status={app.status} app={app} />
    </li>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const map: Record<ApplicationStatus, { label: string; cls: string }> = {
    pending: {
      label: "En revisión",
      cls: "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300",
    },
    approved: {
      label: "Aprobada",
      cls: "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300",
    },
    finalized_to_me: {
      label: "¡Finalizada!",
      cls: "border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    },
    auto_rejected: {
      label: "Cerrada",
      cls: "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400",
    },
    rejected: {
      label: "No avanzó",
      cls: "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-400",
    },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>
  );
}

function StatusBody({ status, app }: { status: ApplicationStatus; app: ApplicationRow }) {
  if (status === "pending") {
    return (
      <p className="text-xs text-neutral-700 dark:text-neutral-300">
        El refugio está revisando tu postulación.
        {app.stillListed && (
          <>
            {" "}
            Mientras tanto podés ver la ficha de{" "}
            <Link href={`/adoptar/${app.petPublicToken}`} className="underline">
              {app.petName}
            </Link>
            .
          </>
        )}
      </p>
    );
  }
  if (status === "approved") {
    return (
      <p className="text-xs text-emerald-800 dark:text-emerald-300">
        El refugio aprobó tu postulación. Coordinan los próximos pasos por email.
      </p>
    );
  }
  if (status === "finalized_to_me") {
    return (
      <p className="text-xs text-emerald-800 dark:text-emerald-300">
        ¡Adoptaste a {app.petName}! Mirá su libreta digital en{" "}
        <Link href="/mis-mascotas" className="underline">
          Mis mascotas
        </Link>
        .
      </p>
    );
  }
  if (status === "auto_rejected") {
    return (
      <p className="text-xs text-neutral-700 dark:text-neutral-300">
        {app.petName} encontró hogar con otra postulación. Sabemos que es decepcionante. Mirá{" "}
        <Link href={`/adoptar?org=${app.orgPublicToken}`} className="underline">
          otras mascotas de {app.orgDisplayName}
        </Link>{" "}
        o{" "}
        <Link href="/adoptar" className="underline">
          el listado completo
        </Link>
        .
      </p>
    );
  }
  return (
    <p className="text-xs text-neutral-700 dark:text-neutral-300">
      El refugio no avanzó con esta postulación.{" "}
      <Link href="/adoptar" className="underline">
        Ver otras en adopción
      </Link>
      .
    </p>
  );
}
