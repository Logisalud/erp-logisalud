export const dynamic = 'force-dynamic';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import BotonImprimir from './BotonImprimir';
import RegistrarAcceso from './RegistrarAcceso';
import VistaVendedorClient, { FacturaVista } from './VistaVendedorClient';

// Filtro SOLO de presentación en la vista del vendedor: se ocultan facturas
// con saldo pendiente insignificante (céntimos por redondeo). No toca datos ni
// v_saldos — contablemente esos saldos siguen existiendo en el resto del sistema.
const UMBRAL_SALDO_MINIMO = 0.10;

interface FacturaPendiente {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  importe_total: number;
  total_nc: number;
  total_pagado: number;
  saldo_pendiente: number;
  d1_30: number; d31_60: number; d61_90: number; mas90: number;
  tiene_letras: boolean;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function hoyISOLima(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); // YYYY-MM-DD
}

function diasParaVencer(fecha: string | null, hoyISO: string): number | null {
  if (!fecha) return null;
  const [y, m, d] = fecha.split('-').map(Number);
  const [hy, hm, hd] = hoyISO.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(hy, hm - 1, hd)) / 86400000);
}

export default async function VistaVendedorPage({ params }: { params: { token: string } }) {
  const token = params.token?.trim() ?? '';

  let vendedor: { id: string; nombres: string; apellidos: string | null; codigo: string | null } | null = null;
  if (token.length >= 16) {
    const db = supabaseAdmin();
    const { data } = await db
      .from('vendedores')
      .select('id, nombres, apellidos, codigo, activo')
      .eq('token_acceso', token)
      .single();
    if (data && data.activo) vendedor = data;
  }

  if (!vendedor) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center">
          <h1 className="font-oswald text-2xl text-gray-700 mb-2">Enlace no válido</h1>
          <p className="text-gray-500 text-sm">Este enlace no existe o fue desactivado. Consulta con administración.</p>
        </div>
      </main>
    );
  }

  const db = supabaseAdmin();

  const [facturas, resZonas, contadoRaw] = await Promise.all([
    fetchAll<FacturaPendiente>((from, to) =>
      db.from('v_saldos')
        .select('id, comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, importe_total, total_nc, total_pagado, saldo_pendiente, d1_30, d31_60, d61_90, mas90, tiene_letras')
        .eq('vendedor_id', vendedor!.id)
        .gt('saldo_pendiente', 0.005)
        .range(from, to)
    ),
    db.from('digemid_zona_vendedor').select('codigo_zona').eq('vendedor_id', vendedor.id),
    // Ventas al contado ya saldadas (informativo): forma_pago CONTADO y no pendiente.
    fetchAll<{ id: string; comprobante: string; cliente_ruc: string; razon_social: string; fecha_emision: string; importe_total: number }>((from, to) =>
      db.from('v_saldos')
        .select('id, comprobante, cliente_ruc, razon_social, fecha_emision, importe_total')
        .eq('vendedor_id', vendedor!.id)
        .eq('forma_pago', 'CONTADO')
        .eq('contado_pendiente', false)
        .range(from, to)
    ),
  ]);

  // Ordenadas por fecha (más reciente primero).
  const contado = contadoRaw
    .map(c => ({ id: c.id, comprobante: c.comprobante, cliente_ruc: c.cliente_ruc, razon_social: c.razon_social, fecha_emision: c.fecha_emision, importe: Number(c.importe_total) || 0 }))
    .sort((a, b) => (b.fecha_emision ?? '').localeCompare(a.fecha_emision ?? ''));
  const contadoTotal = contado.reduce((s, c) => s + c.importe, 0);

  // Oculta saldos insignificantes solo para el vendedor: filtra ANTES de todos
  // los cálculos, así el listado, los totales, el % morosidad y el conteo tratan
  // esas facturas como saldadas.
  const facturasVisibles = facturas.filter(f => Number(f.saldo_pendiente) >= UMBRAL_SALDO_MINIMO);

  // Distrito por cliente (puede estar vacío si aún no se carga desde DIGEMID)
  const rucs = Array.from(new Set(facturasVisibles.map(f => f.cliente_ruc)));
  const distritoPorRuc = new Map<string, string>();
  for (let i = 0; i < rucs.length; i += 500) {
    const { data: cls } = await db
      .from('clientes')
      .select('ruc, distrito')
      .in('ruc', rucs.slice(i, i + 500));
    for (const c of cls ?? []) {
      if (c.distrito) distritoPorRuc.set(c.ruc, c.distrito);
    }
  }

  // Próxima letra pendiente por documento (solo facturas con letras)
  const idsConLetras = facturasVisibles.filter(f => f.tiene_letras).map(f => f.id);
  const proximaLetra = new Map<string, string>();
  if (idsConLetras.length > 0) {
    const { data: letras } = await db
      .from('letras')
      .select('documento_id, fecha_vencimiento, estado')
      .in('documento_id', idsConLetras)
      .neq('estado', 'pagada')
      .order('fecha_vencimiento');
    for (const l of letras ?? []) {
      if (!proximaLetra.has(l.documento_id)) proximaLetra.set(l.documento_id, l.fecha_vencimiento);
    }
  }

  const hoyISO = hoyISOLima();

  // Vencimiento efectivo: próxima letra si existe, si no el vencimiento de la factura
  const fechaEfectiva = (f: FacturaPendiente) => proximaLetra.get(f.id) ?? f.fecha_vencimiento;

  // Orden principal: por fecha de vencimiento, de la más próxima a la menos próxima
  facturasVisibles.sort((a, b) =>
    (diasParaVencer(fechaEfectiva(a), hoyISO) ?? 99999) - (diasParaVencer(fechaEfectiva(b), hoyISO) ?? 99999));

  const facturasVista: FacturaVista[] = facturasVisibles.map(f => ({
    id: f.id,
    comprobante: f.comprobante,
    cliente_ruc: f.cliente_ruc,
    razon_social: f.razon_social,
    distrito: distritoPorRuc.get(f.cliente_ruc) ?? null,
    fecha_emision: f.fecha_emision,
    fecha_venc: fechaEfectiva(f),
    letra_fecha: proximaLetra.get(f.id) ?? null,
    importe_total: Number(f.importe_total) || 0,
    total_nc: Number(f.total_nc) || 0,
    total_pagado: Number(f.total_pagado) || 0,
    saldo_pendiente: Number(f.saldo_pendiente) || 0,
    vencido: (Number(f.d1_30) || 0) + (Number(f.d31_60) || 0) + (Number(f.d61_90) || 0) + (Number(f.mas90) || 0),
  }));

  const total = facturasVista.reduce((s, f) => s + f.saldo_pendiente, 0);
  const vencido = facturasVista.reduce((s, f) => s + f.vencido, 0);
  const totalNc = facturasVista.reduce((s, f) => s + f.total_nc, 0);
  const totalPagado = facturasVista.reduce((s, f) => s + f.total_pagado, 0);
  const totalImporte = facturasVista.reduce((s, f) => s + f.importe_total, 0);
  const morosidad = total > 0 ? Math.round(vencido / total * 100) : 0;
  const morosidadAlta = morosidad >= 30;

  const zonas = (resZonas.data ?? []).map(z => z.codigo_zona).join(' · ');
  const hoyStr = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });

  return (
    <main className="min-h-screen bg-gray-50 pb-8 print:bg-white">
      <RegistrarAcceso token={token} />
      {/* Encabezado */}
      <header className="px-4 py-4 print:bg-white print:border-b print:border-gray-300" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-4xl mx-auto flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-white print:text-gray-800 font-oswald text-base tracking-wide">LOGISALUD · COBRANZA</h1>
            <p className="text-white print:text-gray-800 text-lg font-semibold leading-tight mt-0.5">
              {vendedor.nombres} {vendedor.apellidos ?? ''}
            </p>
            <p className="text-white/80 print:text-gray-500 text-xs mt-0.5">
              {zonas && <>{zonas} · </>}{hoyStr}
            </p>
          </div>
          <BotonImprimir />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-3">
        {/* Resumen del vendedor */}
        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-2.5 mt-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3.5 print:border-gray-300">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">Por cobrar</p>
            <p className="font-oswald text-xl mt-0.5" style={{ color: '#4BB168' }}>{fmt(total)}</p>
            <p className="text-[11px] text-gray-400">{facturasVista.length} {facturasVista.length === 1 ? 'documento' : 'documentos'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3.5 print:border-gray-300">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">% Morosidad</p>
            <p className={`font-oswald text-xl mt-0.5 ${morosidadAlta ? 'text-red-600' : 'text-gray-700'}`}>{morosidad}%</p>
            <p className="text-[11px] text-gray-400">vencido: {fmt(vencido)}</p>
          </div>
        </div>

        <VistaVendedorClient
          facturas={facturasVista}
          hoyISO={hoyISO}
          total={total}
          totalNc={totalNc}
          totalPagado={totalPagado}
          totalImporte={totalImporte}
          contado={contado}
          contadoTotal={contadoTotal}
        />

        <p className="text-center text-[11px] text-gray-300 mt-6 print:text-gray-400">LOGISALUD · Vista de consulta — solo lectura</p>
      </div>
    </main>
  );
}
