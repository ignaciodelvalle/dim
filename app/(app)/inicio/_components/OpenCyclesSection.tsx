// Open cycles surface for /inicio (task #19, owner-process-clarity Lens 3).
//
// Pending adoption applications and incoming ownership transfers each carry a
// badge count, but before this they lived ONLY on the secondary /mis-mascotas
// page — the default landing (/inicio) was silent about them. This band brings
// both open cycles onto the home with a direct next-step link so the owner sees
// movement without hunting.
//
// Presentational: the server page passes the two counts (countPendingApplications
// / countPendingTransfers from lib/analytics/owner-dashboard). Renders nothing
// when both are zero, so it stays quiet for the common case (mirrors the sibling
// IntentApplyBanner and RemindersSection).

import Link from "next/link";

import { Icon, type IconName } from "@/components/Icon";

function CycleBand({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: IconName;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] px-4 py-3 no-underline transition-colors hover:bg-[var(--color-ln-celeste-050)]/70"
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[var(--color-ln-celeste-100)] text-[var(--color-ln-azul)]"
      >
        <Icon name={icon} size={16} decorative />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[var(--text-md)] font-semibold text-[var(--color-ln-ink)]">
          {title}
        </span>
        <span className="block text-sm text-[var(--color-ln-mute)]">{subtitle}</span>
      </span>
      <span aria-hidden="true" className="flex-shrink-0 text-base text-[var(--color-ln-mute)]">
        ›
      </span>
    </Link>
  );
}

export function OpenCyclesSection({
  pendingApplications,
  pendingTransfers,
}: {
  pendingApplications: number;
  pendingTransfers: number;
}) {
  if (pendingApplications <= 0 && pendingTransfers <= 0) return null;

  return (
    <div className="mb-6 flex flex-col gap-3">
      {pendingApplications > 0 && (
        <CycleBand
          href="/mis-mascotas/postulaciones"
          icon="corazon"
          title={
            pendingApplications === 1
              ? "Tenés una postulación de adopción en curso"
              : `Tenés ${pendingApplications} postulaciones de adopción en curso`
          }
          subtitle="Seguí el estado de tu solicitud. Tocá para ver el detalle."
        />
      )}
      {pendingTransfers > 0 && (
        <CycleBand
          href="/transferencias"
          icon="transferencia"
          title={
            pendingTransfers === 1
              ? "Una transferencia espera tu confirmación"
              : `${pendingTransfers} transferencias esperan tu confirmación`
          }
          subtitle="Alguien quiere transferirte una mascota. Tocá para revisarla."
        />
      )}
    </div>
  );
}
