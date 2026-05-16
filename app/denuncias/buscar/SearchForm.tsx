"use client";

import { isValidReferenceCodeFormat, normalizeReferenceCode } from "@/lib/welfare-codes";
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
        <label
          htmlFor="code"
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
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
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2.5 text-sm font-mono tracking-wide text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-50"
          autoComplete="off"
          spellCheck={false}
        />
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 text-sm font-medium py-2.5 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
      >
        Buscar
      </button>
    </form>
  );
}
