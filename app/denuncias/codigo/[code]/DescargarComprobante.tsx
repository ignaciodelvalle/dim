"use client";

// DescargarComprobante — triggers a print dialog scoped to the comprobante
// section via a dedicated print stylesheet (media="print"). No heavy deps
// (html-to-image / html2canvas are not in this project). window.print() is
// the lightest working option and produces a PDF on every platform that
// supports print-to-PDF (all modern browsers + iOS Share sheet).

export function DescargarComprobante() {
  function handlePrint() {
    window.print();
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ln-ok)] underline underline-offset-2 hover:opacity-70 transition-opacity print:hidden"
    >
      Descargar comprobante
    </button>
  );
}
