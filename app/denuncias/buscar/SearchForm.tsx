"use client";

import {
  isValidReferenceCodeFormat,
  normalizeReferenceCode,
} from "@/src/modules/welfare/domain/reference-code";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = normalizeReferenceCode(value);
    if (!isValidReferenceCodeFormat(code)) {
      setError("Código inválido. El formato es DEN-XXXX-XXXX.");
      return;
    }
    setError(null);
    router.push(`/denuncias/codigo/${code}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="code" className="block text-sm font-medium text-gob-text-gray">
          Código de seguimiento
        </label>
        <input
          id="code"
          name="code"
          type="text"
          placeholder="DEN-XXXX-XXXX"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          className="w-full rounded-lg border border-gob-border-strong bg-white px-3 py-2.5 text-sm font-mono tracking-wide text-gob-text placeholder:text-gob-text-muted focus:outline-none focus:ring-2 focus:ring-gob-primary"
          autoComplete="off"
          spellCheck={false}
        />
        {error && <p className="text-sm text-gob-danger">{error}</p>}
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-gob-primary text-white text-sm font-medium py-2.5 hover:opacity-90 transition-colors"
      >
        Buscar
      </button>
    </form>
  );
}
