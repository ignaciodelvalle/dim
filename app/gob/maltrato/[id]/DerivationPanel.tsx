"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deriveWelfareToOrgAction } from "@/src/modules/welfare/actions";

type OrgOption = {
  id: string;
  displayName: string;
  orgType: string;
};

type DerivationPanelProps = {
  welfareReportId: string;
  availableOrgs: OrgOption[];
  alreadyDerivedTo: { orgId: string; orgDisplayName: string; derivedAt: Date } | null;
};

export function DerivationPanel({
  welfareReportId,
  availableOrgs,
  alreadyDerivedTo,
}: DerivationPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (!selectedOrgId) return;
    setError(null);
    startTransition(async () => {
      const result = await deriveWelfareToOrgAction({
        welfareReportId,
        targetOrgId: selectedOrgId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setSelectedOrgId("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        {alreadyDerivedTo && (
          <p className="text-[11px] text-ln-op-mute">
            Ya derivada a{" "}
            <span className="font-medium text-ln-op-ink-2">{alreadyDerivedTo.orgDisplayName}</span>
            {" — "}
            <span>
              {new Date(alreadyDerivedTo.derivedAt).toLocaleDateString("es-AR", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 rounded-[4px] text-[12px] font-medium bg-ln-op-azul text-white hover:opacity-90"
        >
          {alreadyDerivedTo ? "Cambiar derivación" : "Derivar a org"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 space-y-3">
      <p className="text-[13px] font-medium text-ln-op-ink">Derivar a refugio u org de rescate</p>
      {availableOrgs.length === 0 ? (
        <p className="text-[12px] text-ln-op-mute">
          No hay refugios ni redes de rescate verificados disponibles.
        </p>
      ) : (
        <select
          value={selectedOrgId}
          onChange={(e) => setSelectedOrgId(e.target.value)}
          className="w-full px-3 py-2 rounded border border-ln-op-line bg-white text-[13px] text-ln-op-ink"
        >
          <option value="">Seleccioná una organización…</option>
          {availableOrgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.displayName} ({o.orgType === "shelter" ? "Refugio" : "Red de rescate"})
            </option>
          ))}
        </select>
      )}
      {error && <output className="block text-[12px] text-ln-op-danger">{error}</output>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || !selectedOrgId}
          className="px-4 py-2 rounded-[4px] bg-ln-op-azul text-white text-[13px] font-medium disabled:opacity-50"
        >
          {pending ? "Procesando..." : "Confirmar derivación"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSelectedOrgId("");
            setError(null);
          }}
          disabled={pending}
          className="px-4 py-2 rounded-[4px] border border-ln-op-line text-[13px] text-ln-op-ink-2"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
