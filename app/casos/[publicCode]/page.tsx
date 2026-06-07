// Unified case-detail page. Reachable from /casos/CAS-XXXX-XXXX.
//
// The page is role-aware:
//   - admin / govt-in-scope / subject-owner / per-kind party (foster,
//     org member, applicant, dispute party) → full view with PII
//   - anonymous (no session) → redacted public view, only for the case
//     kinds in PUBLIC_ANONYMOUS_KINDS (bite_incident, lost_pet_episode,
//     adoption_listing, welfare_denuncia). Other kinds 404 to avoid
//     leaking existence.
//
// Access is gated via canReadCase. Outside parties get notFound() (not
// 403) so case existence is never leaked.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CaseBadge } from "@/components/CaseBadge";
import { db, govtAssignments, profiles } from "@/db";
import { canReadCase } from "@/lib/case-access";
import { getNormativesForCase } from "@/lib/case-normatives";
import { type CaseDetail, getCaseDetailByPublicCode } from "@/lib/case-queries";
import { eventPayloadSummary } from "@/lib/events";
import { eventTypeLabel, formatDate, formatDateTime, sexLabel, speciesLabel } from "@/lib/format";
import { petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { caseKindLabel } from "@/src/modules/cases/domain/case-kinds";
import { and, eq, isNull } from "drizzle-orm";

interface PageProps {
  params: Promise<{ publicCode: string }>;
}

export default async function CaseDetailPage({ params }: PageProps) {
  const { publicCode } = await params;
  const detail = await getCaseDetailByPublicCode(publicCode);
  if (!detail) notFound();

  // Resolve session (optional — anonymous viewers reach the public branch).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let viewerRole: "owner" | "vet" | "govt" | "admin" | null = null;
  let viewerUserId: string | null = null;
  let jurisdictions: Array<{ province: string; locality: string }> = [];

  if (user) {
    const [profile] = await db
      .select({ id: profiles.id, role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    if (profile) {
      viewerRole = profile.role;
      viewerUserId = profile.id;
      if (profile.role === "govt") {
        jurisdictions = await db
          .select({
            province: govtAssignments.jurisdictionProvince,
            locality: govtAssignments.jurisdictionLocality,
          })
          .from(govtAssignments)
          .where(and(eq(govtAssignments.userId, profile.id), isNull(govtAssignments.revokedAt)));
      }
    }
  }

  const allowed = await canReadCase(
    detail,
    viewerUserId && viewerRole ? { userId: viewerUserId, role: viewerRole, jurisdictions } : null,
  );
  if (!allowed) notFound();

  // Anonymous viewers see a redacted view: no opener/closer names, no
  // event notes, generic "Ver perfil público" pet link instead of the
  // authed `/mis-mascotas` deep link.
  const isPublic = viewerUserId === null;

  const petLink = isPublic
    ? detail.pet
      ? `/p/${detail.pet.publicToken}`
      : null
    : computePetLink(detail, viewerRole ?? "owner");
  const photoUrl = detail.pet?.primaryPhotoStoragePath
    ? petPhotoUrl(detail.pet.primaryPhotoStoragePath)
    : null;
  const normatives = getNormativesForCase(detail.caseKind, {
    country: detail.jurisdictionCountry,
    province: detail.jurisdictionProvince ?? undefined,
    locality: detail.jurisdictionLocality ?? undefined,
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-3 text-sm text-gob-text-muted ">
        <Link href="/" className="hover:underline">
          Inicio
        </Link>
        <span className="mx-2">›</span>
        <span>Casos</span>
        <span className="mx-2">›</span>
        <span className="font-mono">{detail.publicCode}</span>
      </nav>

      {/* Header */}
      <header className="mb-6">
        <CaseBadge
          publicCode={detail.publicCode}
          caseKind={detail.caseKind}
          status={detail.status}
        />
        <h1 className="mt-3 text-2xl font-bold text-gob-text ">{caseKindLabel(detail.caseKind)}</h1>
        <p className="mt-1 text-sm text-gob-text-muted ">
          Abierto el {formatDateTime(detail.openedAt)}
          {detail.closedAt ? ` · Cerrado el ${formatDateTime(detail.closedAt)}` : ""}
        </p>
      </header>

      {/* Pet card OR subject descriptor */}
      {detail.pet ? (
        <section className="mb-6 flex items-center gap-4 rounded-2xl border border-gob-border bg-white p-5  ">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={detail.pet.name}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-gob-surface-alt "
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gob-surface-alt text-3xl ">
              🐾
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gob-text ">{detail.pet.name}</h2>
            <p className="text-sm text-gob-text-muted ">
              {speciesLabel(detail.pet.species)} · {sexLabel(detail.pet.sex)}
            </p>
          </div>
          {petLink ? (
            <Link
              href={petLink}
              className="inline-flex items-center rounded-full bg-gob-text px-4 py-2 text-sm font-medium text-white transition hover:bg-gob-text   "
            >
              Ver mascota →
            </Link>
          ) : null}
        </section>
      ) : (
        <section className="mb-6 rounded-2xl border border-gob-border bg-white p-5  ">
          <p className="text-sm text-gob-text-muted ">
            Sujeto:{" "}
            {detail.primarySubjectKind === "unowned_animal"
              ? "Animal sin identificar"
              : detail.primarySubjectKind === "location"
                ? `Ubicación específica${
                    detail.jurisdictionLocality
                      ? ` (${detail.jurisdictionLocality}, ${detail.jurisdictionProvince})`
                      : ""
                  }`
                : "Caso general (sin sujeto identificado)"}
          </p>
        </section>
      )}

      {/* Actors + Normatives + Jurisdiction */}
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gob-border bg-white p-4  ">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gob-text-muted ">
            Partes
          </h3>
          <ul className="mt-2 space-y-1 text-sm">
            {/* Personal names redacted for the anonymous public view. Public
                organizations stay visible — they're identifiable entities
                already linked from /refugios/. */}
            {!isPublic && detail.openedByUser ? (
              <li className="text-gob-text ">
                <span className="text-gob-text-muted ">Abrió: </span>
                {detail.openedByUser.displayName}
              </li>
            ) : null}
            {detail.openedByOrganization ? (
              <li className="text-gob-text ">
                <span className="text-gob-text-muted ">Organización: </span>
                <Link
                  href={`/refugios/${detail.openedByOrganization.publicToken}`}
                  className="hover:underline"
                >
                  {detail.openedByOrganization.displayName}
                </Link>
              </li>
            ) : null}
            {!isPublic && detail.closedByUser ? (
              <li className="text-gob-text ">
                <span className="text-gob-text-muted ">Cerró: </span>
                {detail.closedByUser.displayName}
              </li>
            ) : null}
            {isPublic && !detail.openedByOrganization ? (
              <li className="text-gob-text-muted ">Datos de partes no disponibles</li>
            ) : null}
            {!isPublic && !detail.openedByUser && !detail.openedByOrganization ? (
              <li className="text-gob-text-muted ">Apertura automática del sistema</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-2xl border border-gob-border bg-white p-4  ">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gob-text-muted ">
            Jurisdicción
          </h3>
          <p className="mt-2 text-sm text-gob-text ">
            {detail.jurisdictionLocality && detail.jurisdictionProvince
              ? `${detail.jurisdictionLocality}, ${detail.jurisdictionProvince}`
              : (detail.jurisdictionProvince ?? "Sin especificar")}
          </p>
        </div>
        <div className="rounded-2xl border border-gob-border bg-white p-4  ">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gob-text-muted ">
            Normativa aplicable
          </h3>
          {normatives.length === 0 ? (
            <p className="mt-2 text-sm text-gob-text-muted ">Sin norma específica catalogada</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {normatives.map((law) => (
                <li key={law.id} className="text-gob-text ">
                  <span className="font-medium">{law.label}</span>
                  <span className="block text-xs text-gob-text-muted ">{law.scope}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Opened reason — hidden for anon: free-text may contain PII
          (denouncer descriptions, victim names, internal context). */}
      {!isPublic && detail.openedReason ? (
        <section className="mb-6 rounded-2xl border border-gob-border bg-gob-surface-alt p-4  ">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gob-text-muted ">
            Motivo de apertura
          </h3>
          <p className="mt-2 text-sm text-gob-text ">{detail.openedReason}</p>
        </section>
      ) : null}

      {/* Timeline */}
      <section>
        <h3 className="mb-3 text-lg font-semibold text-gob-text ">Línea de tiempo</h3>
        {detail.events.length === 0 ? (
          <p className="text-sm text-gob-text-muted ">
            Todavía no hay eventos registrados en este caso.
          </p>
        ) : (
          <ol className="space-y-3">
            {detail.events.map((e) => (
              <li key={e.id} className="rounded-2xl border border-gob-border bg-white p-4  ">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-gob-text ">{eventTypeLabel(e.eventType)}</span>
                  <time className="text-xs text-gob-text-muted ">
                    {formatDateTime(e.occurredAt)}
                  </time>
                </div>
                {(() => {
                  const summary = eventPayloadSummary(e.eventType, e.payload);
                  const text = [summary.primary, summary.secondary].filter(Boolean).join(" · ");
                  return text ? <p className="mt-1 text-sm text-gob-text-muted ">{text}</p> : null;
                })()}
                {/* Internal notes hidden for anon: they're free-form and
                    routinely contain PII (denouncer descriptions, internal
                    org coordination, addresses). */}
                {!isPublic && e.notes ? (
                  <p className="mt-2 rounded bg-gob-surface-alt p-2 text-xs text-gob-text-muted  ">
                    {e.notes}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function computePetLink(detail: CaseDetail, role: string): string | null {
  if (!detail.pet) return null;
  if (role === "admin" || role === "govt") {
    // Both admin and govt land on the owner-facing detail for now —
    // there's no admin-side pet page yet.
    return `/mis-mascotas/${detail.pet.publicToken}`;
  }
  // Owner: standard pet profile.
  return `/mis-mascotas/${detail.pet.publicToken}`;
}

// Suppress unused-import warning for redirect when noUnusedLocals is loose.
void redirect;
