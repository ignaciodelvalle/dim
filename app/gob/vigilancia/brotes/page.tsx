import { LnEmptyState } from "@/components/ui/EmptyState";
import {
  OpCard,
  OpCardBody,
  OpCardHead,
  type OpFilterAxis,
  OpFilterBar,
} from "@/components/ui/dashboard";
import { ScreenHeader } from "@/components/ui/dashboard/ScreenHeader";
import { fetchSurveillanceSignals } from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { DISEASES } from "@/lib/reference/diseases";
import { pluralizeEs } from "@/lib/utils/format";
import { OutbreakSignalRow } from "../_components/OutbreakSignalRow";
import { ScrollToSignal } from "../_components/ScrollToSignal";
import { VerifiedFilterCheckbox } from "../_components/VerifiedFilterCheckbox";

// Disease/zoonosis axis — the page already reads the disease_code from each
// signal's payload, and fetchSurveillanceSignals applies `disease_code = X`
// when filters.diseaseCode is set (previously wired but never surfaced — the
// TODO this axis replaces). Options come from the SAME curated catalog
// (lib/reference/diseases.ts) the disease-diagnosis form and mortality
// disposition screens use — never an invented list.
const DISEASE_OPTIONS = DISEASES.map((d) => ({ value: d.code, label: d.label }));

export default async function GobVigilanciaBrotesPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    signalId?: string;
    soloVerificados?: string;
    province?: string;
    locality?: string;
    diseaseCode?: string;
  }>;
}) {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const actor = { role: profile.role };
  const sp = await searchParams;

  const days = sp.period === "7d" ? 7 : sp.period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const { filteredJurisdictions, localities, allowedProvinces } = await resolveJurisdictionScope({
    role: profile.role,
    jurisdictions,
    params: { province: sp.province, locality: sp.locality },
  });

  // Validate against the real catalog — an unrecognized/stale code in the URL
  // is dropped rather than silently sent to the DB as a narrowing predicate
  // that would (dishonestly) return zero rows.
  const diseaseCode =
    sp.diseaseCode && DISEASES.some((d) => d.code === sp.diseaseCode) ? sp.diseaseCode : undefined;

  const allSignals = await fetchSurveillanceSignals(actor, filteredJurisdictions, {
    since,
    diseaseCode,
  });

  // A.5: tier-based filter — "Solo verificados institucionalmente"
  // When the checkbox is active, filter to signals where tier >= professional_verified.
  const soloVerificados = sp.soloVerificados === "1";
  const signals = soloVerificados
    ? allSignals.filter((s) =>
        isAtLeast(
          computeConfidence({
            authorRole: s.authorRole,
            authorVerified: s.authorVerified,
            authorOrganizationId: s.authorOrganizationId,
            payload: s.payload,
          }),
          "professional_verified",
        ),
      )
    : allSignals;

  // Deep-link target (?signalId=): highlight + scroll the matching row into
  // view. Only activates when the requested signal is actually present in the
  // current (filtered) result set — a stale or out-of-window id is a no-op.
  const targetSignalId = sp.signalId ?? null;
  const hasSignalTarget =
    targetSignalId != null && signals.some((s) => s.signalEventId === targetSignalId);

  const panelId = "panel-brotes-titulo";

  return (
    <div className="space-y-6">
      <ScreenHeader
        className="space-y-2"
        eyebrow="Vigilancia · Brotes"
        title="Brotes y señales epidemiológicas"
        subtitle={
          <p className="text-[13px] text-ln-op-mute">
            {profile.role === "admin"
              ? "Vista universal — todas las jurisdicciones."
              : "Lista completa de señales de brote en tu cobertura."}
          </p>
        }
      />

      {/* Unified filter bar — period + jurisdiction + disease axis, same rail as
          vigilancia's own /gob/vigilancia. A.5's confidence-tier toggle ("solo
          verificados institucionalmente") is a per-screen boolean, not a
          select-driven axis, so it lives in the free-form `children` slot —
          the OpCheckbox itself commits via the SAME serverNavCommit path as
          the bar's own controls (see VerifiedFilterCheckbox), so toggling it
          never drops the active period/jurisdiction/disease the way the old
          hidden-input <form> did. */}
      <OpFilterBar
        period={{ defaultPreset: "30d" }}
        jurisdiction={{ allowedProvinces, localities }}
        axes={
          [
            {
              id: "diseaseCode",
              label: "Enfermedad",
              paramKey: "diseaseCode",
              options: DISEASE_OPTIONS,
              current: diseaseCode ?? null,
            },
          ] satisfies OpFilterAxis[]
        }
      >
        <VerifiedFilterCheckbox defaultChecked={soloVerificados} />
      </OpFilterBar>

      <OpCard aria-labelledby={panelId}>
        <OpCardHead
          title={
            <span id={panelId}>
              {signals.length} {pluralizeEs(signals.length, "señal")}
            </span>
          }
        />
        <OpCardBody className="p-0">
          {signals.length === 0 ? (
            <div className="px-4 py-3">
              {/* C4 (2026-07-22, §S4): same reasoning as /gob/vigilancia's
                  "Señales recientes" panel — no-signal, not "all clear". */}
              <LnEmptyState
                icon="eye-off"
                nature="no-signal"
                title="Sin señales registradas en miMAR"
                description="La ausencia de señales no implica ausencia de enfermedad — nadie reportó un caso en este período."
              />
            </div>
          ) : (
            <ul className="px-3">
              {signals.map((s) => (
                <OutbreakSignalRow
                  key={s.signalEventId}
                  signal={s}
                  highlighted={s.signalEventId === targetSignalId}
                />
              ))}
            </ul>
          )}
        </OpCardBody>
      </OpCard>

      {hasSignalTarget && targetSignalId != null && <ScrollToSignal signalId={targetSignalId} />}
    </div>
  );
}
