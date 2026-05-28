"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { proposeFosterAction } from "@/app/actions/foster-proposals";

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
    <li className="rounded-lg border border-gob-border-strong  p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium text-gob-text ">{row.displayName}</p>
          <p className="text-xs text-gob-text-muted space-x-2">
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
                <span className="text-gob-text-gray ">match {row.matchScore}/100</span>
              </>
            )}
          </p>
          {row.matchWarnings.length > 0 && (
            <ul className="text-xs text-gob-warning-text  space-y-0.5 mt-1">
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
            className="px-3 py-1.5 rounded-lg bg-gob-primary  text-white  text-sm font-medium hover:bg-gob-primary disabled:opacity-50 whitespace-nowrap"
          >
            Proponer tránsito
          </button>
        )}
      </div>

      {open && !okMessage && (
        <div className="border-t border-gob-border  pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor={`propose-pet-${row.userId}`}
                className="block text-xs text-gob-text-muted mb-1"
              >
                Mascota
              </label>
              <select
                id={`propose-pet-${row.userId}`}
                value={petToken}
                onChange={(e) => setPetToken(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
              >
                {orgPets.map((p) => (
                  <option key={p.id} value={p.publicToken}>
                    {p.name} ({p.species})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor={`propose-duration-${row.userId}`}
                className="block text-xs text-gob-text-muted mb-1"
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
                className="w-full px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
              />
            </div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Notas para el voluntario (opcional)"
            className="w-full px-3 py-2 rounded-lg border border-gob-border-strong  bg-white  text-sm"
          />
          {error && <output className="block text-sm text-gob-danger ">{error}</output>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={propose}
              disabled={pending}
              className="px-4 py-2 rounded-lg bg-gob-success text-white text-sm font-medium hover:bg-gob-success disabled:opacity-50"
            >
              {pending ? "Enviando..." : "Enviar propuesta"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="px-4 py-2 rounded-lg border border-gob-border-strong  text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {okMessage && <output className="block text-sm text-gob-success ">{okMessage}</output>}
    </li>
  );
}
