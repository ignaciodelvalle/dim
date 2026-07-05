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
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-[var(--radius-md)] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] p-[22px]"
    >
      <div className="space-y-1.5">
        <label
          htmlFor="code"
          className="block text-xs font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)]"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          Código de seguimiento
        </label>
        <div className="flex gap-2">
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
            className="flex-1 min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3 py-2.5 text-sm tracking-wide text-[var(--color-ln-ink)] placeholder:text-[var(--color-ln-faint)] outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
            style={{ fontFamily: "var(--font-ln-mono)" }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            className="flex-shrink-0 rounded-[var(--radius-sm)] bg-[var(--color-ln-azul)] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[var(--color-ln-azul-700)] transition-colors"
          >
            Buscar
          </button>
        </div>
        {error && (
          <p className="text-sm text-[var(--color-ln-seal)]" role="alert">
            {error}
          </p>
        )}
        <p
          className="text-[10.5px] text-[var(--color-ln-mute)]"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          Formato: DEN-XXXX-XXXX · pegalo tal cual te lo enviamos.
        </p>
      </div>
    </form>
  );
}
