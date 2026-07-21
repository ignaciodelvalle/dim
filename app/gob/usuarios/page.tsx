import Link from "next/link";

import { BulkRevokeList } from "@/components/BulkRevokeList";
import {
  OpBreach,
  OpCard,
  OpCardBody,
  type OpFilterAxis,
  OpFilterBar,
  OpKpi,
  OpPill,
  SearchFilterField,
} from "@/components/ui/dashboard";
import { DashboardFreshnessFooter } from "@/components/ui/dashboard/DashboardFreshnessFooter";
import { fetchChipReplacementSignal, fetchIsoValidity } from "@/lib/analytics/compliance-metrics";
import type { UserRoleFilter } from "@/lib/infra/admin-search";
import { searchUsers } from "@/lib/infra/admin-search";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { isTestAccount } from "@/lib/infra/test-accounts";
import { TARGETS, buildProjectionContext, toneForTarget } from "@/lib/metrics";
import { windows } from "@/lib/metrics/period";
import { buildAuthEmailMap, createAdminClient } from "@/lib/supabase/admin";
import { deriveTargetHref } from "@/lib/ui/audit-target-link";
import { portalBase } from "@/lib/ui/portal-base";
import { formatPercent, pluralizeEs } from "@/lib/utils/format";
import { logPiiReadSafely } from "@/src/modules/organizations/application/admin-proposals/log-pii-query";

import { ProposeUserActions } from "./ProposeUserActions";
import { RevokeUserActions } from "./RevokeUserActions";

const ROLE_LABELS: Record<string, string> = {
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Gobierno",
  admin: "Administrador/a",
};

type RoleTone = "neutral" | "ok" | "triaged" | "open";
const ROLE_TONES: Record<string, RoleTone> = {
  owner: "neutral",
  vet: "ok",
  govt: "triaged",
  admin: "open",
};

// ROLE filter select labels — "all" is the UI sentinel for "no filter".
const ROLE_FILTER_LABELS: Record<UserRoleFilter, string> = {
  all: "Todos",
  owner: "Dueño/a",
  vet: "Veterinario/a",
  govt: "Gobierno",
  admin: "Administrador/a",
};

function parseRoleFilter(raw: string | undefined): UserRoleFilter {
  return raw === "owner" || raw === "vet" || raw === "govt" || raw === "admin" ? raw : "all";
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; test?: string; role?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const showTestAccounts = sp.test === "1";
  const roleFilter = parseRoleFilter(sp.role);
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();
  const allResults = await searchUsers(query, { role: profile.role, jurisdictions }, roleFilter);

  // I1: emails live in auth.users (no email column on profiles) — resolve them so
  // each row shows a human email + estado instead of an opaque UUID. Same
  // service-role map the /admin/govts roster uses; the PII read is audited below.
  const supabase = createAdminClient();
  const emailMap = await buildAuthEmailMap(supabase);

  // I3: default ephemeral genesis/smoke accounts OUT of the roster so real users
  // aren't buried under `uc-cd-*` / `*-gen-*` rows. UI-level only (production has
  // none); the toggle reveals them. Match on both display name and resolved email.
  const hiddenTestCount = showTestAccounts
    ? 0
    : allResults.filter((u) => isTestAccount(u.displayName, emailMap.get(u.id))).length;
  const results = showTestAccounts
    ? allResults
    : allResults.filter((u) => !isTestAccount(u.displayName, emailMap.get(u.id)));

  // Toggle for the test-account filter — preserves the active query + role filter.
  const testToggleHref = (() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (!showTestAccounts) params.set("test", "1");
    const qs = params.toString();
    return qs ? `${base}/usuarios?${qs}` : `${base}/usuarios`;
  })();

  // Registro & cumplimiento (Item 4): C2 ISO-validity (population-state) and C5
  // chip-fraud signal (microchip_replaced flagged fraud/duplicate, last 12m).
  // C5 surfaces replacements for HUMAN REVIEW only — it does not auto-classify.
  const complianceCtx = buildProjectionContext(
    { role: profile.role },
    jurisdictions,
    windows.trailing12m(),
  );
  const [isoValidity, chipSignal] = await Promise.all([
    fetchIsoValidity(complianceCtx),
    fetchChipReplacementSignal(complianceCtx),
  ]);

  // AC2: every PII read leaves a trail — both the typed-query search AND the
  // no-query landing (which still exposes the first N users' name/id/role).
  // Awaited (not fire-and-forget) so the audit row is durable; the wrapper logs
  // to console.error and swallows on failure so it never breaks the render.
  await logPiiReadSafely(user.id, query, results.length, "users");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {base === "/admin" ? "Admin · Usuarios" : "miMAR Gobierno · Usuarios"}
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">Usuarios</h1>
        <p className="text-[13px] text-ln-op-ink-2">
          Buscá por nombre y proponé cambios de rol. Las búsquedas quedan registradas en el audit
          log.
        </p>
      </header>

      {/* C5 — chip-fraud signal (Item 4). Replacements flagged fraud/duplicate
          route to human review. This is a SIGNAL, not an auto-classification. */}
      {chipSignal.flaggedForReview > 0 && (
        <OpBreach
          title={`${chipSignal.flaggedForReview} ${pluralizeEs(chipSignal.flaggedForReview, "reemplazo")} de chip ${pluralizeEs(chipSignal.flaggedForReview, "marcado")} para revisión`}
          detail={`${chipSignal.byReason.fraud_detected ?? 0} por fraude · ${chipSignal.byReason.duplicate_detected ?? 0} por duplicado · ${chipSignal.total} reemplazos en total (12m)`}
        />
      )}

      {/* C2 — ISO-validity rate (Item 4, Res. SENASA 284/2024). */}
      <section
        aria-label="Registro y cumplimiento"
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <OpKpi
          label="Validez ISO de chips"
          value={isoValidity.chipped === 0 ? "—" : formatPercent(isoValidity.ratePct)}
          tone={
            isoValidity.chipped === 0
              ? "neutral"
              : toneForTarget(isoValidity.ratePct, TARGETS.MICROCHIP_PENETRATION_PCT)
          }
          bar={isoValidity.chipped === 0 ? undefined : isoValidity.ratePct}
          sub={
            isoValidity.chipped === 0
              ? "sin chips en cobertura"
              : `${isoValidity.valid} de ${isoValidity.chipped} chips · meta ${TARGETS.MICROCHIP_PENETRATION_PCT}% · ISO 11784/11785`
          }
          info={{
            definition:
              "Porcentaje de chips registrados en la cobertura que cumplen con la norma ISO 11784/11785 (identificación electrónica de animales). Meta interna: 80%.",
            formula:
              "COUNT(pet_identifications WHERE kind='microchip_iso' AND status='active' AND is_valid_iso=true) / COUNT(pet_identifications WHERE kind='microchip_iso' AND status='active') × 100",
            caveat: `Meta recomendada: ${TARGETS.MICROCHIP_PENETRATION_PCT}%. Solo cuenta microchips con registro ISO activo en miMAR.`,
          }}
        />
      </section>

      {/* Unified filter bar (F-migration 2026-07-21, off the bespoke GET
          <form>) — Rol is a registered axis ("todos los roles" is genuinely
          the no-param default). The free-text "Buscar" query is NOT an axis
          (a free-text value has no enumerable option set — an axis's
          implicit "" ⇒ blank-"Todas" option only fits a bounded value set),
          so it renders via the shared SearchFilterField child instead. */}
      <OpFilterBar
        showPeriod={false}
        axes={
          [
            {
              id: "role",
              label: "Rol",
              paramKey: "role",
              options: (["owner", "vet", "govt", "admin"] as UserRoleFilter[]).map((r) => ({
                value: r,
                label: ROLE_FILTER_LABELS[r],
              })),
              current: roleFilter === "all" ? null : roleFilter,
              allLabel: "Todos los roles",
            },
          ] satisfies OpFilterAxis[]
        }
      >
        <SearchFilterField
          paramKey="q"
          value={query}
          label="Buscar"
          placeholder="Buscar por nombre"
        />
      </OpFilterBar>

      <p className="text-sm text-ln-op-mute">
        {results.length === 0
          ? query || roleFilter !== "all"
            ? "Sin resultados."
            : "No hay usuarios registrados."
          : query || roleFilter !== "all"
            ? `${results.length} ${pluralizeEs(results.length, "resultado")}`
            : `Mostrando los primeros ${results.length} usuarios ordenados por rol y nombre.`}
      </p>

      <BulkRevokeList
        items={results.map((u) => ({
          id: u.id,
          label: `${u.displayName} (${ROLE_LABELS[u.role] ?? u.role})`,
          revocable: u.role === "vet",
          content: (
            <OpCard>
              <OpCardBody>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[13px] font-medium text-ln-op-ink">{u.displayName}</p>
                      {/* I1: email (rol is the pill, estado is the marker below) —
                          the opaque UUID that used to sit here told a human nothing. */}
                      <p className="text-xs text-ln-op-mute">{emailMap.get(u.id) || "Sin email"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <OpPill tone={ROLE_TONES[u.role] ?? "neutral"}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </OpPill>
                      {u.deactivatedAt && <OpPill tone="neutral">Desactivada</OpPill>}
                    </div>
                  </div>
                  <ProposeUserActions
                    target={{ id: u.id, displayName: u.displayName, role: u.role }}
                    actorRole={profile.role}
                    // Govt/admin accounts are managed on their detail pages
                    // (create/assign-locality/revoke live there), not inline
                    // here. For an admin viewer we link to that page instead of
                    // showing a dead "sin acciones" line. Govt viewers can't
                    // reach /admin/*, so they keep the no-inline-actions notice.
                    manageHref={base === "/admin" ? deriveTargetHref(u.id, u.role) : null}
                  />
                  {u.role === "vet" && (
                    <RevokeUserActions
                      target={{
                        id: u.id,
                        displayName: u.displayName,
                        matriculaJurisdiccion: u.matriculaJurisdiccion,
                        role: u.role,
                      }}
                      actorUserId={user.id}
                      actorRole={profile.role}
                      jurisdictions={jurisdictions}
                    />
                  )}
                </div>
              </OpCardBody>
            </OpCard>
          ),
        }))}
        targetKind="vet"
      />

      {/* I3: test-account filter toggle — only when there is something to reveal
          or to re-hide. */}
      {(hiddenTestCount > 0 || showTestAccounts) && (
        <p>
          <Link
            href={testToggleHref}
            className="text-sm underline underline-offset-4 text-ln-op-mute hover:text-ln-op-ink-2"
          >
            {showTestAccounts
              ? "Ocultar cuentas de prueba"
              : `Mostrar cuentas de prueba (${hiddenTestCount})`}
          </Link>
        </p>
      )}

      <p className="text-sm text-ln-op-mute">
        <Link href={base} className="underline underline-offset-4 hover:text-ln-op-ink-2">
          ← Volver al dashboard
        </Link>
      </p>

      <DashboardFreshnessFooter ctx={complianceCtx} />
    </div>
  );
}
