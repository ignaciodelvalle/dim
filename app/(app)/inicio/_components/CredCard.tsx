// CredCard — per-pet credential card for the owner-home carousel (task #9).
//
// "La mascota es la credencial." One card = photo + name + status flag + a 4px
// status-accent left border, then a body that switches by situation:
//
//   • healthy pet  → the vaccine-vigencia mini-summary (Vigente / Por vencer /
//                    Vencida tiles) — the SAME derivation VacunasStatusBadges
//                    renders on the libreta (deriveVacunasBadgeCounts), read-only
//                    here (no drill-down; that stays on the profile).
//   • urgent (lost) → a reassurance line + two actions. "Lo encontré" PROMOTES to
//                    the existing full-screen found wizard (?sheet=marcar-encontrada
//                    on the profile — same flow LostCaseBlock's "¡Apareció!" opens);
//                    "Ver reporte" opens the profile where the lost case lives.
//
// Glance-and-go (PO 2026-07-12 #1): the identity header is a Link to the pet
// profile; the card never drives anything below the rail. Desktop healthy cards
// gain a quiet footer (Asentar · Ver perfil). Presentational — all data arrives
// resolved from the server page. No color alone: status is icon+shape+text via
// LnStatusFlag, and the vaccine tiles carry text labels.

import Link from "next/link";

import { LnButton } from "@/components/ui/Button";
import type { LnPetStatus } from "@/components/ui/Chip";
import { LnPetPhoto } from "@/components/ui/RegRow";
import { LnStatusFlag } from "@/components/ui/StatusFlag";

export type CredCardVac = {
  vigente: number;
  porVencer: number;
  vencida: number;
  hasRecords: boolean;
};

export type CredCardLost = {
  /** One-sentence state + reassurance line. */
  line: string;
};

export type CredCardData = {
  token: string;
  name: string;
  photoUrl: string | null;
  status: LnPetStatus;
  /** Public credential identifier (the pet's public token), shown mono. */
  credentialId: string;
  /** Healthy body — the vaccine-vigencia mini-summary. Null for urgent cards. */
  vac: CredCardVac | null;
  /** Urgent (lost) body. Null for non-lost cards. */
  lost: CredCardLost | null;
};

// Left 4px status accent — the same status axis LnRegRow paints on its edge.
const accentByStatus: Record<LnPetStatus, string> = {
  ok: "before:bg-[var(--color-ln-ok)]",
  registered: "before:bg-[var(--color-ln-line-strong)]",
  sick: "before:bg-[var(--color-ln-warn)]",
  lost: "before:bg-[var(--color-ln-err)]",
  pregnant: "before:bg-[var(--color-ln-rosa)]",
  deceased: "before:bg-[var(--color-ln-memorial-chip-text)]",
};

function VacTile({
  count,
  label,
  bg,
  border,
  text,
}: {
  count: number;
  label: string;
  bg: string;
  border: string;
  text: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[var(--radius-sm)] border px-1 py-2 ${bg} ${border}`}
    >
      <span className={`font-[var(--font-ln-serif)] text-[var(--text-lg)] font-semibold leading-none ${text}`}>
        {count}
      </span>
      <span className={`mt-1 font-[var(--font-ln-mono)] text-[var(--text-xs)] uppercase tracking-[.06em] ${text}`}>
        {label}
      </span>
    </div>
  );
}

export function CredCard({ data }: { data: CredCardData }) {
  const { token, name, photoUrl, status, credentialId, vac, lost } = data;
  const profileHref = `/mis-mascotas/${token}`;
  const isLost = status === "lost" && lost !== null;

  return (
    <article
      aria-label={`Credencial de ${name}`}
      className={[
        "relative flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-ln-line)]",
        // Left status accent (::before) — 4px, colored by status.
        "before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-[4px] before:content-['']",
        accentByStatus[status],
        // Lost cards get a subtle err-050 → card wash; others a flat card bg.
        isLost
          ? "bg-gradient-to-b from-[var(--color-ln-err-050)] to-[var(--color-ln-card)]"
          : "bg-[var(--color-ln-card)]",
      ].join(" ")}
    >
      {/* Identity header — a Link to the profile (glance-and-go). */}
      <Link
        href={profileHref}
        className="flex items-start gap-3 px-4 pt-4 pb-3 no-underline text-inherit"
      >
        <LnPetPhoto src={photoUrl ?? undefined} alt={name} status={status} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-[var(--font-ln-serif)] text-[var(--text-lg)] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
              {name}
            </span>
            <LnStatusFlag status={status} />
          </div>
          <span className="mt-1 block font-[var(--font-ln-mono)] text-[var(--text-xs)] uppercase tracking-[.08em] text-[var(--color-ln-faint)]">
            {credentialId}
          </span>
        </div>
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col px-4 pb-4">
        {isLost && lost ? (
          <>
            <p className="mb-3 text-[var(--text-sm)] leading-snug text-[var(--color-ln-ink-2)]">
              {lost.line}
            </p>
            <div className="mt-auto flex flex-wrap gap-2">
              <Link href={profileHref} className="no-underline">
                <LnButton variant="warn" size="sm">
                  Ver reporte
                </LnButton>
              </Link>
              {/* Promotes to the existing full-screen found wizard. */}
              <Link href={`${profileHref}?sheet=marcar-encontrada`} className="no-underline">
                <LnButton variant="ghost" size="sm">
                  Lo encontré
                </LnButton>
              </Link>
            </div>
          </>
        ) : vac && vac.hasRecords ? (
          <div className="grid grid-cols-3 gap-2">
            <VacTile
              count={vac.vigente}
              label="Vigente"
              bg="bg-[var(--color-ln-ok-050)]"
              border="border-[var(--color-ln-ok-100)]"
              text="text-[var(--color-ln-ok)]"
            />
            <VacTile
              count={vac.porVencer}
              label="Por vencer"
              bg="bg-[var(--color-ln-warn-025)]"
              border="border-[var(--color-ln-warn-050)]"
              text="text-[var(--color-ln-warn)]"
            />
            <VacTile
              count={vac.vencida}
              label="Vencida"
              bg="bg-[var(--color-ln-err-050)]"
              border="border-[var(--color-ln-err-100)]"
              text="text-[var(--color-ln-seal)]"
            />
          </div>
        ) : (
          <p className="text-[var(--text-sm)] text-[var(--color-ln-mute)]">
            Sin vacunas registradas todavía.
          </p>
        )}

        {/* Desktop-only quiet footer for non-urgent cards (handoff 5b). */}
        {!isLost && (
          <div className="mt-4 hidden gap-2 border-t border-[var(--color-ln-line-2)] pt-3 md:flex">
            <Link href={`${profileHref}?sheet=anotar`} className="no-underline">
              <LnButton variant="ghost" size="sm">
                Asentar
              </LnButton>
            </Link>
            <Link href={profileHref} className="no-underline">
              <LnButton variant="ghost" size="sm">
                Ver perfil
              </LnButton>
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
