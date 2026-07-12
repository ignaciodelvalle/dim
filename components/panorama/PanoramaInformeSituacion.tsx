"use client";

// PanoramaInformeSituacion — the print-ready operator briefing (task #55).
//
// Renders the pure InformeModel (panorama-informe.ts) as a self-contained,
// print-only document that captures the CURRENT panorama view as a shareable /
// attachable artifact a funcionario can hand to a colleague to justify a
// decision. It reuses the SAME lightweight print plumbing as the denuncia
// comprobante (DescargarComprobante): a scoped `@media print` stylesheet plus
// deferPrint() → window.print(), which produces a PDF on every browser's
// print-to-PDF path. NO heavy PDF lib (html-to-image / html2canvas are not in
// this project); NO new data fetch — the console already has every number.
//
// SCREEN-HIDDEN: the node is display:none on screen (`hidden`) and only becomes
// visible when the browser enters print. The print stylesheet hides the rest of
// the console and reveals ONLY this node (the classic "print one element" recipe
// using visibility + an absolute reposition), so the operator prints the
// briefing, not the live map UI behind it.
//
// HONESTY: this is a govt decision-justification artifact, so the demo banner,
// the k-anon disclosure, and the method notes are always present here — never
// dropped (project working norm). es-AR user copy, English identifiers.

import type { InformeModel } from "@/components/panorama/panorama-informe";

type Props = {
  model: InformeModel;
};

// Scoped print CSS: hide everything, then reveal only the informe and force a
// clean black-on-white document. Static — no user input (mirrors the comprobante).
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  [data-panorama-informe] { display: block !important; }
  [data-panorama-informe], [data-panorama-informe] * {
    visibility: visible !important;
    color: #000 !important;
    background: transparent !important;
    border-color: #bbb !important;
  }
  [data-panorama-informe] {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 24px 28px;
    background: #fff !important;
    font-size: 12px;
    line-height: 1.5;
  }
}
`.trim();

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
      {children}
    </h2>
  );
}

export function PanoramaInformeSituacion({ model }: Props) {
  return (
    <div data-panorama-informe className="hidden">
      <style
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static print CSS, no user input
        dangerouslySetInnerHTML={{ __html: PRINT_CSS }}
      />
      <article className="mx-auto max-w-3xl space-y-6 text-ln-op-ink">
        {/* Header — title + scope, the "situación al" corte, the period, and the
            generation stamp. */}
        <header className="space-y-2 border-b border-ln-op-line pb-4">
          <h1 className="text-xl font-bold tracking-tight">{model.title}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ln-op-ink-2">
            <span className="font-semibold">{model.asOfLabel}</span>
            <span>Período: {model.periodLabel}</span>
            <span>Alcance: {model.scopeLabel}</span>
          </div>
          {model.generatedAtLabel && (
            <p className="text-xs text-ln-op-mute">Generado el {model.generatedAtLabel}.</p>
          )}
          {/* Honesty banner — always present when the dataset is demo (never dropped). */}
          {model.isDemo && (
            <p className="rounded-[var(--radius-md)] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2 text-xs text-ln-op-ink-2">
              <span className="font-semibold">Datos de demostración.</span>{" "}
              {model.demoText.replace("Datos de demostración. ", "")}
            </p>
          )}
        </header>

        {/* One-line view description — the ViewState "explain" gift. */}
        {model.viewSummary && (
          <p className="text-[13px] leading-snug text-ln-op-ink-2">{model.viewSummary}</p>
        )}

        {/* KPIs — value + estado-actual/temporal framing + delta. */}
        <section>
          <SectionTitle>Indicadores</SectionTitle>
          {model.kpisDegradedText ? (
            <p className="text-sm text-ln-op-warn">{model.kpisDegradedText}</p>
          ) : model.kpis.length === 0 ? (
            <p className="text-sm text-ln-op-mute">Sin indicadores para esta vista.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3">
              {model.kpis.map((k) => (
                <li
                  key={k.id}
                  className="space-y-0.5 rounded-[var(--radius-md)] border border-ln-op-line px-3 py-2"
                >
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ln-op-mute">{k.label}</span>
                    {k.stateTag && (
                      <span className="shrink-0 rounded-full border border-ln-op-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ln-op-mute">
                        {k.stateTag}
                      </span>
                    )}
                  </p>
                  <p className="text-lg font-bold tabular-nums">{k.value}</p>
                  {k.deltaLabel && (
                    <p className="text-[11px] tabular-nums text-ln-op-ink-2">{k.deltaLabel}</p>
                  )}
                  {k.sub && <p className="text-[11px] leading-snug text-ln-op-mute">{k.sub}</p>}
                  {k.secondary && (
                    <p className="text-[11px] leading-snug text-ln-op-mute">{k.secondary}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ranking — "Peores N · {métrica}" with the C1 metric label and the C3
            k-anon "protegido" disclosure (reused, not reinvented). */}
        {model.ranking && (
          <section>
            <SectionTitle>{model.ranking.heading}</SectionTitle>
            {model.ranking.rows.length === 0 ? (
              <p className="text-sm text-ln-op-mute">{model.ranking.emptyText}</p>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-ln-op-line text-left text-[11px] uppercase tracking-wide text-ln-op-faint">
                    <th className="w-6 py-1 font-semibold">#</th>
                    <th className="py-1 font-semibold">Unidad</th>
                    <th className="py-1 text-right font-semibold">{model.ranking.columnLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.ranking.rows.map((row) => (
                    <tr key={row.key} className="border-b border-ln-op-line/60">
                      <td className="py-1 tabular-nums text-ln-op-mute">{row.rank}</td>
                      <td className="py-1">{row.label}</td>
                      <td className="py-1 text-right tabular-nums">
                        {row.value}
                        {row.gapText && <span className="ml-2 text-ln-op-warn">{row.gapText}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {model.ranking.suppressedNote && (
              <p className="mt-2 text-[11px] text-ln-op-mute">{model.ranking.suppressedNote}</p>
            )}
          </section>
        )}

        {/* Active layers + the plain-language map caption. */}
        <section>
          <SectionTitle>Capas de la vista</SectionTitle>
          {model.activeLayerLabels.length > 0 ? (
            <p className="text-[13px] text-ln-op-ink-2">{model.activeLayerLabels.join(" · ")}</p>
          ) : (
            <p className="text-[13px] text-ln-op-mute">Sin capas activas.</p>
          )}
          {model.caption && (
            <p className="mt-1 text-[12px] leading-snug text-ln-op-mute">{model.caption}</p>
          )}
        </section>

        {/* Method / footnote block + the k-anon disclosure. */}
        <footer className="space-y-2 border-t border-ln-op-line pt-4 text-[11px] leading-snug text-ln-op-mute">
          <SectionTitle>Acerca de las métricas</SectionTitle>
          {model.methodNotes.length > 0 && (
            <ul className="list-disc space-y-1 pl-4">
              {model.methodNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <p>{model.kAnonDisclosure}</p>
          <p>
            Fuente: MiMAR — Centro de Situación Nacional. Toda vista es una proyección del registro
            de eventos.
          </p>
        </footer>
      </article>
    </div>
  );
}
