// Inline chip for a case — used in pet profile lists and case index pages.
// Compact: kind icon + public code + status pill.
//
// Links to /casos/[publicCode]. Caller-supplied size prop allows a smaller
// inline version (for lists) vs a hero version (case detail header).

import Link from "next/link";

import { Icon } from "@/components/Icon";
import type { CaseStatus } from "@/db";
import { type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const KIND_ICON: Record<CaseKind, string> = {
  bite_incident: "mordedura",
  lost_pet_episode: "perdida",
  welfare_denuncia: "denuncia",
  adoption_listing: "casa",
  adoption_application: "solicitud",
  custody_dispute: "disputa",
  foster_placement: "trato",
  custody_episode: "custodia",
  custody_transfer_handshake: "transferencia",
  foster_proposal: "propuesta",
  outbreak_investigation: "brote",
  microchip_remediation: "reparacion",
};

// Canonical case-status tones (decision 2026-06-24, triage model):
// open=warn (atención) · escalated=err · closed=ok (resuelto) · merged=info.
// Uses the --color-st-* indirection layer so tones auto-remap per skin
// (operator surfaces under .op-surface → ln-op-*; citizen → ln-*).
const STATUS_STYLES: Record<CaseStatus, { label: string; classes: string }> = {
  open: {
    label: "Abierto",
    classes:
      "bg-[var(--color-st-warn-bg)] text-[var(--color-st-warn)] ring-1 ring-[var(--color-st-warn)]",
  },
  escalated: {
    label: "Escalado",
    classes:
      "bg-[var(--color-st-err-bg)] text-[var(--color-st-err)] ring-1 ring-[var(--color-st-err)]",
  },
  closed: {
    label: "Cerrado",
    classes: "bg-[var(--color-st-ok-bg)] text-[var(--color-st-ok)] ring-1 ring-[var(--color-st-ok)]",
  },
  merged: {
    label: "Fusionado",
    classes:
      "bg-[var(--color-st-info-bg)] text-[var(--color-st-info)] ring-1 ring-[var(--color-st-info)]",
  },
};

interface Props {
  publicCode: string;
  caseKind: CaseKind;
  status: CaseStatus;
  size?: "sm" | "md";
}

export function CaseBadge({ publicCode, caseKind, status, size = "md" }: Props) {
  const sizeClasses = size === "sm" ? "px-2 py-1 text-xs gap-1.5" : "px-3 py-1.5 text-sm gap-2";
  const statusStyle = STATUS_STYLES[status];
  return (
    <Link
      href={`/casos/${publicCode}`}
      className={`inline-flex items-center rounded-full bg-ln-card ring-1 ring-ln-line transition hover:bg-ln-stripe    ${sizeClasses}`}
    >
      <Icon name={KIND_ICON[caseKind]} size="sm" decorative />
      <span className="font-mono font-semibold text-ln-ink ">{publicCode}</span>
      <span className="text-ln-mute ">·</span>
      <span className="text-ln-ink ">{caseKindLabel(caseKind)}</span>
      <span
        className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.classes}`}
      >
        {statusStyle.label}
      </span>
    </Link>
  );
}
