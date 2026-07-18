import { JurisdictionSwitcher } from "@/components/gob/JurisdictionSwitcher";
import { PeriodPicker } from "@/components/gob/PeriodPicker";
import { LnEmptyState } from "@/components/ui/EmptyState";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";
import { fetchSurveillanceSignals } from "@/lib/analytics/govt-dashboards";
import { resolveJurisdictionScope } from "@/lib/analytics/jurisdiction-scope";
import { computeConfidence, isAtLeast } from "@/lib/events/event-confidence";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { pluralizeEs } from "@/lib/utils/format";
import { OutbreakSignalRow } from "../_components/OutbreakSignalRow";
import { ScrollToSignal } from "../_components/ScrollToSignal";
import { VerifiedFilterCheckbox } from "../_components/VerifiedFilterCheckbox";

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

  const allSignals = await fetchSurveillanceSignals(actor, filteredJurisdictions, { since });

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
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          Vigilancia · Brotes
        </p>
        <h1 className="text-[var(--text-title)] font-semibold text-ln-op-ink">
          Brotes y señales epidemiológicas
        </h1>
        <p className="text-[13px] text-ln-op-mute">
          {profile.role === "admin"
            ? "Vista universal — todas las jurisdicciones."
            : "Lista completa de señales de brote en tu cobertura."}
        </p>
      </header>

      {/* Filters row */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* TODO(future): filter by disease_code + confirmation_strength chips */}
        <JurisdictionSwitcher allowedProvinces={allowedProvinces} localities={localities} />
        <PeriodPicker defaultPreset="30d" />
      </div>

      {/* A.5: confidence tier filter */}
      <div className="flex items-center gap-2">
        <form method="GET" className="flex items-center gap-2">
          {/* Preserve existing params */}
          {sp.period && <input type="hidden" name="period" value={sp.period} />}
          {sp.signalId && <input type="hidden" name="signalId" value={sp.signalId} />}
          <VerifiedFilterCheckbox defaultChecked={soloVerificados} />
          {soloVerificados && (
            <a
              href={`/gob/vigilancia/brotes${sp.period ? `?period=${sp.period}` : ""}`}
              className="text-sm text-ln-op-mute underline"
            >
              Quitar filtro
            </a>
          )}
        </form>
      </div>

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
              <LnEmptyState
                icon="shield-check"
                title="Sin señales activas en este período"
                description="No se detectaron señales de zoonosis en el rango seleccionado."
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
