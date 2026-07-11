// Unit test for MapDataTable's pure CSV builder — the client-side "Descargar
// CSV" path (no endpoint). Verifies the header, RFC-4180 field escaping, and
// that a k-anon-protected cell is emitted as text, never a number.

import { describe, expect, it } from "vitest";

import { type MapTableRow, buildMapTableCsv } from "../MapDataTable";

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
});
