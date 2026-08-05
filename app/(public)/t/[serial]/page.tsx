// Public physical-tag resolver — /t/[serial] (physical-tag-lifecycle).
//
// The QR engraved on a chapa encodes this URL. Behavior per state (spec):
//
//   active       → redirect() to /p/[publicToken] (Next emits 307; the /p/
//                  page runs its own ScanLogger + soft-delete handling)
//   unactivated  → 200 neutral page: ZERO pet info, activation CTA
//   revoked      → 200 honest page: ZERO pet info, NO reason disclosed
//   unknown      → 404 (serial space is 31^8 — enumeration infeasible)
//
// PRIVACY CONTRACT (AGENTS.md #privacidad-y-manejo-de-datos): the only data
// this page can render is the tag STATUS. lookupTagBySerial projects
// {status, publicToken} and nothing else — no pet name, no owner field, no
// activation_code_hash — so a leak here is impossible by construction.
//
// Jurisdiction gating (design D6): this route is NEVER gated by the
// engraved_plate business rule. A shipped tag must keep resolving even if the
// jurisdiction later disables the distribution channel.

import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { lookupTagBySerial, normalizeTagSerial } from "@/lib/infra/tag-lookup";

// Reads live tag state on every hit — never statically cache.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ serial: string }>;
}

async function callerIpFromHeaders(): Promise<string> {
  try {
    const reqHeaders = await headers();
    return callerIp(reqHeaders);
  } catch {
    return "unknown";
  }
}

// Soft throttle notice — mirrors /casos/[publicCode] and /p/[publicToken].
function TagThrottleNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-ln-paper)]">
      <div className="mx-auto max-w-[400px] px-6 py-12 text-center text-[var(--color-ln-ink)]">
        <p className="mb-3 text-lg font-semibold" style={{ fontFamily: "var(--font-ln-serif)" }}>
          Demasiadas consultas
        </p>
        <p className="text-md leading-[1.6] text-[var(--color-ln-ink-2)]">
          Estás realizando demasiadas consultas desde esta conexión. Esperá unos minutos y volvé a
          intentarlo.
        </p>
      </div>
    </div>
  );
}

function TagStatusShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-ln-paper)]">
      <div className="mx-auto max-w-[440px] px-6 py-12 text-center text-[var(--color-ln-ink)]">
        <p className="mb-3 text-lg font-semibold" style={{ fontFamily: "var(--font-ln-serif)" }}>
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

export default async function TagResolverPage({ params }: PageProps) {
  const { serial: rawSerial } = await params;
  const serial = normalizeTagSerial(decodeURIComponent(rawSerial ?? ""));

  // Per-IP budget BEFORE the DB read — an anonymous caller must not drive
  // unbounded lookups by hammering serials.
  const ip = await callerIpFromHeaders();
  try {
    await enforceRateLimit("tag_resolve", ip, { maxPerMinute: 100 });
  } catch (err) {
    if (err instanceof RateLimitError) return <TagThrottleNotice />;
    throw err;
  }

  const tag = await lookupTagBySerial(serial);

  // Unknown serial → 404. No "does this serial exist" oracle beyond the 404
  // itself, which the 31^8 serial space makes useless for enumeration.
  if (!tag) notFound();

  // Active → the pet IS the credential (invariant #1): hand off to the public
  // credential page. Next's redirect() emits 307 (GET-preserving) — design D7.
  if (tag.status === "active" && tag.publicToken) {
    redirect(`/p/${tag.publicToken}`);
  }

  if (tag.status === "revoked") {
    // Honest page: the tag was deliberately taken out of service. ZERO pet
    // info, NO reason disclosed (the reason lives in the owner's event log).
    return (
      <TagStatusShell title="Esta chapa fue dada de baja">
        <p className="text-md leading-[1.6] text-[var(--color-ln-ink-2)]">
          El QR de esta chapa ya no está vinculado a ninguna credencial. Si encontraste una mascota
          con esta chapa, buscá otros datos de contacto en el collar o acercala a una veterinaria
          para leer su microchip.
        </p>
      </TagStatusShell>
    );
  }

  // Unactivated (or active with a pet missing its token — impossible by the
  // state machine, but fall through neutrally rather than 500): neutral page,
  // zero pet info, activation CTA for the owner who just unwrapped it.
  return (
    <TagStatusShell title="Esta chapa todavía no fue activada">
      <p className="text-md leading-[1.6] text-[var(--color-ln-ink-2)]">
        Si es tuya, activala con el código que viene impreso en el envoltorio para vincularla a la
        credencial de tu mascota.
      </p>
      <Link
        href={`/cuenta/chapas/activar?serial=${encodeURIComponent(serial)}`}
        className="mt-6 inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-ln-azul)] px-5 py-2.5 text-sm font-semibold text-white no-underline hover:bg-[var(--color-ln-azul-700)]"
      >
        Activar esta chapa
      </Link>
    </TagStatusShell>
  );
}
