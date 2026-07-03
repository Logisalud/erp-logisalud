'use client';

export default function BotonImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 text-white hover:bg-white/30 transition"
      title="Imprimir o guardar PDF"
    >
      🖨 Imprimir
    </button>
  );
}
