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
import type { EventType } from "@/db/schema";
import { canReadCase } from "@/lib/case-access";
import { getNormativesForCase } from "@/lib/case-normatives";
import { type CaseDetail, getCaseDetailByPublicCode } from "@/lib/case-queries";
import { eventPayloadSummary } from "@/lib/events";
import { eventTypeLabel, formatDate, formatDateTime, sexLabel, speciesLabel } from "@/lib/format";
import { petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { caseKindLabel } from "@/src/modules/cases/domain/case-kinds";
import { and, eq, isNull } from "drizzle-orm";

// Reads auth cookies (viewer-dependent PII gating) — never statically cache.
export const dynamic = "force-dynamic";

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
      <nav className="mb-3 font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-mute)]">
        <Link href="/" className="hover:text-[var(--color-ln-ink-2)] hover:underline">
          Inicio
        </Link>
        <span className="mx-2">›</span>
        <span>Casos</span>
        <span className="mx-2">›</span>
        <span className="text-[var(--color-ln-ink-2)]">{detail.publicCode}</span>
      </nav>

      {/* "Por qué es público" banner — only for anonymous viewers on public-kind cases.
          Explains the transparency policy without revealing any PII. */}
      {isPublic && <PublicTransparencyBanner caseKind={detail.caseKind} />}

      {/* Header */}
      <header className="mb-6">
        <CaseBadge
          publicCode={detail.publicCode}
          caseKind={detail.caseKind}
          status={detail.status}
        />
        <h1 className="mt-3 font-[var(--font-ln-serif)] text-[28px] font-semibold tracking-[-0.02em] text-[var(--color-ln-ink)]">
          {caseKindLabel(detail.caseKind)}
        </h1>
        <p className="mt-1 font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
          Abierto el {formatDateTime(detail.openedAt)}
          {detail.closedAt ? ` · Cerrado el ${formatDateTime(detail.closedAt)}` : ""}
        </p>
      </header>

      {/* Pet card OR subject descriptor */}
      {detail.pet ? (
        <section className="mb-6 flex items-center gap-4 rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-5">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={detail.pet.name}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-[var(--color-ln-line-strong)]"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--color-ln-stripe)] text-3xl">
              🐾
            </div>
          )}
          <div className="flex-1">
            <h2 className="font-[var(--font-ln-serif)] text-[20px] font-semibold text-[var(--color-ln-ink)]">
              {detail.pet.name}
            </h2>
            <p className="text-[13px] text-[var(--color-ln-mute)]">
              {speciesLabel(detail.pet.species)} · {sexLabel(detail.pet.sex)}
            </p>
          </div>
          {petLink ? (
            <Link
              href={petLink}
              className="inline-flex items-center rounded-[3px] bg-[var(--color-ln-azul)] px-4 py-2 text-[12.5px] font-semibold text-white no-underline transition-colors hover:bg-[var(--color-ln-azul-700)]"
            >
              Ver mascota →
            </Link>
          ) : null}
        </section>
      ) : (
        <section className="mb-6 rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-5">
          <p className="text-[13px] text-[var(--color-ln-mute)]">
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
        <div className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4">
          <h3 className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--color-ln-mute)]">
            Partes
          </h3>
          <ul className="mt-2 space-y-1 text-[13px]">
            {/* Personal names redacted for the anonymous public view. Public
                organizations stay visible — they're identifiable entities
                already linked from /refugios/. */}
            {!isPublic && detail.openedByUser ? (
              <li className="text-[var(--color-ln-ink)]">
                <span className="text-[var(--color-ln-mute)]">Abrió: </span>
                {detail.openedByUser.displayName}
              </li>
            ) : null}
            {detail.openedByOrganization ? (
              <li className="text-[var(--color-ln-ink)]">
                <span className="text-[var(--color-ln-mute)]">Organización: </span>
                <Link
                  href={`/refugios/${detail.openedByOrganization.publicToken}`}
                  className="text-[var(--color-ln-azul)] no-underline hover:underline"
                >
                  {detail.openedByOrganization.displayName}
                </Link>
              </li>
            ) : null}
            {!isPublic && detail.closedByUser ? (
              <li className="text-[var(--color-ln-ink)]">
                <span className="text-[var(--color-ln-mute)]">Cerró: </span>
                {detail.closedByUser.displayName}
              </li>
            ) : null}
            {isPublic && !detail.openedByOrganization ? (
              <li className="text-[var(--color-ln-mute)]">Datos de partes no disponibles</li>
            ) : null}
            {!isPublic && !detail.openedByUser && !detail.openedByOrganization ? (
              <li className="text-[var(--color-ln-mute)]">Apertura automática del sistema</li>
            ) : null}
          </ul>
        </div>
        <div className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4">
          <h3 className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--color-ln-mute)]">
            Jurisdicción
          </h3>
          <p className="mt-2 text-[13px] text-[var(--color-ln-ink)]">
            {detail.jurisdictionLocality && detail.jurisdictionProvince
              ? `${detail.jurisdictionLocality}, ${detail.jurisdictionProvince}`
              : (detail.jurisdictionProvince ?? "Sin especificar")}
          </p>
        </div>
        <div className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4">
          <h3 className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--color-ln-mute)]">
            Normativa aplicable
          </h3>
          {normatives.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--color-ln-mute)]">
              Sin norma específica catalogada
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-[13px]">
              {normatives.map((law) => (
                <li key={law.id} className="text-[var(--color-ln-ink)]">
                  <span className="font-medium">{law.label}</span>
                  <span className="block text-[11px] text-[var(--color-ln-mute)]">{law.scope}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Opened reason — hidden for anon: free-text may contain PII
          (denouncer descriptions, victim names, internal context). */}
      {!isPublic && detail.openedReason ? (
        <section className="mb-6 rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] p-4">
          <h3 className="font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--color-ln-mute)]">
            Motivo de apertura
          </h3>
          <p className="mt-2 text-[13px] text-[var(--color-ln-ink)]">{detail.openedReason}</p>
        </section>
      ) : null}

      {/* Timeline */}
      <section>
        <h3 className="mb-3 font-[var(--font-ln-serif)] text-[21px] font-semibold tracking-[-0.01em] text-[var(--color-ln-ink)]">
          Línea de tiempo
        </h3>
        {detail.events.length === 0 ? (
          <p className="text-[13px] text-[var(--color-ln-mute)]">
            Todavía no hay eventos registrados en este caso.
          </p>
        ) : (
          <ol className="space-y-3">
            {detail.events.map((e) => (
              <li
                key={e.id}
                className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-4"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[13.5px] font-medium text-[var(--color-ln-ink)]">
                    {eventTypeLabel(e.eventType as EventType)}
                  </span>
                  <time className="font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                    {formatDateTime(e.occurredAt)}
                  </time>
                </div>
                {(() => {
                  const summary = eventPayloadSummary(e.eventType, e.payload);
                  const text = [summary.primary, summary.secondary].filter(Boolean).join(" · ");
                  return text ? (
                    <p className="mt-1 text-[12.5px] text-[var(--color-ln-mute)]">{text}</p>
                  ) : null;
                })()}
                {/* Internal notes hidden for anon: they're free-form and
                    routinely contain PII (denouncer descriptions, internal
                    org coordination, addresses). */}
                {!isPublic && e.notes ? (
                  <p className="mt-2 rounded-[3px] bg-[var(--color-ln-stripe)] p-2 font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
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

// ---------------------------------------------------------------------------
// PublicTransparencyBanner — explains why this case is publicly accessible.
// Shown only to anonymous viewers (isPublic === true). Copy follows the warm
// MiMAR tone; no PII is present in any branch.
// ---------------------------------------------------------------------------

function PublicTransparencyBanner({ caseKind }: { caseKind: string }) {
  const reasons: Record<string, string> = {
    bite_incident:
      "Los incidentes de mordedura son registros de interés sanitario público conforme a la legislación vigente. El seguimiento es visible para la comunidad para promover la seguridad.",
    lost_pet_episode:
      "Las alertas de mascotas perdidas son públicas para que cualquier persona que la encuentre pueda ayudar a devolverla a su familia.",
    adoption_listing:
      "Los procesos de adopción de refugios verificados son transparentes para facilitar el encuentro entre mascotas y familias.",
    welfare_denuncia:
      "Las denuncias de bienestar animal son públicas para que la comunidad pueda hacer seguimiento del proceso y la respuesta institucional.",
  };

  const reason = reasons[caseKind];
  if (!reason) return null;

  return (
    <div
      role="note"
      className="mb-6 rounded-[4px] border px-[16px] py-[12px]"
      style={{
        background: "var(--color-ln-celeste-050)",
        borderColor: "var(--color-ln-celeste-100)",
        borderLeft: "3px solid var(--color-ln-azul)",
      }}
    >
      <p
        className="font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em]"
        style={{ color: "var(--color-ln-azul)", marginBottom: 4 }}
      >
        ¿Por qué es público?
      </p>
      <p className="text-[13px] leading-[1.5]" style={{ color: "var(--color-ln-ink-2)" }}>
        {reason}
      </p>
    </div>
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
