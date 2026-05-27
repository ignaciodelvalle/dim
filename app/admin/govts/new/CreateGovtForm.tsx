"use client";

// Client component for the create-govt form.
// On success, renders MagicLinkResultPanel instead of redirecting.

import { useRef, useState } from "react";

import { createInstitutionalAccountAction } from "@/app/actions/admin-institutional";
import { MagicLinkResultPanel } from "@/app/admin/_components/MagicLinkResultPanel";
import { LocalityPickerAcross } from "@/components/LocalityPickerAcross";

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
        onCreateAnother={handleCreateAnother}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="operador@municipio.gob.ar"
            className="w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50"
          />
        </div>

        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
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
            className="w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Localidades iniciales
            </p>
            <button
              type="button"
              onClick={addLocality}
              className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline underline-offset-4"
            >
              + Agregar localidad
            </button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mb-3">
            Opcional. Se pueden asignar mas localidades luego desde la pagina del operador.
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
                    className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400 text-sm px-2 py-2"
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
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-4 py-3">
          <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creando..." : "Crear cuenta govt"}
        </button>
        <a
          href="/admin/govts"
          className="px-5 py-2 text-sm border border-neutral-300 dark:border-neutral-700 rounded-md hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
