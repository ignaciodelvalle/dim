"use client";

import { Icon, type IconName, iconNames } from "@/components/Icon";
import { useMemo, useState } from "react";

/**
 * Buscador client-side sobre los 852 íconos de icono-arg.
 * Filtra por substring del nombre. Sin debounce — el filtro es local y rápido.
 */
export function IconSearch() {
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const results = useMemo<IconName[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return iconNames.slice(0, 60);
    return iconNames.filter((n) => n.toLowerCase().includes(q)).slice(0, 120);
  }, [query]);

  async function copy(name: string) {
    try {
      await navigator.clipboard.writeText(`<Icon name="${name}" />`);
      setCopied(name);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <label htmlFor="icon-search" className="block text-sm text-gob-text-muted mb-2">
        Buscar entre {iconNames.length} íconos icono-arg
      </label>
      <input
        id="icon-search"
        type="search"
        placeholder="ej: vacuna, hospital, marcador…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-md rounded-md border-2 border-gob-border px-4 py-2 text-base focus:border-gob-primary"
      />
      <p className="mt-2 text-sm text-gob-text-muted">
        {query
          ? `${results.length} resultado${results.length === 1 ? "" : "s"}`
          : `Mostrando los primeros 60 (de ${iconNames.length})`}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
        {results.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => copy(name)}
            className="flex flex-col items-center gap-2 rounded-md border border-gob-border p-3 text-left transition-colors hover:border-gob-primary"
            title={`Copiar <Icon name="${name}" />`}
          >
            <Icon name={name} size={28} color="var(--color-gob-primary)" />
            <code className="block w-full truncate text-xs text-gob-text-gray">{name}</code>
            <span
              className="block text-[10px] text-gob-success"
              style={{ opacity: copied === name ? 1 : 0, transition: "opacity 150ms" }}
            >
              copiado
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
