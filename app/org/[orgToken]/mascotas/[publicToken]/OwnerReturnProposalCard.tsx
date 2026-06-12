"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  orgAcceptOwnerReturnAction,
  orgRejectOwnerReturnAction,
} from "@/app/actions/return-to-owner";
import { OpCard, OpCardBody, OpCardHead } from "@/components/ui/dashboard";

export function OwnerReturnProposalCard({
  orgToken,
  petPublicToken,
  petName,
  ownerDisplayName,
  proposedAt,
  proposalNotes,
}: {
  orgToken: string;
  petPublicToken: string;
  petName: string;
  ownerDisplayName: string | null;
  proposedAt: string;
  proposalNotes: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneMode, setDoneMode] = useState<"accept" | "reject" | null>(null);
  const [mode, setMode] = useState<"accept" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const formattedDate = new Date(proposedAt).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await orgAcceptOwnerReturnAction({
        petPublicToken,
        orgToken,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDoneMode("accept");
      setDone(true);
      router.refresh();
    });
  }

  function handleReject() {
    if (!rejectReason.trim()) {
      setError("Ingresá un motivo para el rechazo.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await orgRejectOwnerReturnAction({
        petPublicToken,
        orgToken,
        reason: rejectReason.trim(),
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDoneMode("reject");
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <OpCard accent="warn">
        <OpCardHead title="Devolución propuesta" />
        <OpCardBody>
          <p className="text-[12px] text-ln-op-ok font-medium">
            {doneMode === "accept"
              ? "Devolución aceptada. La custodia fue transferida correctamente."
              : "Propuesta rechazada. El adoptante fue notificado."}
          </p>
        </OpCardBody>
      </OpCard>
    );
  }

  if (mode === "accept") {
    return (
      <OpCard accent="warn">
        <OpCardHead title="Confirmar aceptación de devolución" />
        <OpCardBody>
          <p className="text-[13px] text-ln-op-ink mb-3">
            Aceptar la devolución de <strong>{petName}</strong> del adoptante{" "}
            <strong>{ownerDisplayName ?? "desconocido"}</strong>.
          </p>
          <p className="text-[12px] text-ln-op-mute mb-4">
            La custodia pasa a tu organización. El adoptante pierde el vínculo activo. Esta acción
            no se puede deshacer.
          </p>
          {error && <output className="block text-[12px] text-ln-op-danger mb-3">{error}</output>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              disabled={pending}
              className="px-4 py-2 rounded-[6px] bg-ln-op-ok text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {pending ? "Procesando..." : "Confirmar aceptación"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setError(null);
              }}
              disabled={pending}
              className="px-4 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
            >
              Cancelar
            </button>
          </div>
        </OpCardBody>
      </OpCard>
    );
  }

  if (mode === "reject") {
    return (
      <OpCard accent="warn">
        <OpCardHead title="Rechazar propuesta de devolución" />
        <OpCardBody>
          <p className="text-[13px] text-ln-op-ink mb-3">
            Rechazar la devolución de <strong>{petName}</strong>.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            placeholder="Motivo del rechazo (requerido)"
            className="w-full px-3 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] text-ln-op-ink focus:outline-none focus:border-ln-op-azul mb-3"
          />
          {error && <output className="block text-[12px] text-ln-op-danger mb-3">{error}</output>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={pending}
              className="px-4 py-2 rounded-[6px] border border-ln-op-danger text-ln-op-danger bg-ln-op-card text-[13px] font-medium hover:bg-ln-op-stripe disabled:opacity-60 transition-colors"
            >
              {pending ? "Procesando..." : "Confirmar rechazo"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setError(null);
                setRejectReason("");
              }}
              disabled={pending}
              className="px-4 py-2 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[13px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
            >
              Cancelar
            </button>
          </div>
        </OpCardBody>
      </OpCard>
    );
  }

  return (
    <OpCard accent="warn">
      <OpCardHead title="Devolución propuesta por el adoptante" />
      <OpCardBody>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] mb-4">
          <dt className="text-ln-op-mute">Adoptante</dt>
          <dd className="text-ln-op-ink">{ownerDisplayName ?? "—"}</dd>
          <dt className="text-ln-op-mute">Propuesta el</dt>
          <dd className="text-ln-op-ink">{formattedDate}</dd>
          {proposalNotes && (
            <>
              <dt className="text-ln-op-mute">Notas</dt>
              <dd className="text-ln-op-ink">{proposalNotes}</dd>
            </>
          )}
        </dl>
        <p className="text-[12px] text-ln-op-mute mb-4">
          El adoptante quiere devolver a <strong>{petName}</strong> a tu organización. Aceptá para
          tomar la custodia o rechazá con un motivo.
        </p>
        {error && <output className="block text-[12px] text-ln-op-danger mb-3">{error}</output>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("accept")}
            className="px-3 py-1.5 rounded-[6px] bg-ln-op-ok text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
          >
            Aceptar devolución
          </button>
          <button
            type="button"
            onClick={() => setMode("reject")}
            className="px-3 py-1.5 rounded-[6px] border border-ln-op-line bg-ln-op-card text-[12px] font-medium text-ln-op-ink-2 hover:bg-ln-op-stripe transition-colors"
          >
            Rechazar
          </button>
        </div>
      </OpCardBody>
    </OpCard>
  );
}
