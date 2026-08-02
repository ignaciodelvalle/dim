"use client";

// Client component for the create-govt form.
// On success, renders MagicLinkResultPanel instead of redirecting.

import { useRef, useState } from "react";

import { createInstitutionalAccountAction } from "@/app/actions/admin-institutional";
import { MagicLinkResultPanel } from "@/app/admin/_components/MagicLinkResultPanel";
import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";
import { OpButton } from "@/components/ui/dashboard";
import { notifySaved } from "@/lib/ui/action-feedback";

// One row per assigned locality. provinceName is the canonical display
// name from ar_provincias (resolved via LocalityPickerAcross), passed to
// the server action verbatim.
type LocalityEntry = {
  id: number;
  provinceName: string;
  locality: string;
};

type SuccessState = {
  profileId: string;
  magicLink: string;
  displayName: string;
  email: string;
};

export function CreateGovtForm() {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localities, setLocalities] = useState<LocalityEntry[]>([
    { id: 0, provinceName: "", locality: "" },
  ]);
  const nextId = useRef(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  function addLocality() {
    const id = nextId.current;
    nextId.current += 1;
    setLocalities((prev) => [...prev, { id, provinceName: "", locality: "" }]);
  }

  function removeLocality(id: number) {
    setLocalities((prev) => prev.filter((l) => l.id !== id));
  }

  function setLocalityPick(id: number, provinceName: string, locality: string) {
    setLocalities((prev) => prev.map((l) => (l.id === id ? { ...l, provinceName, locality } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const validLocalities = localities
      .filter((l) => l.provinceName && l.locality.trim())
      .map(({ provinceName, locality }) => ({
        province: provinceName,
        locality,
      }));

    try {
      const result = await createInstitutionalAccountAction({
        role: "govt",
        email: email.trim(),
        displayName: displayName.trim(),
        initialLocalities: validLocalities,
      });

      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess({
          profileId: result.profileId,
          magicLink: result.magicLink,
          displayName: displayName.trim(),
          email: email.trim(),
        });
        notifySaved("Cuenta de gobierno creada");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleCreateAnother() {
    setSuccess(null);
    setEmail("");
    setDisplayName("");
    setLocalities([{ id: 0, provinceName: "", locality: "" }]);
    nextId.current = 1;
    setError(null);
  }

  if (success) {
    return (
      <MagicLinkResultPanel
        magicLink={success.magicLink}
        displayName={success.displayName}
        email={success.email}
        profileId={success.profileId}
        detailPath={`/admin/govts/${success.profileId}`}
        variant="create"
        onCreateAnother={handleCreateAnother}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ln-op-ink-2 mb-1">
            Email{" "}
            <span className="text-ln-op-danger" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operador@municipio.gob.ar"
            className="w-full text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>

        <div>
          <label htmlFor="displayName" className="block text-sm font-medium text-ln-op-ink-2 mb-1">
            Nombre de display{" "}
            <span className="text-ln-op-danger" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Municipalidad de La Plata"
            maxLength={100}
            className="w-full text-[13px] rounded-[var(--radius-md)] border border-ln-op-line bg-ln-op-card px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ln-op-azul"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="block text-sm font-medium text-ln-op-ink-2">Localidades iniciales</p>
            <button
              type="button"
              onClick={addLocality}
              className="text-sm text-ln-op-azul hover:text-ln-op-azul-700 underline underline-offset-4"
            >
              + Agregar localidad
            </button>
          </div>
          <p className="text-sm text-ln-op-mute mb-3">
            Opcional. Se pueden asignar más localidades luego desde la página del operador.
          </p>
          <div className="space-y-2">
            {localities.map((l) => (
              <div key={l.id} className="flex gap-2 items-start">
                <div className="flex-1">
                  <LocalityPickerAcross
                    defaultValue={{
                      provinceName: l.provinceName || null,
                      localityName: l.locality || null,
                    }}
                    onSelect={(r) =>
                      setLocalityPick(l.id, r?.provinceName ?? "", r?.localityName ?? "")
                    }
                  />
                </div>
                {localities.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLocality(l.id)}
                    className="text-ln-op-mute hover:text-ln-op-danger text-sm px-2 py-2"
                    aria-label="Quitar localidad"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius-md)] bg-ln-op-danger-bg border border-ln-op-danger-bd px-4 py-3">
          <p className="text-[13px] text-ln-op-danger">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <OpButton type="submit" disabled={loading} loading={loading} variant="primary">
          {loading ? "Creando..." : "Crear cuenta de gobierno"}
        </OpButton>
        {/* Straight to the hub tab (privileged-accounts fusion 2026-08-02) —
            /admin/govts is redirect-only now, no reason to pay the hop. */}
        <a
          href="/admin/cuentas?registro=govts"
          className="px-5 py-2 text-[13px] border border-ln-op-line rounded-[var(--radius-md)] hover:bg-ln-op-stripe"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
