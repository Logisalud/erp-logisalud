export const dynamic = 'force-dynamic';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { hoyISOLima, diasEntre } from '@/lib/fechas';
import { calcularDescuento } from '@/lib/descuento';
import { cobranzaDelMes } from '@/lib/cobranzaDelMes';
import BotonImprimir from './BotonImprimir';
import RegistrarAcceso from './RegistrarAcceso';
import VistaVendedorClient, { FacturaVista, LetraVista } from './VistaVendedorClient';

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
  d0_7: number; d8_15: number; d16_30: number; d31_60: number; d61_mas: number;
  tiene_letras: boolean;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const diasParaVencer = diasEntre;

export default async function VistaVendedorPage({ params }: { params: { token: string } }) {
  const token = params.token?.trim() ?? '';

  let vendedor: { id: string; nombres: string; apellidos: string | null; codigo: string | null; piloto_whatsapp: boolean } | null = null;
  if (token.length >= 16) {
    const db = supabaseAdmin();
    const { data } = await db
      .from('vendedores')
      .select('id, nombres, apellidos, codigo, activo, piloto_whatsapp')
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
        .select('id, comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, importe_total, total_nc, total_pagado, saldo_pendiente, d0_7, d8_15, d16_30, d31_60, d61_mas, tiene_letras')
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

  // Distrito y celular por cliente (celular puede estar vacío si aún no se cargó)
  const rucs = Array.from(new Set(facturasVisibles.map(f => f.cliente_ruc)));
  const distritoPorRuc = new Map<string, string>();
  const celularPorRuc = new Map<string, string>();
  const zonaPorRuc = new Map<string, string>();
  for (let i = 0; i < rucs.length; i += 500) {
    const { data: cls } = await db
      .from('clientes')
      .select('ruc, distrito, celular, codigo_zona')
      .in('ruc', rucs.slice(i, i + 500));
    for (const c of cls ?? []) {
      if (c.distrito) distritoPorRuc.set(c.ruc, c.distrito);
      if (c.celular) celularPorRuc.set(c.ruc, c.celular);
      if (c.codigo_zona) zonaPorRuc.set(c.ruc, c.codigo_zona);
    }
  }

  // Documentos con retención de IGV pendiente: se detectan por tener un pago
  // tipo 'retencion' registrado (ver lib/descuento.ts). Nunca reciben descuento
  // por pronto pago.
  const idsVisibles = facturasVisibles.map(f => f.id);
  const idsConRetencion = new Set<string>();
  for (let i = 0; i < idsVisibles.length; i += 500) {
    const { data: rets } = await db
      .from('pagos')
      .select('documento_id')
      .eq('tipo', 'retencion')
      .in('documento_id', idsVisibles.slice(i, i + 500));
    for (const r of rets ?? []) idsConRetencion.add(r.documento_id);
  }

  // Letras pendientes (no pagadas) de las facturas con letras. Se usan para
  // (a) el vencimiento efectivo de la factura en Tarjetas/Tabla (la más
  // próxima) y (b) el desglose completo en la pestaña "Letras": una factura
  // canjeada por letras puede tener varias cuotas con fechas muy distintas
  // al vencimiento original, y eso no se veía en ningún lado antes.
  const idsConLetras = facturasVisibles.filter(f => f.tiene_letras).map(f => f.id);
  const proximaLetra = new Map<string, string>();
  const letrasPorDoc = new Map<string, { numero_letra: string; importe: number; fecha_vencimiento: string; estado: string }[]>();
  if (idsConLetras.length > 0) {
    const { data: letras } = await db
      .from('letras')
      .select('documento_id, numero_letra, importe, fecha_vencimiento, estado')
      .in('documento_id', idsConLetras)
      .neq('estado', 'pagada')
      .order('fecha_vencimiento');
    for (const l of letras ?? []) {
      if (!proximaLetra.has(l.documento_id)) proximaLetra.set(l.documento_id, l.fecha_vencimiento);
      const arr = letrasPorDoc.get(l.documento_id) ?? [];
      arr.push({ numero_letra: l.numero_letra, importe: Number(l.importe) || 0, fecha_vencimiento: l.fecha_vencimiento, estado: l.estado });
      letrasPorDoc.set(l.documento_id, arr);
    }
  }

  const hoyISO = hoyISOLima();
  const cobranzaMes = await cobranzaDelMes(db, vendedor.id, hoyISO);

  const facturaPorId = new Map(facturasVisibles.map(f => [f.id, f]));
  const letrasVista: LetraVista[] = [];
  for (const [documentoId, letrasDoc] of letrasPorDoc.entries()) {
    const f = facturaPorId.get(documentoId);
    if (!f) continue;
    for (const l of letrasDoc) {
      letrasVista.push({
        documento_id: documentoId,
        comprobante: f.comprobante,
        cliente_ruc: f.cliente_ruc,
        razon_social: f.razon_social,
        distrito: distritoPorRuc.get(f.cliente_ruc) ?? null,
        numero_letra: l.numero_letra,
        importe: l.importe,
        fecha_vencimiento: l.fecha_vencimiento,
        estado: l.estado as LetraVista['estado'],
      });
    }
  }
  letrasVista.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  // Vencimiento efectivo: próxima letra si existe, si no el vencimiento de la factura
  const fechaEfectiva = (f: FacturaPendiente) => proximaLetra.get(f.id) ?? f.fecha_vencimiento;

  // Cuántas letras de cada documento ya vencieron (sin pagar) a hoy — es lo
  // que realmente compone el "Vencido" que ya calcula v_saldos con la fecha
  // de cada letra. Las que aún no llegan a su fecha NO cuentan como mora,
  // aunque la factura "tenga letras": se muestran aparte para que quede
  // claro que ese vencido es real, no un error de cálculo con la fecha
  // original de la factura.
  const letrasVencidasPorDoc = new Map<string, number>();
  for (const [documentoId, letrasDoc] of letrasPorDoc.entries()) {
    letrasVencidasPorDoc.set(documentoId, letrasDoc.filter(l => l.fecha_vencimiento < hoyISO).length);
  }

  // Orden principal: por fecha de vencimiento, de la más próxima a la menos próxima
  facturasVisibles.sort((a, b) =>
    (diasParaVencer(fechaEfectiva(a), hoyISO) ?? 99999) - (diasParaVencer(fechaEfectiva(b), hoyISO) ?? 99999));

  const facturasVista: FacturaVista[] = facturasVisibles.map(f => {
    const saldoPendiente = Number(f.saldo_pendiente) || 0;
    // El descuento por pronto pago se calcula sobre el vencimiento real del
    // documento (Nubefact), no sobre la próxima letra: las facturas con
    // letras se cobran marcando la letra, no por este canal, así que no
    // ofrecemos descuento ni recordatorio de WhatsApp para ellas.
    const tieneRetencion = idsConRetencion.has(f.id);
    const descuento = f.tiene_letras
      ? { diasAnticipacion: diasParaVencer(f.fecha_vencimiento, hoyISO), pctDescuento: 0, montoDescuento: 0, montoAPagarConDescuento: saldoPendiente }
      : calcularDescuento(f.fecha_vencimiento, saldoPendiente, hoyISO, tieneRetencion);

    return {
      id: f.id,
      comprobante: f.comprobante,
      cliente_ruc: f.cliente_ruc,
      razon_social: f.razon_social,
      distrito: distritoPorRuc.get(f.cliente_ruc) ?? null,
      celular: celularPorRuc.get(f.cliente_ruc) ?? null,
      zona: zonaPorRuc.get(f.cliente_ruc) ?? null,
      fecha_emision: f.fecha_emision,
      fecha_venc: fechaEfectiva(f),
      fecha_vencimiento_real: f.fecha_vencimiento,
      letra_fecha: proximaLetra.get(f.id) ?? null,
      letras_vencidas: letrasVencidasPorDoc.get(f.id) ?? 0,
      tiene_letras: f.tiene_letras,
      importe_total: Number(f.importe_total) || 0,
      total_nc: Number(f.total_nc) || 0,
      total_pagado: Number(f.total_pagado) || 0,
      saldo_pendiente: saldoPendiente,
      vencido: (Number(f.d0_7) || 0) + (Number(f.d8_15) || 0) + (Number(f.d16_30) || 0) + (Number(f.d31_60) || 0) + (Number(f.d61_mas) || 0),
      pct_descuento: descuento.pctDescuento,
      monto_descuento: descuento.montoDescuento,
      monto_a_pagar_con_descuento: descuento.montoAPagarConDescuento,
    };
  });

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
          <div className="flex items-center gap-2 print:hidden shrink-0">
            <a
              href={`/api/v/exportar-clientes?token=${token}`}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/20 text-white hover:bg-white/30 transition"
              title="Descargar Excel con todos tus clientes asignados"
            >
              📋 Mi cartera de clientes
            </a>
            <BotonImprimir />
          </div>
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
          letras={letrasVista}
          cobranzaMes={cobranzaMes}
          token={token}
          mostrarWhatsapp={vendedor.piloto_whatsapp}
        />

        <p className="text-center text-[11px] text-gray-300 mt-6 print:text-gray-400">LOGISALUD · Vista de consulta — solo lectura</p>
      </div>
    </main>
  );
}
