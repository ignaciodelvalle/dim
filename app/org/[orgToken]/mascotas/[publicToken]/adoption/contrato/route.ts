// Printable adoption contract — server-side on-the-fly HTML (org-pilot-pack
// Req 3, design D10). Libreta-export pattern: print-ready HTML rendered
// inline, no headless browser, NOTHING persisted — printing is a stateless
// read, so an abandoned finalize flow leaves no event, no row, no side-effect
// to reconcile (spec 3.5). A re-print regenerates from current state.
//
// POST only, on purpose: the adopter DNI travels in the request BODY, never in
// a query string, so it cannot land in URLs, browser history, or access logs
// (no PII in URL — cross-cutting invariant). The trigger is a sibling
// <form method="post" target="_blank"> in FinalizeAdoptionForm, enabled only
// after the pre-submit account check succeeds.
//
// Auth: same tier as finalizeAdoptionAction — `adoption.finalize` capability
// pinned to the URL org (requireCapabilityForOrgToken composes the org-access
// + capability guard and returns an error instead of throwing, which is what a
// route handler needs) + the pet must be under this org's active
// shelter_custody (AdoptionRepository.findShelterPet). NOT a public route.
//
// The terms block ships as a VISIBLY MARKED draft placeholder (spec 3.4 — PO
// gate). Do NOT replace it with real legal language without explicit PO
// sign-off; that is a separate gate, not an implementation detail.

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, petIdentifications } from "@/db";
import { formatDate, formatDateTimeLegal, sexLabel, speciesLabel } from "@/lib/utils/format";
import { AdoptionRepository } from "@/src/modules/adoption/infrastructure/adoption-repository";
import { requireCapabilityForOrgToken } from "@/src/modules/organizations/infrastructure/authz-resolver";

export const dynamic = "force-dynamic";

// PO-gated placeholder (design D10 wording — supersedes the spec's
// illustrative example). The integration test asserts this literal verbatim:
// changing it is a PO decision, not a refactor. (Not exported — route.ts
// modules only admit Next's route exports.)
const CONTRACT_TERMS_PLACEHOLDER = "TEXTO LEGAL PENDIENTE DE APROBACIÓN — BORRADOR";

function htmlEscape(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgToken: string; publicToken: string }> },
) {
  const { orgToken, publicToken } = await params;

  const auth = await requireCapabilityForOrgToken("adoption.finalize", orgToken);
  if (auth.error !== null) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const { organization } = auth;

  // Custody gate: the pet must be under THIS org's active shelter custody.
  const pet = await AdoptionRepository.findShelterPet(publicToken, organization.id);
  if (!pet) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const formData = await req.formData();
  const adopterDni = String(formData.get("adopterDni") ?? "").replace(/\D/g, "");
  const followupRaw = String(formData.get("followupMonths") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const followupMonths = followupRaw
    ? Math.min(36, Math.max(0, Number.parseInt(followupRaw, 10) || 0))
    : null;

  if (!/^\d{7,9}$/.test(adopterDni)) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  // Re-resolve the adopter server-side (never trust the form's found-state):
  // same registered-account contract as finalize — dniHash match + auth.users
  // row EXISTS. No match → 404-style refusal, nothing rendered.
  const account = await AdoptionRepository.findAdopterAccountByDni(adopterDni);
  if (!account || !account.hasAuthAccount) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  // Chip (if any) from the canonical identifications table. Auth-gated
  // surface — same visibility tier as the org pet detail (never public).
  const [chipRow] = await db
    .select({ code: petIdentifications.code })
    .from(petIdentifications)
    .where(
      and(
        eq(petIdentifications.petId, pet.id),
        eq(petIdentifications.kind, "microchip_iso"),
        eq(petIdentifications.status, "active"),
      ),
    )
    .limit(1);

  const generatedAt = formatDateTimeLegal(new Date());
  const orgName = htmlEscape(organization.displayName);
  const adopterName = htmlEscape(account.displayName);
  const petName = htmlEscape(pet.name);

  const followupClause =
    followupMonths !== null && followupMonths > 0
      ? `<p>La organización realizará un seguimiento post-adopción durante <strong>${followupMonths} ${followupMonths === 1 ? "mes" : "meses"}</strong>, con puntos de contacto acordados entre las partes.</p>`
      : "";

  const notesClause = notes
    ? `<section class="block">
        <h2>Observaciones</h2>
        <p>${htmlEscape(notes)}</p>
      </section>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Contrato de adopción — ${petName}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      color: #1a2030;
      background: #fff;
      margin: 0;
      padding: 2cm 2.5cm;
    }
    .draft-banner {
      border: 2px solid #b45309;
      background: #fef3c7;
      color: #92400e;
      font-family: 'Courier New', monospace;
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: center;
      padding: 8pt;
      margin-bottom: 18pt;
    }
    .cover {
      border-bottom: 2px solid #1a2030;
      padding-bottom: 14pt;
      margin-bottom: 20pt;
    }
    .cover h1 { font-size: 20pt; font-weight: 700; margin: 0 0 4pt; letter-spacing: -0.02em; }
    .cover .meta {
      font-family: 'Courier New', monospace;
      font-size: 9pt;
      color: #4a5568;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .block { page-break-inside: avoid; margin-bottom: 16pt; }
    .block h2 {
      font-family: 'Courier New', monospace;
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #2d3748;
      border-bottom: 1px solid #cbd5e0;
      padding-bottom: 3pt;
      margin: 0 0 6pt;
    }
    dl { margin: 0; display: grid; grid-template-columns: 120pt 1fr; row-gap: 3pt; }
    dt { color: #718096; font-size: 10pt; }
    dd { margin: 0; font-size: 10.5pt; }
    .terms-placeholder {
      border: 2px dashed #b45309;
      background: #fffbeb;
      color: #92400e;
      font-family: 'Courier New', monospace;
      font-size: 11pt;
      font-weight: 700;
      text-align: center;
      padding: 22pt 12pt;
      letter-spacing: 0.05em;
    }
    .signatures {
      display: flex;
      justify-content: space-between;
      gap: 40pt;
      margin-top: 48pt;
    }
    .signatures .line {
      flex: 1;
      border-top: 1px solid #1a2030;
      padding-top: 4pt;
      font-size: 9pt;
      color: #4a5568;
      text-align: center;
    }
    footer {
      margin-top: 28pt;
      border-top: 1px solid #e2e8f0;
      padding-top: 8pt;
      font-family: 'Courier New', monospace;
      font-size: 7.5pt;
      color: #a0aec0;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      display: flex;
      justify-content: space-between;
    }
    @media print {
      body { padding: 1.5cm 2cm; }
      .draft-banner, .terms-placeholder { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="draft-banner">Borrador — pendiente de revisión legal</div>

  <header class="cover">
    <div class="meta">Contrato de adopción · miMAR</div>
    <h1>Contrato de adopción</h1>
    <div class="meta">Generado el ${htmlEscape(generatedAt)}</div>
  </header>

  <section class="block">
    <h2>Organización</h2>
    <dl>
      <dt>Nombre</dt><dd>${orgName}</dd>
      <dt>Identificador</dt><dd>${htmlEscape(organization.publicToken)}</dd>
    </dl>
  </section>

  <section class="block">
    <h2>Adoptante</h2>
    <dl>
      <dt>Nombre</dt><dd>${adopterName}</dd>
      <dt>DNI</dt><dd>${htmlEscape(adopterDni)}</dd>
    </dl>
  </section>

  <section class="block">
    <h2>Mascota</h2>
    <dl>
      <dt>Nombre</dt><dd>${petName}</dd>
      <dt>Especie</dt><dd>${htmlEscape(speciesLabel(pet.species))}</dd>
      <dt>Sexo</dt><dd>${htmlEscape(sexLabel(pet.sex))}</dd>
      ${pet.breed ? `<dt>Raza</dt><dd>${htmlEscape(pet.breed)}</dd>` : ""}
      <dt>Credencial</dt><dd>${htmlEscape(pet.publicToken)}</dd>
      ${chipRow?.code ? `<dt>Microchip</dt><dd>${htmlEscape(chipRow.code)}</dd>` : ""}
      ${pet.dateOfBirth ? `<dt>Nacimiento</dt><dd>${htmlEscape(formatDate(pet.dateOfBirth))}${pet.birthDateIsEstimated ? " (estimado)" : ""}</dd>` : ""}
    </dl>
  </section>

  <section class="block">
    <h2>Seguimiento</h2>
    ${followupClause || "<p>Sin seguimiento post-adopción acordado.</p>"}
  </section>

  ${notesClause}

  <section class="block">
    <h2>Términos y cláusulas</h2>
    <div class="terms-placeholder">${htmlEscape(CONTRACT_TERMS_PLACEHOLDER)}</div>
  </section>

  <div class="signatures">
    <div class="line">Firma por ${orgName}</div>
    <div class="line">Firma de ${adopterName}</div>
  </div>

  <footer>
    <span>Generado por miMAR · ${htmlEscape(generatedAt)}</span>
    <span>Documento no persistido · generado al vuelo</span>
  </footer>

  <script>window.addEventListener('load', () => window.print());</script>
</body>
</html>`;

  // Inline HTML for the browser's print-to-PDF flow — no Content-Disposition,
  // no ".pdf" filename claim (libreta-export contract).
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
