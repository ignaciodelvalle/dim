// Adoption-applications review surface — index. Lists every PENDING
// application across all pets in shelter_custody of the active org,
// grouped by pet, newest application first.
//
// Gated on `adoption.review`. The detail page at /{appEventId} is where
// the actual approve/reject buttons live; this index just collects them.
//
// "Pending" means: there's an adoption_application_submitted event with
// no posterior _approved / _rejected, AND the pet has no
// adoption_finalized event (the F5.5 cascade should already close
// orphans when finalize fires, but we defend anyway).

import { sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

type PendingRow = {
  application_id: string;
  pet_id: string;
  pet_name: string;
  pet_public_token: string;
  applicant_user_id: string;
  applicant_name: string | null;
  housing_type: string;
  submitted_at: string;
};

export default async function AdoptionReviewIndexPage({
  params,
}: {
  params: Promise<{ orgToken: string }>;
}) {
  const { orgToken } = await params;
  const { organization: orgFromToken } = await requireOrgAccessByToken(orgToken);
  const auth = await requireCapability("adoption.review", orgFromToken.id);
  if (auth.error !== null) {
    return (
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-8 space-y-4">
          <h1 className="text-2xl font-semibold">Sin acceso</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{auth.error}</p>
          <Link href={`/org/${orgToken}`} className="text-sm text-neutral-600 underline">
            ← Volver al panel
          </Link>
        </div>
      </main>
    );
  }
  const { organization } = auth;

  const rows = await db.execute<PendingRow>(sql`
    SELECT
      s.id::text AS application_id,
      p.id::text AS pet_id,
      p.name AS pet_name,
      p.public_token AS pet_public_token,
      s.payload->>'applicant_user_id' AS applicant_user_id,
      pr.display_name AS applicant_name,
      s.payload->>'housing_type' AS housing_type,
      s.recorded_at::text AS submitted_at
    FROM pet_events s
    JOIN pets p ON p.id = s.pet_id
    JOIN ownerships o ON o.pet_id = p.id
      AND o.role = 'shelter_custody'
      AND o.ended_at IS NULL
      AND o.owner_organization_id = ${organization.id}
    LEFT JOIN profiles pr ON pr.id = (s.payload->>'applicant_user_id')::uuid
    WHERE s.event_type = 'adoption_application_submitted'
      AND NOT EXISTS (
        SELECT 1 FROM pet_events d
        WHERE d.pet_id = s.pet_id
          AND d.event_type = 'adoption_application_resolved'
          AND d.payload->>'application_event_id' = s.id::text
      )
      AND NOT EXISTS (
        SELECT 1 FROM pet_events f
        WHERE f.pet_id = s.pet_id AND f.event_type = 'adoption_finalized'
      )
    ORDER BY s.recorded_at DESC
    LIMIT 200
  `);

  // Group by pet, preserving newest-first order across groups.
  const groups = new Map<
    string,
    {
      petId: string;
      petName: string;
      petPublicToken: string;
      apps: PendingRow[];
    }
  >();
  for (const r of rows) {
    const g = groups.get(r.pet_id) ?? {
      petId: r.pet_id,
      petName: r.pet_name,
      petPublicToken: r.pet_public_token,
      apps: [],
    };
    g.apps.push(r);
    groups.set(r.pet_id, g);
  }

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-2">
          <Link
            href={`/org/${orgToken}`}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
          >
            ← Panel de {organization.displayName}
          </Link>
          <h1 className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
            Postulaciones pendientes
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Personas que se postularon para adoptar mascotas en custodia. Entrá a cada postulación
            para aprobarla o no avanzar con ella.
          </p>
        </header>

        {groups.size === 0 ? (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              No tenés postulaciones pendientes.
            </p>
            <p className="text-xs text-neutral-500">
              Cuando alguien se postule a una mascota publicada en /adoptar, aparece acá.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(groups.values()).map((group) => (
              <section key={group.petId} className="space-y-2">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  {group.petName}{" "}
                  <span className="text-sm font-normal text-neutral-500">
                    ({group.apps.length} pendiente
                    {group.apps.length === 1 ? "" : "s"})
                  </span>
                </h2>
                <ul className="space-y-2">
                  {group.apps.map((app) => (
                    <li
                      key={app.application_id}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:shadow-sm"
                    >
                      <Link
                        href={`/org/${orgToken}/adopciones/${app.application_id}`}
                        className="block space-y-1"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                            {app.applicant_name ?? "Postulante"}
                          </p>
                          <span className="text-xs text-neutral-500">
                            {new Date(app.submitted_at).toLocaleDateString("es-AR")}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          Vivienda: {housingTypeLabel(app.housing_type)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function housingTypeLabel(value: string): string {
  switch (value) {
    case "casa_con_patio":
      return "Casa con patio";
    case "casa_sin_patio":
      return "Casa sin patio";
    case "departamento":
      return "Departamento";
    default:
      return "Otra";
  }
}
