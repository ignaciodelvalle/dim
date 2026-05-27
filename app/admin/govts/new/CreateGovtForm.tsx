"use client";

// Client component for the create-govt form.
// On success, renders MagicLinkResultPanel instead of redirecting.

import { useRef, useState } from "react";

import { createInstitutionalAccountAction } from "@/app/actions/admin-institutional";
import { MagicLinkResultPanel } from "@/app/admin/_components/MagicLinkResultPanel";
import { LocalityCombobox } from "@/components/LocalityCombobox";
import { PROVINCES } from "@/lib/ar-provincias";

// `provinceCode` is the ISO 3166-2:AR code (e.g. "AR-C"). The display name
// is computed via PROVINCES at submit time; the combobox reads provinceCode
// to scope its search.
type LocalityEntry = { id: number; provinceCode: string; locality: string };

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
    { id: 0, provinceCode: "", locality: "" },
  ]);
  const nextId = useRef(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  function addLocality() {
    const id = nextId.current;
    nextId.current += 1;
    setLocalities((prev) => [...prev, { id, provinceCode: "", locality: "" }]);
  }

  function removeLocality(id: number) {
    setLocalities((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLocality(id: number, field: "provinceCode" | "locality", value: string) {
    setLocalities((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        // When the province changes, drop the locally-staged locality so the
        // combobox starts clean under the new scope.
        if (field === "provinceCode") return { ...l, provinceCode: value, locality: "" };
        return { ...l, [field]: value };
      }),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const validLocalities = localities
      .filter((l) => l.provinceCode && l.locality.trim())
      .map(({ provinceCode, locality }) => ({
        province: PROVINCES.find((p) => p.code === provinceCode)?.name ?? provinceCode,
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
    setLocalities([{ id: 0, provinceCode: "", locality: "" }]);
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
        onCreateAnother={handleCreateAnother}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gob-text-gray mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operador@municipio.gob.ar"
            className="w-full text-sm rounded-md border border-gob-border-strong bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>

        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-gob-text-gray mb-1"
          >
            Nombre de display
          </label>
          <input
            id="displayName"
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Municipalidad de La Plata"
            maxLength={100}
            className="w-full text-sm rounded-md border border-gob-border-strong bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="block text-sm font-medium text-gob-text-gray">Localidades iniciales</p>
            <button
              type="button"
              onClick={addLocality}
              className="text-xs text-neutral-500 hover:text-gob-text-gray underline underline-offset-4"
            >
              + Agregar localidad
            </button>
          </div>
          <p className="text-xs text-gob-text-muted mb-3">
            Opcional. Se pueden asignar mas localidades luego desde la pagina del operador.
          </p>
          <div className="space-y-2">
            {localities.map((l) => (
              <div key={l.id} className="flex gap-2 items-start">
                <select
                  value={l.provinceCode}
                  onChange={(e) => updateLocality(l.id, "provinceCode", e.target.value)}
                  className="flex-1 text-sm rounded-md border border-gob-border-strong bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  aria-label="Provincia"
                >
                  <option value="">Elegí provincia</option>
                  {PROVINCES.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="flex-1">
                  <LocalityCombobox
                    provinceCode={l.provinceCode || null}
                    defaultValue={{ localityName: l.locality }}
                    name={`createGovtLocality-${l.id}`}
                    onSelect={(r) => updateLocality(l.id, "locality", r?.localityName ?? "")}
                  />
                </div>
                {localities.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLocality(l.id)}
                    className="text-neutral-400 hover:text-red-600 text-sm px-2 py-2"
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
        <div className="rounded-md bg-gob-danger/10 border border-red-200 px-4 py-3">
          <p className="text-sm text-gob-danger">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm bg-gob-primary text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creando..." : "Crear cuenta govt"}
        </button>
        <a
          href="/admin/govts"
          className="px-5 py-2 text-sm border border-gob-border-strong rounded-md hover:bg-gob-surface-alt"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
