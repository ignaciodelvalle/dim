// Libreta sanitaria export — server-side on-the-fly HTML/PDF (Item 14.3).
//
// Returns a print-ready HTML document that the browser can save as PDF via
// its native print dialog. No headless browser required; no file persisted
// (pet_attachments deferred). Structure mirrors the on-screen libreta:
// identity header → health status summary → sections by type → chronology.
//
// Auth: owner only. Uses the same requirePetAccess guard as pet-tab-data.ts.
// Empty libreta: returns the HTML with an empty-state section (no broken output).
//
// URL: GET /api/mis-mascotas/[publicToken]/libreta-export
// Response: text/html; charset=utf-8, rendered inline (no Content-Disposition —
// this is an HTML print view, not a file download; do not claim a .pdf
// filename for HTML content). The page auto-triggers window.print() so the
// user produces the PDF via the browser's own print-to-PDF, not the server.

import { and, desc, eq, isNull } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db, ownerships, petEvents, pets, profiles } from "@/db";
import {
  LIBRETA_GROUPS,
  LIBRETA_GROUP_LABELS,
  groupLibretaEvents,
  libretaSanitariaClause,
} from "@/lib/infra/libreta-sanitaria";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTimeLegal, sexLabel, speciesLabel } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

function htmlEscape(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatEventLabel(eventType: string): string {
  return eventType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractEventSummary(event: {
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  notes: string | null;
}): string {
  const p = (event.payload ?? {}) as Record<string, unknown>;
  const parts: string[] = [];

  // Vaccine
  if (typeof p.vaccine_name === "string") parts.push(p.vaccine_name);
  if (typeof p.brand === "string") parts.push(`Marca: ${p.brand}`);
  if (typeof p.lot_number === "string") parts.push(`Lote: ${p.lot_number}`);
  if (typeof p.next_due_at === "string") parts.push(`Próx. dosis: ${formatDate(p.next_due_at)}`);

  // Weight
  if (typeof p.weight_kg === "number") parts.push(`${p.weight_kg} kg`);

  // Medication
  if (typeof p.drug_name === "string") parts.push(p.drug_name);
  if (typeof p.dose === "string") parts.push(`Dosis: ${p.dose}`);

  // Vet visit
  if (typeof p.vet_name === "string") parts.push(`Vet: ${p.vet_name}`);
  if (typeof p.clinic_name === "string") parts.push(`Clínica: ${p.clinic_name}`);

  // Notes
  if (event.notes) parts.push(event.notes);

  if (typeof p.reason === "string") parts.push(`Motivo: ${p.reason}`);
  if (typeof p.notes === "string") parts.push(p.notes);

  return parts.join(" · ") || "Sin detalles";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ publicToken: string }> },
) {
  const { publicToken } = await params;

  // Auth: must be authenticated owner of this pet.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  // Verify ownership.
  const [pet] = await db
    .select()
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, user.id),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!pet) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const petRow = pet.pets;

  // Load owner name for the header.
  const [profileRow] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const ownerName = profileRow?.displayName ?? "";

  // Load libreta events.
  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, petRow.id), libretaSanitariaClause()))
    .orderBy(desc(petEvents.occurredAt));

  const grouped = groupLibretaEvents(events);
  const generatedAt = formatDateTimeLegal(new Date());
  const petName = htmlEscape(petRow.name);
  const ownerEsc = htmlEscape(ownerName);

  // Build sections HTML.
  let sectionsHtml = "";
  for (const groupKey of LIBRETA_GROUPS) {
    const groupEvents = grouped[groupKey];
    if (!groupEvents || groupEvents.length === 0) continue;
    const label = htmlEscape(LIBRETA_GROUP_LABELS[groupKey]);
    sectionsHtml += `
      <section class="section">
        <h2 class="section-title">${label}</h2>
        <table class="event-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            ${groupEvents
              .map((e) => {
                const date = formatDate(e.occurredAt);
                const type = htmlEscape(formatEventLabel(e.eventType));
                const detail = htmlEscape(
                  extractEventSummary({
                    eventType: e.eventType,
                    occurredAt: new Date(e.occurredAt),
                    payload: e.payload,
                    notes: e.notes,
                  }),
                );
                return `<tr><td>${date}</td><td>${type}</td><td>${detail}</td></tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </section>`;
  }

  if (!sectionsHtml) {
    sectionsHtml = `
      <section class="section empty-state">
        <p>Esta libreta no tiene eventos registrados aún.</p>
      </section>`;
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Libreta sanitaria — ${petName}</title>
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
    .cover {
      border-bottom: 2px solid #1a2030;
      padding-bottom: 18pt;
      margin-bottom: 24pt;
    }
    .cover h1 {
      font-size: 22pt;
      font-weight: 700;
      margin: 0 0 6pt;
      letter-spacing: -0.02em;
    }
    .cover .meta {
      font-family: 'Courier New', monospace;
      font-size: 9pt;
      color: #4a5568;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-top: 4pt;
    }
    .cover .owner-line {
      margin-top: 8pt;
      font-size: 10pt;
      color: #2d3748;
    }
    .section {
      page-break-inside: avoid;
      margin-bottom: 20pt;
    }
    .section-title {
      font-size: 12pt;
      font-weight: 700;
      border-bottom: 1px solid #cbd5e0;
      padding-bottom: 4pt;
      margin: 0 0 8pt;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-family: 'Courier New', monospace;
      font-size: 9pt;
      color: #2d3748;
    }
    .event-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
    }
    .event-table th {
      text-align: left;
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #718096;
      border-bottom: 1px solid #e2e8f0;
      padding: 4pt 6pt;
    }
    .event-table td {
      padding: 5pt 6pt;
      border-bottom: 1px solid #f0f4f8;
      vertical-align: top;
    }
    .event-table td:first-child {
      white-space: nowrap;
      font-family: 'Courier New', monospace;
      font-size: 9pt;
      color: #4a5568;
      width: 80pt;
    }
    .event-table td:nth-child(2) {
      width: 120pt;
      font-weight: 600;
    }
    .empty-state {
      color: #718096;
      font-style: italic;
      padding: 16pt;
      border: 1px dashed #cbd5e0;
      border-radius: 4pt;
    }
    footer {
      margin-top: 32pt;
      border-top: 1px solid #e2e8f0;
      padding-top: 10pt;
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
      .section { page-break-inside: avoid; }
      a { text-decoration: none; color: inherit; }
    }
  </style>
</head>
<body>
  <header class="cover">
    <div class="meta">Libreta Sanitaria Digital · MiMAR</div>
    <h1>${petName}</h1>
    <div class="meta">${htmlEscape(speciesLabel(petRow.species))} ${petRow.breed ? `· ${htmlEscape(petRow.breed)}` : ""} · ${htmlEscape(sexLabel(petRow.sex))}</div>
    ${ownerEsc ? `<div class="owner-line">Dueño/a: <strong>${ownerEsc}</strong></div>` : ""}
  </header>

  <main>
    ${sectionsHtml}
  </main>

  <footer>
    <span>Generada por MiMAR · ${htmlEscape(generatedAt)}</span>
    <span>Documento no persistido · generado al vuelo</span>
  </footer>

  <script>window.addEventListener('load', () => window.print());</script>
</body>
</html>`;

  // No Content-Disposition: this response is HTML rendered inline for the
  // browser's print-to-PDF flow, not a downloadable file — claiming a
  // ".pdf" filename here would misrepresent the actual content type.
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
