// Mis postulaciones para adoptar — Libreta Nacional redesign.
// Presentation only; all data fetching and status derivation logic unchanged.

import Link from "next/link";

import { sql } from "drizzle-orm";

import { LnCallout } from "@/components/ui/DocElements";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { db } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { formatDateShort } from "@/lib/utils/format";

import { WithdrawApplicationButton } from "./WithdrawApplicationButton";

// "Mis postulaciones" — applicant-side surface (spec adoption-listing-public
// §8.4 + D17). Lists the user's own `adoption_application_submitted` events,
// derives each application's status from later events.
//
// D17 enforced strictly: at no point do we expose how many other
// applications exist for the same pet, who else applied, or any queue
// position. The applicant only sees THEIR OWN row.

export const dynamic = "force-dynamic";

type ApplicationStatus =
  | "pending"
  | "info_requested"
  | "approved"
  | "finalized_to_me"
  | "auto_rejected"
  | "rejected"
  | "withdrawn";

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

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; cls: string }> = {
  pending: {
    label: "En revisión",
    cls: "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]",
  },
  info_requested: {
    label: "Te pidieron info",
    cls: "border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]",
  },
  approved: {
    label: "Aprobada",
    cls: "border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)]",
  },
  finalized_to_me: {
    label: "¡Finalizada!",
    cls: "border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)]",
  },
  auto_rejected: {
    label: "Cerrada",
    cls: "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]",
  },
  rejected: {
    label: "No avanzó",
    cls: "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]",
  },
  withdrawn: {
    label: "Retirada",
    cls: "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]",
  },
};

export default async function MisPostulacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const params = await searchParams;
  const justSubmittedId = params.nueva ?? null;

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
        d.payload->>'outcome' AS outcome,
        d.payload->>'auto_generated' AS auto_generated,
        d.recorded_at AS decision_at
      FROM my_submissions s
      JOIN pet_events d
        ON d.pet_id = s.pet_id
       AND d.event_type = 'adoption_application_resolved'
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
    ),
    info_requests AS (
      -- Latest "more info requested" marker per application (UI-6). A
      -- note_added with kind=adoption_info_requested, emitted AFTER the
      -- application was submitted, signals the shelter probed for info.
      SELECT
        s.id AS application_id,
        MAX(n.recorded_at) AS requested_at
      FROM my_submissions s
      JOIN pet_events n
        ON n.pet_id = s.pet_id
       AND n.event_type = 'note_added'
       AND n.payload->>'kind' = 'adoption_info_requested'
       AND n.payload->>'application_event_id' = s.id::text
       AND n.recorded_at >= s.submitted_at
      GROUP BY s.id
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
        WHEN d.outcome = 'approved' THEN 'approved'
        WHEN d.outcome = 'withdrawn' THEN 'withdrawn'
        WHEN d.outcome = 'rejected'
          AND COALESCE(d.auto_generated, 'false') = 'true' THEN 'auto_rejected'
        WHEN d.outcome = 'rejected' THEN 'rejected'
        WHEN ir.requested_at IS NOT NULL THEN 'info_requested'
        ELSE 'pending'
      END AS status,
      COALESCE(f.finalized_at, d.decision_at)::text AS decision_at
    FROM my_submissions s
    JOIN pets p ON p.id = s.pet_id
      -- Art. 16 (Ley 25.326): a soft-deleted pet reads as never registered.
      -- The applicant's my_submissions row and the shelter_custody LATERAL both
      -- survive a rehome-R4 titular's erasure, so without this the erased pet's
      -- name and a live /adoptar link would still render to the third-party
      -- applicant. Same guard the org-side adopciones queue already carries.
      AND p.deleted_at IS NULL
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
    LEFT JOIN info_requests ir ON ir.application_id = s.id
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
    <div className="mx-auto max-w-3xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/mis-mascotas"
        className="mb-5 inline-block font-ln-mono text-sm uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis mascotas
      </Link>

      {/* Header */}
      <div className="mb-7">
        <h1 className="m-0 font-ln-serif text-3xl font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Mis postulaciones para adoptar
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Acá ves el estado de tus postulaciones. El refugio te contacta por email cuando avanza.
        </p>
      </div>

      {justSubmittedId && (
        <div className="mb-5">
          <LnCallout tone="azul">
            ¡Postulación enviada! El refugio la recibió y te va a contactar por mail. Mientras tanto
            podés seguir viendo otras mascotas en{" "}
            <Link
              href="/adoptar"
              className="text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              /adoptar
            </Link>
            .
          </LnCallout>
        </div>
      )}

      {applications.length === 0 ? (
        <LnEmptyState
          variant="dashed"
          title="Todavía no te postulaste para adoptar."
          description="Encontrá mascotas que buscan hogar y postulate con un click."
          action={
            <Link
              href="/adoptar"
              className="inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-4 py-2 font-ln-sans text-md font-medium text-[var(--color-ln-ok)] no-underline hover:opacity-80 transition-opacity"
            >
              Ver mascotas en adopción
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-ln-line)]">
          {applications.map((app) => {
            const config = STATUS_CONFIG[app.status];
            const isHighlight = app.applicationId === justSubmittedId;
            return (
              <div
                key={app.applicationId}
                className={`flex flex-col gap-1.5 border-b border-[var(--color-ln-line-2)] px-4 py-3.5 last:border-b-0 ${isHighlight ? "bg-[var(--color-ln-celeste-050)]" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-ln-serif text-md font-semibold text-[var(--color-ln-ink)]">
                    {app.petName}
                  </p>
                  <span
                    className={`flex-shrink-0 inline-flex items-center rounded-[var(--radius-xs)] border px-2 py-0.5 font-ln-mono text-xs font-semibold uppercase tracking-[.1em] ${config.cls}`}
                  >
                    {config.label}
                  </span>
                </div>
                <p className="font-ln-mono text-sm text-[var(--color-ln-mute)]">
                  Refugio: {app.orgDisplayName}
                </p>
                <p className="font-ln-mono text-sm text-[var(--color-ln-mute)]">
                  Enviada el {formatDateShort(app.submittedAt)}
                  {app.decisionAt && (
                    <>
                      {" · "}Última actualización: {formatDateShort(app.decisionAt)}
                    </>
                  )}
                </p>
                <StatusBody status={app.status} app={app} />
                {(app.status === "pending" || app.status === "info_requested") && (
                  <div className="mt-1">
                    <WithdrawApplicationButton applicationEventId={app.applicationId} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBody({ status, app }: { status: ApplicationStatus; app: ApplicationRow }) {
  if (status === "pending") {
    return (
      <p className="text-md text-[var(--color-ln-mute)]">
        El refugio está revisando tu postulación.
        {app.stillListed && (
          <>
            {" "}
            Mientras tanto podés ver la ficha de{" "}
            <Link
              href={`/adoptar/${app.petPublicToken}`}
              className="text-[var(--color-ln-azul)] no-underline hover:underline"
            >
              {app.petName}
            </Link>
            .
          </>
        )}
      </p>
    );
  }
  if (status === "info_requested") {
    return (
      <p className="text-md text-[var(--color-ln-azul)]">
        {app.orgDisplayName} te pidió más información sobre tu postulación. Revisá tus
        notificaciones y respondé por email para que puedan avanzar.
      </p>
    );
  }
  if (status === "withdrawn") {
    return (
      <p className="text-md text-[var(--color-ln-mute)]">
        Retiraste esta postulación.{" "}
        <Link href="/adoptar" className="text-[var(--color-ln-azul)] no-underline hover:underline">
          Ver otras en adopción
        </Link>
        .
      </p>
    );
  }
  if (status === "approved") {
    return (
      <p className="text-md text-[var(--color-ln-ok)]">
        El refugio aprobó tu postulación. Coordinan los próximos pasos por email.
      </p>
    );
  }
  if (status === "finalized_to_me") {
    return (
      <p className="text-md text-[var(--color-ln-ok)]">
        ¡Adoptaste a {app.petName}! Mirá su libreta digital en{" "}
        <Link
          href="/mis-mascotas"
          className="text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          Mis mascotas
        </Link>
        .
      </p>
    );
  }
  if (status === "auto_rejected") {
    return (
      <p className="text-md text-[var(--color-ln-mute)]">
        {app.petName} encontró hogar con otra postulación. Mirá{" "}
        <Link
          href={`/adoptar?org=${app.orgPublicToken}`}
          className="text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          otras mascotas de {app.orgDisplayName}
        </Link>{" "}
        o{" "}
        <Link href="/adoptar" className="text-[var(--color-ln-azul)] no-underline hover:underline">
          el listado completo
        </Link>
        .
      </p>
    );
  }
  return (
    <p className="text-md text-[var(--color-ln-mute)]">
      El refugio no avanzó con esta postulación.{" "}
      <Link href="/adoptar" className="text-[var(--color-ln-azul)] no-underline hover:underline">
        Ver otras en adopción
      </Link>
      .
    </p>
  );
}
