// Unit test for MapDataTable's pure CSV builder — the client-side "Descargar
// CSV" path (no endpoint). Verifies the header, RFC-4180 field escaping, and
// that a k-anon-protected cell is emitted as text, never a number.

import { describe, expect, it } from "vitest";

import { type MapTableRow, buildMapTableCsv, mapTableValueHeader } from "../MapDataTable";

describe("buildMapTableCsv", () => {
  it("emits a header and one line per row (CRLF separated)", () => {
    const rows: MapTableRow[] = [
      { layer: "Perdidas", unit: "Salta", value: "1.234" },
      { layer: "Cobertura antirrábica", unit: "Jujuy", value: "64,4%" },
    ];
    const csv = buildMapTableCsv(rows);
    // "64,4%" contains a comma → RFC-4180 quoting kicks in for that field.
    expect(csv).toBe(
      'Capa,Unidad,Valor\r\nPerdidas,Salta,1.234\r\nCobertura antirrábica,Jujuy,"64,4%"',
    );
  });

  it("keeps a k-anon protected cell as text, never a number", () => {
    const csv = buildMapTableCsv([
      { layer: "Denuncias", unit: "Localidad X", value: "Protegido (k<5)" },
    ]);
    expect(csv).toContain("Protegido (k<5)");
  });

  it("quotes and escapes a field containing a comma or quote", () => {
    const csv = buildMapTableCsv([{ layer: 'A "special", layer', unit: "U", value: "1" }]);
    expect(csv).toBe('Capa,Unidad,Valor\r\n"A ""special"", layer",U,1');
  });

  it("returns a header-only document for no rows", () => {
    expect(buildMapTableCsv([])).toBe("Capa,Unidad,Valor");
  });

  it("appends a truncation comment line per capped layer (honest exports)", () => {
    const csv = buildMapTableCsv(
      [
        { layer: "Perdidas", unit: "Salta", value: "1.234" },
        { layer: "Denuncias", unit: "Salta", value: "12" },
      ],
      ["Perdidas", "Denuncias"],
    );
    const lines = csv.split("\r\n");
    expect(lines[lines.length - 2]).toBe(
      "# Capa Perdidas truncada: mostrando los 2000 registros más recientes",
    );
    expect(lines[lines.length - 1]).toBe(
      "# Capa Denuncias truncada: mostrando los 2000 registros más recientes",
    );
  });

  it("appends no comment lines when no layer is truncated (default)", () => {
    const csv = buildMapTableCsv([{ layer: "Perdidas", unit: "Salta", value: "1.234" }]);
    expect(csv).not.toContain("truncada");
  });
});

describe("mapTableValueHeader (cowork QA ronda 3 §3 — name the Valor column)", () => {
  it("names a rate metric as a percentage at PROVINCE grain", () => {
    expect(
      mapTableValueHeader([
        { label: "Cobertura antirrábica", dataType: "rate", level: "province" },
      ]),
    ).toBe("Cobertura antirrábica (%)");
  });

  it("names a rate metric as a COUNT at locality grain — never a false %", () => {
    // At locality grain the repository returns a per-unit count (rate-by-locality
    // deferred). The "204%" bug came from labeling that count as a percentage.
    expect(
      mapTableValueHeader([
        { label: "Cobertura antirrábica", dataType: "rate", level: "locality" },
      ]),
    ).toBe("Cobertura antirrábica (conteo)");
  });

  it("names density/signal metrics as a count", () => {
    expect(mapTableValueHeader([{ label: "Zoonosis / señales", dataType: "signal" }])).toBe(
      "Zoonosis / señales (conteo)",
    );
  });

  it("stays a generic 'Valor' when several metrics interleave", () => {
    expect(
      mapTableValueHeader([
        { label: "Cobertura antirrábica", dataType: "rate", level: "locality" },
        { label: "Zoonosis / señales", dataType: "signal" },
      ]),
    ).toBe("Valor");
  });
});
