export const dynamic = 'force-dynamic';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import BotonImprimir from './BotonImprimir';

interface FacturaPendiente {
  id: string;
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  fecha_vencimiento: string | null;
  saldo_pendiente: number;
  d1_30: number; d31_60: number; d61_90: number; mas90: number;
  dias_retraso: number;
  tiene_letras: boolean;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

function hoyLima(): Date {
  const s = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function diasParaVencer(fechaVenc: string | null): number | null {
  if (!fechaVenc) return null;
  const [y, m, d] = fechaVenc.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - hoyLima().getTime()) / 86400000);
}

function Plazo({ fecha }: { fecha: string | null }) {
  const dias = diasParaVencer(fecha);
  if (dias === null) return <span className="text-xs text-gray-400">sin vencimiento</span>;
  if (dias < 0) {
    const v = Math.abs(dias);
    return <span className="text-xs font-semibold text-red-600">Vencido {v} {v === 1 ? 'día' : 'días'}</span>;
  }
  if (dias === 0) return <span className="text-xs font-semibold text-amber-600">Vence hoy</span>;
  if (dias <= 7)  return <span className="text-xs font-semibold text-amber-600">Vence en {dias} {dias === 1 ? 'día' : 'días'}</span>;
  return <span className="text-xs font-medium" style={{ color: '#4BB168' }}>Vence en {dias} días</span>;
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

  const [facturas, resZonas] = await Promise.all([
    fetchAll<FacturaPendiente>((from, to) =>
      db.from('v_saldos')
        .select('id, comprobante, cliente_ruc, razon_social, fecha_vencimiento, saldo_pendiente, d1_30, d31_60, d61_90, mas90, dias_retraso, tiene_letras')
        .eq('vendedor_id', vendedor!.id)
        .gt('saldo_pendiente', 0.005)
        .range(from, to)
    ),
    db.from('digemid_zona_vendedor').select('codigo_zona').eq('vendedor_id', vendedor.id),
  ]);

  // Próxima letra pendiente por documento (solo facturas con letras)
  const idsConLetras = facturas.filter(f => f.tiene_letras).map(f => f.id);
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

  // Para ordenar y mostrar plazo: usa la próxima letra si existe, si no el vencimiento de la factura
  const fechaEfectiva = (f: FacturaPendiente) => proximaLetra.get(f.id) ?? f.fecha_vencimiento;

  facturas.sort((a, b) => {
    const da = diasParaVencer(fechaEfectiva(a)) ?? 99999;
    const db_ = diasParaVencer(fechaEfectiva(b)) ?? 99999;
    return da - db_;
  });

  const total = facturas.reduce((s, f) => s + Number(f.saldo_pendiente), 0);
  const vencido = facturas.reduce((s, f) =>
    s + (Number(f.d1_30) || 0) + (Number(f.d31_60) || 0) + (Number(f.d61_90) || 0) + (Number(f.mas90) || 0), 0);
  const morosidad = total > 0 ? Math.round(vencido / total * 100) : 0;
  const morosidadAlta = morosidad >= 30;

  const zonas = (resZonas.data ?? []).map(z => z.codigo_zona).join(' · ');
  const hoyStr = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });

  return (
    <main className="min-h-screen bg-gray-50 pb-8 print:bg-white">
      {/* Encabezado */}
      <header className="px-4 py-4 print:bg-white print:border-b print:border-gray-300" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-2xl mx-auto flex items-start justify-between gap-3">
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

      <div className="max-w-2xl mx-auto px-3">
        {/* Resumen */}
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <div className="bg-white rounded-xl border border-gray-200 p-3.5 print:border-gray-300">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">Por cobrar</p>
            <p className="font-oswald text-xl mt-0.5" style={{ color: '#4BB168' }}>{fmt(total)}</p>
            <p className="text-[11px] text-gray-400">{facturas.length} {facturas.length === 1 ? 'documento' : 'documentos'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3.5 print:border-gray-300">
            <p className="text-[11px] text-gray-400 uppercase tracking-wider">% Morosidad</p>
            <p className={`font-oswald text-xl mt-0.5 ${morosidadAlta ? 'text-red-600' : 'text-gray-700'}`}>{morosidad}%</p>
            <p className="text-[11px] text-gray-400">vencido: {fmt(vencido)}</p>
          </div>
        </div>

        {/* Lista compacta */}
        {facturas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 mt-3 text-center">
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-oswald text-lg text-gray-700">¡Cartera al día!</p>
            <p className="text-gray-500 text-sm mt-1">No tienes clientes con deuda pendiente.</p>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {facturas.map(f => {
              const letraFecha = proximaLetra.get(f.id);
              return (
                <div key={f.id} className="bg-white rounded-xl border border-gray-200 px-3.5 py-2.5 print:border-gray-300 print:break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-gray-800 text-sm font-semibold truncate">{f.razon_social}</p>
                    <p className="font-oswald text-base text-gray-800 shrink-0">{fmt(Number(f.saldo_pendiente))}</p>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 mt-0.5">
                    <p className="text-gray-400 text-xs font-mono shrink-0">
                      {f.comprobante}
                      {letraFecha && <span className="ml-1.5 font-sans" style={{ color: '#4ABCC2' }}>letra {fmtFecha(letraFecha)}</span>}
                    </p>
                    <Plazo fecha={fechaEfectiva(f)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-300 mt-6 print:text-gray-400">LOGISALUD · Vista de consulta — solo lectura</p>
      </div>
    </main>
  );
}
