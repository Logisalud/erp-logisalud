"use client";

import { useState } from "react";
import type { ElectronicDocumentDraft } from "@/services/electronic-documents";

const TITULOS: Record<ElectronicDocumentDraft["tipo"], string> = {
  COMPROBANTE: "Comprobante",
  GUIA_REMISION: "Guía de remisión",
};

export function DraftViewer({
  draft,
  numeroPedido,
}: {
  draft: ElectronicDocumentDraft;
  numeroPedido: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const json = JSON.stringify(draft.payload, null, 2);
  const titulo =
    draft.tipo === "COMPROBANTE"
      ? `${TITULOS.COMPROBANTE} — ${draft.tipo_comprobante ?? "sin definir"}`
      : TITULOS.GUIA_REMISION;

  const nombreArchivo =
    draft.tipo === "COMPROBANTE"
      ? `borrador-comprobante-pedido-${numeroPedido}.json`
      : `borrador-guia-pedido-${numeroPedido}.json`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(json);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  function descargar() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    // Firefox ignora el click de un ancla que no está en el documento, y
    // revocar la URL en la misma vuelta del event loop cancela la descarga
    // en varios navegadores. Por eso se agrega al DOM y se revoca después.
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-lg">{titulo}</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
          BORRADOR — sin validar
        </span>
      </div>

      {draft.advertencias.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">
            Revisar antes de emitir ({draft.advertencias.length})
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-900">
            {draft.advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAbierto((v) => !v)} className="btn-secondary text-sm">
          {abierto ? "Ocultar JSON" : `Ver JSON de ${draft.tipo === "COMPROBANTE" ? "Factura/Boleta" : "Guía"} (borrador)`}
        </button>
        <button type="button" onClick={copiar} className="btn-secondary text-sm">
          {copiado ? "Copiado" : "Copiar"}
        </button>
        <button type="button" onClick={descargar} className="btn-secondary text-sm">
          Descargar .json
        </button>
      </div>

      {abierto && (
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
          {json}
        </pre>
      )}
    </section>
  );
}
