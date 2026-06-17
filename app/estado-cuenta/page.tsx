'use client';

import { useState, useEffect, useCallback } from 'react';

// ---- Tipos ----------------------------------------------------------------

interface VendedorResumen {
  vendedor_id: string | null;
  vendedor_codigo: string | null;
  vendedor_nombre: string | null;
  zona_nombre: string | null;
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
  saldo_total: number; cant_facturas: number;
}

interface ClienteResumen {
  cliente_ruc: string; razon_social: string;
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
  saldo_total: number; cant_facturas: number;
}

interface FacturaRow {
  id: string; comprobante: string;
  fecha_emision: string; fecha_vencimiento: string | null;
  moneda: string; importe_total: number; forma_pago: string | null;
  total_nc: number; total_nd: number; total_pagado: number; saldo_pendiente: number;
  dias_retraso: number; rango_vencimiento: string;
}

interface HasAging {
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
  saldo_total: number; cant_facturas: number;
}

type Vista = 'vendedores' | 'clientes' | 'facturas';

// ---- Helpers --------------------------------------------------------------

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const calcMorosidad = (row: HasAging): number | null => {
  if (row.saldo_total <= 0) return null;
  return ((row.d1_30 + row.d31_60 + row.d61_90 + row.mas90) / row.saldo_total) * 100;
};

const sumarAging = (rows: HasAging[]) => ({
  vigente: rows.reduce((a, r) => a + r.vigente, 0),
  d1_30:   rows.reduce((a, r) => a + r.d1_30,   0),
  d31_60:  rows.reduce((a, r) => a + r.d31_60,  0),
  d61_90:  rows.reduce((a, r) => a + r.d61_90,  0),
  mas90:   rows.reduce((a, r) => a + r.mas90,   0),
  saldo_total:   rows.reduce((a, r) => a + r.saldo_total,   0),
  cant_facturas: rows.reduce((a, r) => a + r.cant_facturas, 0),
});

// ---- Componente principal -------------------------------------------------

export default function EstadoCuentaPage() {
  const [vista, setVista]             = useState<Vista>('vendedores');
  const [resumen, setResumen]         = useState<VendedorResumen[]>([]);
  const [clientes, setClientes]       = useState<ClienteResumen[]>([]);
  const [facturas, setFacturas]       = useState<FacturaRow[]>([]);
  const [vendedorSel, setVendedorSel] = useState<VendedorResumen | null>(null);
  const [clienteSel, setClienteSel]   = useState<ClienteResumen | null>(null);
  const [busqueda, setBusqueda]       = useState('');
  const [soloDeuda, setSoloDeuda]     = useState(true);  // default: solo con saldo > 0
  const [cargando, setCargando]       = useState(true);
  const [errorMsg, setErrorMsg]       = useState('');

  const qs = (extra?: Record<string,string>) =>
    new URLSearchParams({ solo_deuda: String(soloDeuda), ...extra }).toString();

  const cargarResumen = useCallback(async (sd: boolean) => {
    setCargando(true); setErrorMsg('');
    try {
      const res = await fetch(`/api/estado-cuenta/resumen?solo_deuda=${sd}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setResumen(d.resumen);
    } catch (e) { setErrorMsg(String(e)); }
    finally     { setCargando(false); }
  }, []);

  useEffect(() => { cargarResumen(soloDeuda); }, [soloDeuda, cargarResumen]);

  const drillVendedor = useCallback(async (v: VendedorResumen, sd: boolean) => {
    setVendedorSel(v); setBusqueda(''); setCargando(true); setErrorMsg('');
    try {
      const id  = v.vendedor_id ?? 'sin-asignar';
      const res = await fetch(`/api/estado-cuenta/vendedor/${id}?solo_deuda=${sd}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setClientes(d.clientes); setVista('clientes');
    } catch (e) { setErrorMsg(String(e)); }
    finally     { setCargando(false); }
  }, []);

  const drillCliente = useCallback(async (c: ClienteResumen, sd: boolean) => {
    setClienteSel(c); setBusqueda(''); setCargando(true); setErrorMsg('');
    try {
      const res = await fetch(`/api/estado-cuenta/cliente/${c.cliente_ruc}?solo_deuda=${sd}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setFacturas(d.facturas); setVista('facturas');
    } catch (e) { setErrorMsg(String(e)); }
    finally     { setCargando(false); }
  }, []);

  const goVendedores = () => { setVista('vendedores'); setVendedorSel(null); setClienteSel(null); setBusqueda(''); };
  const goClientes   = () => { setVista('clientes');   setClienteSel(null);  setBusqueda(''); };

  // Toggle: recarga el nivel actual con el nuevo filtro
  const toggleSoloDeuda = async () => {
    const nuevo = !soloDeuda;
    setSoloDeuda(nuevo);
    if (vista === 'vendedores') {
      // cargarResumen se dispara por el useEffect
    } else if (vista === 'clientes' && vendedorSel) {
      await drillVendedor(vendedorSel, nuevo);
    } else if (vista === 'facturas' && clienteSel) {
      await drillCliente(clienteSel, nuevo);
    }
  };

  const q = busqueda.toLowerCase();
  const resumenFiltrado   = resumen.filter(v =>
    !q || (v.vendedor_nombre ?? '').toLowerCase().includes(q) ||
           (v.vendedor_codigo ?? '').toLowerCase().includes(q) ||
           (v.zona_nombre ?? '').toLowerCase().includes(q));
  const clientesFiltrados = clientes.filter(c =>
    !q || c.razon_social.toLowerCase().includes(q) || c.cliente_ruc.includes(q));

  const totV = sumarAging(resumenFiltrado);
  const totC = sumarAging(clientesFiltrados);
  const totF = {
    importe: facturas.reduce((a, f) => a + Number(f.importe_total),  0),
    nc:      facturas.reduce((a, f) => a + Number(f.total_nc),       0),
    nd:      facturas.reduce((a, f) => a + Number(f.total_nd),       0),
    pagado:  facturas.reduce((a, f) => a + Number(f.total_pagado),   0),
    saldo:   facturas.reduce((a, f) => a + Number(f.saldo_pendiente),0),
  };

  void qs; // suppress unused warning

  return (
    <div className="min-h-screen bg-gray-50 font-poppins">

      {/* Header */}
      <header className="px-6 py-4" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-oswald tracking-wide">LOGISALUD</h1>
            <p className="text-white/70 text-sm">Estado de cuenta &mdash; Cartera de cobranza</p>
          </div>
          <a href="/" className="text-white/80 hover:text-white text-sm">← Menú</a>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Breadcrumb + toggle */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <nav className="flex items-center gap-2 text-sm">
            <button onClick={goVendedores}
              className={vista === 'vendedores' ? 'text-gray-400 cursor-default' : 'text-logisalud-green font-semibold hover:underline'}>
              Por vendedor
            </button>
            {vendedorSel && (
              <>
                <span className="text-gray-300">›</span>
                <button onClick={goClientes}
                  className={vista === 'clientes' ? 'text-gray-400 cursor-default' : 'text-logisalud-green font-semibold hover:underline'}>
                  {vendedorSel.vendedor_nombre ?? 'Sin asignar'}
                </button>
              </>
            )}
            {clienteSel && (
              <>
                <span className="text-gray-300">›</span>
                <span className="text-gray-500 truncate max-w-xs">{clienteSel.razon_social}</span>
              </>
            )}
          </nav>

          {/* Interruptor solo-deuda */}
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <div
              onClick={toggleSoloDeuda}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                soloDeuda ? 'bg-logisalud-green' : 'bg-gray-300'
              }`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                soloDeuda ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </div>
            <span className="text-gray-600">
              {soloDeuda ? 'Solo cartera pendiente' : 'Incluyendo pagados / contado'}
            </span>
          </label>
        </div>

        {/* Buscador */}
        {vista !== 'facturas' && (
          <input
            type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder={vista === 'vendedores' ? 'Buscar vendedor o zona…' : 'Buscar cliente o RUC…'}
            className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg text-sm mb-5 focus:outline-none focus:ring-2 focus:ring-logisalud-teal"
          />
        )}

        {errorMsg && <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-4 text-sm">{errorMsg}</div>}
        {cargando  && <div className="text-center py-24 text-gray-400">Cargando…</div>}

        {/* NIVEL 1 */}
        {!cargando && vista === 'vendedores' && (
          <AgingTable
            titulo={`${resumenFiltrado.length} vendedores`}
            col1Header="Vendedor" col2Header="Zona"
            filas={resumenFiltrado.map(v => ({
              key:  v.vendedor_id ?? '__sin__',
              col1: v.vendedor_codigo ? `${v.vendedor_codigo} — ${v.vendedor_nombre}` : 'Sin asignar',
              col2: v.zona_nombre ?? '—',
              ...v,
              onClick: () => drillVendedor(v, soloDeuda),
            }))}
            totales={totV}
          />
        )}

        {/* NIVEL 2 */}
        {!cargando && vista === 'clientes' && (
          <AgingTable
            titulo={`${clientesFiltrados.length} clientes — ${vendedorSel?.vendedor_nombre ?? 'Sin asignar'}`}
            col1Header="Cliente" col2Header="RUC"
            filas={clientesFiltrados.map(c => ({
              key:  c.cliente_ruc,
              col1: c.razon_social,
              col2: c.cliente_ruc,
              ...c,
              onClick: () => drillCliente(c, soloDeuda),
            }))}
            totales={totC}
          />
        )}

        {/* NIVEL 3 */}
        {!cargando && vista === 'facturas' && (
          <div>
            <h2 className="font-oswald text-lg text-gray-700 mb-4">
              {clienteSel?.razon_social} &mdash; {facturas.length} factura{facturas.length !== 1 ? 's' : ''}
            </h2>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                    <th className="px-3 py-3 text-left">Comprobante</th>
                    <th className="px-3 py-3 text-left">Emisión</th>
                    <th className="px-3 py-3 text-left">Vencimiento</th>
                    <th className="px-3 py-3 text-left">Pago</th>
                    <th className="px-3 py-3 text-right">Importe</th>
                    <th className="px-3 py-3 text-right text-green-600">NC</th>
                    <th className="px-3 py-3 text-right text-orange-500">ND</th>
                    <th className="px-3 py-3 text-right text-blue-500">Pagado</th>
                    <th className="px-3 py-3 text-right font-bold">Saldo</th>
                    <th className="px-3 py-3 text-right">Días</th>
                    <th className="px-3 py-3 text-center">Rango</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {facturas.map(f => {
                    const es90   = f.rango_vencimiento === '+90';
                    const pagado = f.rango_vencimiento === 'pagado';
                    return (
                      <tr key={f.id} className={`hover:bg-gray-50 ${
                        es90 ? 'bg-red-50/30' : pagado ? 'bg-gray-50/60' : ''
                      }`}>
                        <td className="px-3 py-2 font-mono text-xs">{f.comprobante}</td>
                        <td className="px-3 py-2 text-xs">{fmtFecha(f.fecha_emision)}</td>
                        <td className="px-3 py-2 text-xs">{fmtFecha(f.fecha_vencimiento)}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            f.forma_pago === 'CONTADO'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-blue-50 text-blue-600'
                          }`}>{f.forma_pago ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs">{fmt(Number(f.importe_total))}</td>
                        <td className="px-3 py-2 text-right text-xs text-green-600">{Number(f.total_nc) > 0 ? fmt(Number(f.total_nc)) : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-orange-500">{Number(f.total_nd) > 0 ? fmt(Number(f.total_nd)) : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs text-blue-500">{Number(f.total_pagado) > 0 ? fmt(Number(f.total_pagado)) : '—'}</td>
                        <td className={`px-3 py-2 text-right text-xs font-semibold ${
                          es90 ? 'text-red-600' : pagado ? 'text-gray-400' : 'text-gray-800'
                        }`}>
                          {fmt(Number(f.saldo_pendiente))}
                        </td>
                        <td className={`px-3 py-2 text-right text-xs ${es90 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {Number(f.dias_retraso) > 0 ? `${f.dias_retraso}d` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center"><RangoBadge rango={f.rango_vencimiento} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-xs font-semibold">
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-gray-700">TOTAL</td>
                    <td className="px-3 py-3 text-right">{fmt(totF.importe)}</td>
                    <td className="px-3 py-3 text-right text-green-600">{fmt(totF.nc)}</td>
                    <td className="px-3 py-3 text-right text-orange-500">{fmt(totF.nd)}</td>
                    <td className="px-3 py-3 text-right text-blue-500">{fmt(totF.pagado)}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{fmt(totF.saldo)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Sub-componentes ------------------------------------------------------

interface AgingFila {
  key: string; col1: string; col2: string;
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
  saldo_total: number; cant_facturas: number;
  onClick: () => void;
}

interface AgingTotales {
  vigente: number; d1_30: number; d31_60: number; d61_90: number; mas90: number;
  saldo_total: number; cant_facturas: number;
}

function MorosidadCell({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-300">—</span>;
  return (
    <span className={`font-semibold ${pct > 50 ? 'text-red-600' : 'text-amber-600'}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function AgingTable({ titulo, col1Header, col2Header, filas, totales }: {
  titulo: string; col1Header: string; col2Header: string;
  filas: AgingFila[]; totales: AgingTotales;
}) {
  return (
    <div>
      <h2 className="font-oswald text-lg text-gray-700 mb-4">{titulo}</h2>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
              <th className="px-4 py-3 text-left">{col1Header}</th>
              <th className="px-4 py-3 text-left">{col2Header}</th>
              <th className="px-4 py-3 text-right">Vigente</th>
              <th className="px-4 py-3 text-right">1–30 d</th>
              <th className="px-4 py-3 text-right">31–60 d</th>
              <th className="px-4 py-3 text-right">61–90 d</th>
              <th className="px-4 py-3 text-right bg-red-50 text-red-500">+90 d</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right"># Fact.</th>
              <th className="px-4 py-3 text-right">% Morosidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filas.map(f => (
              <tr key={f.key} onClick={f.onClick}
                className="hover:bg-logisalud-green/5 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-logisalud-green">{f.col1}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{f.col2}</td>
                <td className="px-4 py-3 text-right text-xs">{f.vigente > 0 ? fmt(f.vigente) : '—'}</td>
                <td className="px-4 py-3 text-right text-xs">{f.d1_30  > 0 ? fmt(f.d1_30)  : '—'}</td>
                <td className="px-4 py-3 text-right text-xs">{f.d31_60 > 0 ? fmt(f.d31_60) : '—'}</td>
                <td className="px-4 py-3 text-right text-xs">{f.d61_90 > 0 ? fmt(f.d61_90) : '—'}</td>
                <td className={`px-4 py-3 text-right text-xs bg-red-50/40 ${f.mas90 > 0 ? 'text-red-600 font-semibold' : 'text-gray-300'}`}>
                  {f.mas90 > 0 ? fmt(f.mas90) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(f.saldo_total)}</td>
                <td className="px-4 py-3 text-right text-xs text-gray-400">{f.cant_facturas}</td>
                <td className="px-4 py-3 text-right text-xs"><MorosidadCell pct={calcMorosidad(f)} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-300 text-xs font-semibold">
            <tr>
              <td colSpan={2} className="px-4 py-3 font-oswald text-sm text-gray-700 tracking-wide">TOTAL GENERAL</td>
              <td className="px-4 py-3 text-right">{fmt(totales.vigente)}</td>
              <td className="px-4 py-3 text-right">{fmt(totales.d1_30)}</td>
              <td className="px-4 py-3 text-right">{fmt(totales.d31_60)}</td>
              <td className="px-4 py-3 text-right">{fmt(totales.d61_90)}</td>
              <td className="px-4 py-3 text-right text-red-600 bg-red-50">{fmt(totales.mas90)}</td>
              <td className="px-4 py-3 text-right text-gray-900">{fmt(totales.saldo_total)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{totales.cant_facturas}</td>
              <td className="px-4 py-3 text-right"><MorosidadCell pct={calcMorosidad(totales)} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function RangoBadge({ rango }: { rango: string }) {
  const estilos: Record<string, string> = {
    'vigente':         'bg-green-100 text-green-700',
    'sin_vencimiento': 'bg-gray-100 text-gray-500',
    'pagado':          'bg-gray-100 text-gray-400',
    '1-30':            'bg-yellow-100 text-yellow-700',
    '31-60':           'bg-orange-100 text-orange-600',
    '61-90':           'bg-red-100 text-red-600',
    '+90':             'bg-red-600 text-white font-semibold',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs ${estilos[rango] ?? 'bg-gray-100 text-gray-500'}`}>
      {rango}
    </span>
  );
}
