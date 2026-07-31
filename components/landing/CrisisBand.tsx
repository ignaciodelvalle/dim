"use client";

// Crisis fork (benchmark L1) — the anonymous visitor in crisis is the
// highest-value visitor: Perdí / Encontré + a no-login code lookup.
//
// Lookup accepts ONLY (PO-locked decision #2):
//   - a pet public token (DIM-XXXX-XXXX)   → /p/[publicToken]
//   - a denuncia tracking code (DEN-XXXX-XXXX) → /denuncias/codigo/[code]
// The 15-digit ISO chip is intentionally NOT accepted nor advertised.

import { Icon } from "@/components/Icon";
import { LnInput } from "@/components/ui/Field";
import {
  isValidReferenceCodeFormat,
  normalizeReferenceCode,
} from "@/src/modules/welfare/domain/reference-code";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CrisisBand() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) {
      setError("Ingresá un código para buscar.");
      return;
    }
    const normalized = normalizeReferenceCode(raw);
    if (normalized.startsWith("DEN-")) {
      if (!isValidReferenceCodeFormat(normalized)) {
        setError("El código de denuncia tiene el formato DEN-XXXX-XXXX.");
        return;
      }
      setError(null);
      router.push(`/denuncias/codigo/${normalized}`);
      return;
    }
    // Anything else is treated as a pet public token — /p/ resolves or 404s
    // with its own friendly screen.
    setError(null);
    router.push(`/p/${encodeURIComponent(raw.toUpperCase())}`);
  }

  return (
    <section className="lp-crisis" aria-label="Emergencias — sin cuenta" data-section="crisis-band">
      <div className="lp-wrap-wide lp-crisis-grid">
        {/* Owner job ("activá el modo perdido") lands on the owner's pets, not
            the finder board — /mis-mascotas preserves the destination through
            the auth flow (cursor citizen UX P2, verified 2026-07-24). */}
        <Link className="lp-crisis-card" data-t="perdi" href="/mis-mascotas">
          <span className="lp-cic" aria-hidden="true">
            <Icon name="perdida" size="md" decorative />
          </span>
          <span>
            <b>Perdí una mascota</b>
            <span className="lp-crisis-sub">Activá el modo perdido y alertá a los vecinos.</span>
          </span>
          <span className="lp-ar" aria-hidden="true">
            →
          </span>
        </Link>
        <Link className="lp-crisis-card" data-t="encontre" href="/perdidas">
          <span className="lp-cic" aria-hidden="true">
            <Icon name="qr" size="md" decorative />
          </span>
          <span>
            <b>Encontré una mascota</b>
            <span className="lp-crisis-sub">Escaneá su QR o buscala por señas. Sin cuenta.</span>
          </span>
          <span className="lp-ar" aria-hidden="true">
            →
          </span>
        </Link>
        <form className="lp-crisis-lookup" onSubmit={handleSubmit}>
          <label htmlFor="crisis-code">¿Tenés un código?</label>
          <div className="lp-crisis-row">
            <LnInput
              id="crisis-code"
              mono
              placeholder="DIM-XXXX-XXXX · DEN-XXXX-XXXX"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              autoComplete="off"
              spellCheck={false}
              invalid={!!error}
            />
            <button type="submit" className="lp-btn lp-btn--primary lp-btn--compact">
              Buscar
            </button>
          </div>
          {error ? (
            <p className="text-sm text-[var(--color-ln-seal)]" role="alert">
              {error}
            </p>
          ) : (
            <span className="lp-crisis-hint">
              Credencial pública o seguimiento de denuncia — sin login.
            </span>
          )}
        </form>
      </div>
    </section>
  );
}
