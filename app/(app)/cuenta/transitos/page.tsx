// Tránsitos hub — groups the four foster-related sub-flows under one entry point.
// Server component; auth guard via requireUserOrRedirect.

import Link from "next/link";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnSectionHead } from "@/components/ui/DocElements";
import {
  countActiveFosterOwnerships,
  countPendingFosterProposals,
} from "@/lib/analytics/owner-dashboard";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";

export default async function TransitosHubPage() {
  const { user } = await requireUserOrRedirect();

  const [pendingProposals, activeFosters] = await Promise.all([
    countPendingFosterProposals(user.id),
    countActiveFosterOwnerships(user.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href="/cuenta"
        className="mb-5 inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mi cuenta
      </Link>

      {/* Page header */}
      <div className="mb-7">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[34px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Tránsitos
        </h1>
        <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
          Gestioná tu participación como hogar de tránsito voluntario.
        </p>
      </div>

      {/* Hub cards */}
      <LnSectionHead num="01" title="Acciones" className="mb-4" />

      <div className="overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-ln-line)]">
        <HubRow
          href="/cuenta/ofrecerme-como-transito"
          label="Ofrecerme como hogar de tránsito"
          description="Inscribite en el pool de voluntarios para cuidar mascotas en custodia"
        />
        <HubRow
          href="/cuenta/transitos/propuestas"
          label="Propuestas de tránsito"
          description="Refugios proponiéndote cuidar mascotas"
          badge={pendingProposals > 0 ? pendingProposals : undefined}
        />
        <HubRow
          href="/cuenta/transitos/activos"
          label="Tránsitos activos"
          description="Mascotas que estás cuidando ahora"
          badge={activeFosters > 0 ? activeFosters : undefined}
        />
        <HubRow
          href="/cuenta/transitos/historial"
          label="Historial de tránsitos"
          description="Tránsitos terminados y propuestas no concretadas"
        />
      </div>

      {/* Info card */}
      <LnCard className="mt-7">
        <LnCardHead title="¿Qué es un tránsito?" />
        <LnCardBody>
          <p className="text-[13px] leading-[1.6] text-[var(--color-ln-ink-2)]">
            Un hogar de tránsito cuida temporalmente a una mascota de un refugio mientras ésta
            espera adopción. Durante el tránsito tenés los mismos permisos sobre la libreta
            sanitaria que un dueño/a.
          </p>
        </LnCardBody>
      </LnCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HubRow({
  href,
  label,
  description,
  badge,
}: {
  href: string;
  label: string;
  description: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[18px] py-3.5 no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium leading-tight text-[var(--color-ln-ink)]">
          {label}
        </p>
        <p className="mt-0.5 text-[11.5px] text-[var(--color-ln-mute)]">{description}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {badge !== undefined && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--color-ln-azul)] px-[5px] font-[var(--font-ln-mono)] text-xs font-semibold text-white">
            {badge}
          </span>
        )}
        <span aria-hidden="true" className="text-base text-[var(--color-ln-mute)]">
          ›
        </span>
      </div>
    </Link>
  );
}
