// Shared, role-aware case-detail view. Rendered by BOTH the public route
// (app/(public)/casos/[publicCode]) and the govt operator route
// (app/gob/casos/[publicCode]) so a government operator opening a case from
// /gob/casos KEEPS the operator shell instead of being dropped into the
// citizen chrome. The two routes differ only in the surrounding layout —
// the content, the auth resolution and the canReadCase gate live here.
//
// The view is role-aware:
//   - admin / govt-in-scope / subject-owner / per-kind party (foster,
//     org member, applicant, dispute party) → full view with PII
//   - anonymous (no session) → redacted public view, only for the case
//     kinds in PUBLIC_ANONYMOUS_KINDS (bite_incident, lost_pet_episode,
//     adoption_listing, welfare_denuncia). Other kinds 404 to avoid
//     leaking existence.
//
// Access is gated via canReadCase. Outside parties get notFound() (not
// 403) so case existence is never leaked. Mounting this under the /gob
// layout does NOT widen access — canReadCase still enforces the govt
// reader's (province, locality) scope.

import Link from "next/link";
import { notFound } from "next/navigation";

import { casePetLink } from "@/components/casos/case-pet-link";
import { shouldRedactPetName } from "@/components/casos/pet-name-redaction";
import { StaticFirstMap } from "@/components/maps/StaticFirstMap";
import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  CaseDetailShell,
  type CaseParty,
  type CaseSubjectDescriptor,
} from "@/components/ui/dashboard/CaseDetailShell";
import type { EventType } from "@/db/schema";
import { getNormativesForCase } from "@/lib/domain/case-normatives";
import { eventPayloadSummary } from "@/lib/events/events";
import { canReadCase } from "@/lib/infra/case-access";
import { getCaseDetailByPublicCode } from "@/lib/infra/case-queries";
import { getJurisdictionsCached, getProfileCached } from "@/lib/infra/request-cache";
import { petPhotoUrl } from "@/lib/infra/storage";
import { createClient } from "@/lib/supabase/server";
import { eventTypeLabel, formatDateTime, sexLabel, speciesLabel } from "@/lib/utils/format";

interface CaseDetailViewProps {
  publicCode: string;
  /**
   * When set (operator context, e.g. "/gob/casos"), the "Casos" breadcrumb
   * links back to the operator case list and the citizen "Inicio → /" link is
   * omitted — an operator must never be handed a one-click path back into the
   * citizen shell. Defaults to the public breadcrumb.
   */
  casosHref?: string;
}

export async function CaseDetailView({ publicCode, casosHref }: CaseDetailViewProps) {
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
    const profile = await getProfileCached(user.id);
    if (profile) {
      viewerRole = profile.role;
      viewerUserId = profile.id;
      if (profile.role === "govt") {
        jurisdictions = await getJurisdictionsCached(profile.id);
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
    : casePetLink(detail.pet?.publicToken, viewerRole ?? "owner");

  const photoUrl = detail.pet?.primaryPhotoStoragePath
    ? petPhotoUrl(detail.pet.primaryPhotoStoragePath)
    : null;

  const normatives = getNormativesForCase(detail.caseKind, {
    country: detail.jurisdictionCountry,
    province: detail.jurisdictionProvince ?? undefined,
    locality: detail.jurisdictionLocality ?? undefined,
  });

  // Build parties list for CaseDetailShell.
  const parties: CaseParty[] = [];
  if (detail.openedByUser) {
    parties.push({ role: "opener", name: detail.openedByUser.displayName });
  }
  if (detail.openedByOrganization) {
    parties.push({
      role: "organization",
      name: detail.openedByOrganization.displayName,
      orgPublicToken: detail.openedByOrganization.publicToken,
    });
  }
  if (detail.closedByUser) {
    parties.push({ role: "closer", name: detail.closedByUser.displayName });
  }

  // BITE-NAME-HIDE (PO decision): on the ANONYMOUS public view of a cruelty/bite
  // case (Ley 14.346) the pet's proper NAME is redacted — species/sex/photo/
  // timeline/org stay. Lost-pet and adoption cases are unaffected (there the name
  // helps recovery/matching). An authed in-scope viewer always sees the name.
  const redactPetName = shouldRedactPetName(detail.caseKind, isPublic);

  // Build subject descriptor for CaseDetailShell.
  let subject: CaseSubjectDescriptor | null = null;
  if (detail.pet) {
    subject = {
      kind: "pet",
      petName: redactPetName ? null : detail.pet.name,
      petSpecies: `${speciesLabel(detail.pet.species)} · ${sexLabel(detail.pet.sex)}`,
      // When the name is redacted, also drop the deep link to the pet's public
      // credential page (which shows the name) so the redaction isn't one click away.
      petHref: redactPetName ? null : petLink,
      petPhotoUrl: photoUrl,
    };
  } else {
    subject = {
      kind:
        detail.primarySubjectKind === "unowned_animal"
          ? "unowned_animal"
          : detail.primarySubjectKind === "location"
            ? "location"
            : "general",
      locationLabel:
        detail.primarySubjectKind === "location"
          ? detail.jurisdictionLocality
            ? `${detail.jurisdictionLocality}, ${detail.jurisdictionProvince}`
            : undefined
          : undefined,
    };
  }

  // map-QOL P3: read-only static-first map for the case's primary location.
  // The coordinates were ALREADY in CaseDetail (no new query) but never
  // rendered. Privacy gate: institutional viewers only (govt/admin) — a
  // case's primary location can be a denounced address, so it is never
  // surfaced to anonymous, owner or vet viewers (data minimisation).
  const caseLat = detail.primaryLocationLat !== null ? Number(detail.primaryLocationLat) : null;
  const caseLng = detail.primaryLocationLng !== null ? Number(detail.primaryLocationLng) : null;
  const showCaseMap =
    (viewerRole === "govt" || viewerRole === "admin") &&
    caseLat !== null &&
    caseLng !== null &&
    Number.isFinite(caseLat) &&
    Number.isFinite(caseLng);

  // Breadcrumb nav — operator context (casosHref set) links "Casos" back to
  // the operator queue and omits the citizen "Inicio" link entirely.
  const breadcrumb = (
    <nav className="font-ln-mono text-[11px] uppercase tracking-[.06em] text-ln-mute">
      {casosHref ? (
        <Link href={casosHref} className="hover:text-ln-ink-2 hover:underline">
          Casos
        </Link>
      ) : (
        <>
          <Link href="/" className="hover:text-ln-ink-2 hover:underline">
            Inicio
          </Link>
          <span className="mx-2">›</span>
          <span>Casos</span>
        </>
      )}
      <span className="mx-2">›</span>
      <span className="text-ln-ink-2">{detail.publicCode}</span>
    </nav>
  );

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* "Por qué es público" banner — only for anonymous viewers. */}
      {isPublic && <PublicTransparencyBanner caseKind={detail.caseKind} />}

      <CaseDetailShell
        publicCode={detail.publicCode}
        kind={detail.caseKind}
        status={detail.status}
        openedAt={detail.openedAt}
        closedAt={detail.closedAt}
        openedReason={detail.openedReason}
        openedReasonCode={detail.openedReasonCode}
        openedReasonParams={detail.openedReasonParams}
        jurisdictionCountry={detail.jurisdictionCountry}
        jurisdictionProvince={detail.jurisdictionProvince}
        jurisdictionLocality={detail.jurisdictionLocality}
        normatives={normatives}
        parties={parties}
        subject={subject}
        isPublic={isPublic}
        breadcrumb={breadcrumb}
      >
        {/* map-QOL P3: primary-location embed (institutional viewers only). */}
        {showCaseMap && (
          <section aria-label="Ubicación del caso">
            <h2 className="mb-3 font-ln-serif text-[var(--text-xl)] font-semibold tracking-[-0.01em] text-ln-ink">
              Ubicación
            </h2>
            <StaticFirstMap
              lat={caseLat as number}
              lng={caseLng as number}
              label={`Caso ${detail.publicCode}`}
              precision="exact"
              heightClassName="h-48"
            />
          </section>
        )}

        {/* Timeline */}
        <section>
          <h2 className="mb-3 font-ln-serif text-[21px] font-semibold tracking-[-0.01em] text-ln-ink">
            Línea de tiempo
          </h2>
          {detail.events.length === 0 ? (
            <LnEmptyState icon="nota" title="Todavía no hay eventos registrados en este caso." />
          ) : (
            <ol className="space-y-3">
              {detail.events.map((e) => (
                <li
                  key={e.id}
                  className="rounded-[var(--radius-sm)] border border-ln-line bg-ln-card p-4"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13.5px] font-medium text-ln-ink">
                      {eventTypeLabel(e.eventType as EventType)}
                    </span>
                    <time className="font-ln-mono text-[10.5px] text-ln-mute">
                      {formatDateTime(e.occurredAt)}
                    </time>
                  </div>
                  {(() => {
                    const summary = eventPayloadSummary(e.eventType, e.payload);
                    const text = [summary.primary, summary.secondary].filter(Boolean).join(" · ");
                    return text ? <p className="mt-1 text-[12.5px] text-ln-mute">{text}</p> : null;
                  })()}
                  {/* Internal notes hidden for anon: they're free-form and
                      routinely contain PII (denouncer descriptions, internal
                      org coordination, addresses). */}
                  {!isPublic && e.notes ? (
                    <p className="mt-2 rounded-[3px] bg-ln-stripe p-2 font-ln-mono text-[11px] text-ln-mute">
                      {e.notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </CaseDetailShell>
    </main>
  );
}

// ---------------------------------------------------------------------------
// PublicTransparencyBanner — explains why this case is publicly accessible.
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
      className="mb-6 rounded-[var(--radius-sm)] border border-ln-celeste-100 px-4 py-3"
      style={{
        background: "var(--color-ln-celeste-050)",
        borderLeft: "3px solid var(--color-ln-azul)",
      }}
    >
      <p className="font-ln-mono text-[9.5px] font-semibold uppercase tracking-[.1em] text-ln-azul mb-1">
        ¿Por qué es público?
      </p>
      <p className="text-[13px] leading-[1.5] text-ln-ink-2">{reason}</p>
    </div>
  );
}
