// Inline chip for a case — used in pet profile lists and case index pages.
// Compact: kind icon + public code + status pill.
//
// Links to /casos/[publicCode]. Caller-supplied size prop allows a smaller
// inline version (for lists) vs a hero version (case detail header).

import Link from "next/link";

import type { CaseStatus } from "@/db";
import { type CaseKind, caseKindLabel } from "@/src/modules/cases/domain/case-kinds";

const KIND_ICON: Record<CaseKind, string> = {
  bite_incident: "🐾",
  lost_pet_episode: "🧭",
  welfare_denuncia: "🚨",
  adoption_listing: "🏠",
  adoption_application: "📨",
  custody_dispute: "⚖️",
  foster_placement: "🤝",
  custody_episode: "📋",
  custody_transfer_handshake: "↔️",
  foster_proposal: "💬",
  outbreak_investigation: "🦠",
  microchip_remediation: "🛠️",
};

const STATUS_STYLES: Record<CaseStatus, { label: string; classes: string }> = {
  open: {
    label: "Abierto",
    classes: "bg-[var(--color-ln-ok-050)] text-ln-ok ring-1 ring-ln-ok   ",
  },
  escalated: {
    label: "Escalado",
    classes: "bg-[var(--color-ln-warn-050)] text-ln-warn ring-1 ring-ln-warn   ",
  },
  closed: {
    label: "Cerrado",
    classes: "bg-ln-stripe text-ln-ink ring-1 ring-ln-line   ",
  },
  merged: {
    label: "Fusionado",
    classes: "bg-ln-stripe text-ln-ink ring-1 ring-ln-line   ",
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
      <span aria-hidden>{KIND_ICON[caseKind]}</span>
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
