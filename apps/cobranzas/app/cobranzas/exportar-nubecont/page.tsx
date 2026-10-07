'use client';

import { useState } from 'react';

const hoy = () => new Date().toISOString().split('T')[0];
const inicioDeMes = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };

export default function ExportarNubecontPage() {
  const [desde, setDesde] = useState(inicioDeMes());
  const [hasta, setHasta] = useState(hoy());

  const url = `/api/exportar/nubecont?desde=${desde}&hasta=${hasta}`;

  return (
    <div>
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Export de cobranza para Nubecont</p>
          </div>
          <a href="/cobranzas" className="text-white/80 hover:text-white text-sm">&larr; Menú</a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto mt-6 px-4 pb-16">
        <p className="text-gray-500 text-sm mb-4">
          Genera el Excel en el formato exacto de la plantilla de importación de ingresos/cobros de Nubecont,
          una fila por factura cubierta por un pago, en el rango de fechas que elijas. El rango mira la fecha real
          del movimiento de banco: fecha de pago para transferencias, fecha de depósito para efectivo — un efectivo
          aún sin depositar no sale en el export, porque todavía no entró al banco.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Desde</label>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hasta</label>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-logisalud-teal" />
            </div>
          </div>

          <a
            href={url}
            className="block text-center w-full py-2.5 rounded-lg text-sm font-medium text-white transition"
            style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}
          >
            📥 Descargar Excel para Nubecont
          </a>
        </div>
      </main>
    </div>
  );
}
