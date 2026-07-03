"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { speciesLabel } from "@/lib/utils/format";
import { proposeFosterAction } from "@/src/modules/foster/actions";

type Row = {
  userId: string;
  displayName: string;
  availableSlots: number;
  acceptedCount: number;
  matchScore: number | null;
  matchWarnings: string[];
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
};

type OrgPet = {
  id: string;
  publicToken: string;
  name: string;
  species: string;
};

export function VolunteerRow({
  row,
  orgToken,
  orgPets,
  preselectedPetToken,
}: {
  row: Row;
  orgToken: string;
  orgPets: OrgPet[];
  preselectedPetToken: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [petToken, setPetToken] = useState(preselectedPetToken ?? orgPets[0]?.publicToken ?? "");
  const [durationWeeks, setDurationWeeks] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  function propose() {
    setError(null);
    if (!petToken) {
      setError("Elegí una mascota.");
      return;
    }
    startTransition(async () => {
      const result = await proposeFosterAction({
        orgToken,
        volunteerUserId: row.userId,
        petPublicToken: petToken,
        proposedDurationWeeks: durationWeeks.trim()
          ? Math.max(1, Number.parseInt(durationWeeks, 10) || 0)
          : null,
        proposedNotes: notes.trim() || null,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOkMessage(`Propuesta enviada (${result.proposalPublicToken}).`);
      router.refresh();
    });
  }

  return (
    <li className="rounded-[6px] border border-ln-op-line bg-ln-op-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[13px] font-medium text-ln-op-ink">{row.displayName}</p>
          <p className="text-sm text-ln-op-mute space-x-2">
            <span>{row.availableSlots} slot(s)</span>
            <span>·</span>
            <span>{row.acceptedCount} aceptadas</span>
            {(row.jurisdictionProvince || row.jurisdictionLocality) && (
              <>
                <span>·</span>
                <span>
                  {row.jurisdictionLocality}
                  {row.jurisdictionLocality && row.jurisdictionProvince ? ", " : ""}
                  {row.jurisdictionProvince}
                </span>
              </>
            )}
            {row.matchScore != null && (
              <>
                <span>·</span>
                <span className="text-ln-op-mute">match {row.matchScore}/100</span>
              </>
            )}
          </p>
          {row.matchWarnings.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm text-ln-op-warn">
              {row.matchWarnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={orgPets.length === 0}
            className="whitespace-nowrap rounded-[4px] bg-ln-op-azul px-3 py-[6px] text-sm font-semibold text-white transition-colors hover:bg-ln-op-azul-700 disabled:opacity-50"
          >
            Proponer tránsito
          </button>
        )}
      </div>

      {open && !okMessage && (
        <div className="border-t border-ln-op-line pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`propose-pet-${row.userId}`}
                className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ln-op-mute"
              >
                Mascota
              </label>
              <select
                id={`propose-pet-${row.userId}`}
                value={petToken}
                onChange={(e) => setPetToken(e.target.value)}
                className="w-full rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-[7px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
              >
                {orgPets.map((p) => (
                  <option key={p.id} value={p.publicToken}>
                    {p.name} ({speciesLabel(p.species)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`propose-duration-${row.userId}`}
                className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ln-op-mute"
              >
                Duración (semanas)
              </label>
              <input
                id={`propose-duration-${row.userId}`}
                type="number"
                min={1}
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-[7px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
              />
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas para el voluntario (opcional)"
            className="w-full rounded-[4px] border border-ln-op-line bg-ln-op-card px-3 py-[7px] text-sm text-ln-op-ink focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
          {error && <output className="block text-sm text-ln-op-danger">{error}</output>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={propose}
              disabled={pending}
              className="rounded-[4px] bg-ln-op-ok px-4 py-[7px] text-sm font-semibold text-white transition-colors disabled:opacity-50"
            >
              {pending ? "Enviando..." : "Enviar propuesta"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="rounded-[4px] border border-ln-op-line px-4 py-[7px] text-sm text-ln-op-ink transition-colors hover:bg-ln-op-stripe"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {okMessage && <output className="block text-sm text-ln-op-ok">{okMessage}</output>}
    </li>
  );
}
