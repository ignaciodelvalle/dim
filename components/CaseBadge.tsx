// Inline chip for a case — used in pet profile lists and case index pages.
// Compact: kind icon + public code + status pill.
//
// Links to /casos/[publicCode]. Caller-supplied size prop allows a smaller
// inline version (for lists) vs a hero version (case detail header).

import Link from "next/link";

import type { CaseStatus } from "@/db";
import { type CaseKind, caseKindLabel } from "@/lib/case-kinds";

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
    classes:
      "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-800",
  },
  escalated: {
    label: "Escalado",
    classes:
      "bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800",
  },
  closed: {
    label: "Cerrado",
    classes:
      "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700",
  },
  merged: {
    label: "Fusionado",
    classes:
      "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700",
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
      className={`inline-flex items-center rounded-full bg-white ring-1 ring-zinc-200 transition hover:bg-zinc-50 dark:bg-zinc-900 dark:ring-zinc-700 dark:hover:bg-zinc-800 ${sizeClasses}`}
    >
      <span aria-hidden>{KIND_ICON[caseKind]}</span>
      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">{publicCode}</span>
      <span className="text-zinc-500 dark:text-zinc-400">·</span>
      <span className="text-zinc-700 dark:text-zinc-300">{caseKindLabel(caseKind)}</span>
      <span
        className={`ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle.classes}`}
      >
        {statusStyle.label}
      </span>
    </Link>
  );
}
