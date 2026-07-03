export const dynamic = 'force-dynamic';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

interface FacturaPendiente {
  comprobante: string;
  cliente_ruc: string;
  razon_social: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  saldo_pendiente: number;
  dias_retraso: number;
  rango_vencimiento: string;
}

const fmt = (n: number) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtFecha = (s: string | null) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

function diasParaVencer(fechaVenc: string | null): number | null {
  if (!fechaVenc) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = fechaVenc.split('-').map(Number);
  const venc = new Date(y, m - 1, d);
  return Math.round((venc.getTime() - hoy.getTime()) / 86400000);
}

function PlazoBadge({ f }: { f: FacturaPendiente }) {
  const dias = diasParaVencer(f.fecha_vencimiento);
  if (dias === null)
    return <span className="text-xs text-gray-400">sin vencimiento</span>;
  if (dias < 0) {
    const v = Math.abs(dias);
    const grave = v > 30;
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${grave ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
        Vencido hace {v} {v === 1 ? 'día' : 'días'}
      </span>
    );
  }
  if (dias === 0)
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Vence hoy</span>;
  if (dias <= 7)
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-600">Vence en {dias} {dias === 1 ? 'día' : 'días'}</span>;
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-600">Vence en {dias} días</span>;
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
  const facturas: FacturaPendiente[] = await fetchAll((from, to) =>
    db.from('v_saldos')
      .select('comprobante, cliente_ruc, razon_social, fecha_emision, fecha_vencimiento, saldo_pendiente, dias_retraso, rango_vencimiento')
      .eq('vendedor_id', vendedor!.id)
      .gt('saldo_pendiente', 0.005)
      .range(from, to)
  );

  // Urgencia: lo más vencido primero, luego lo más próximo a vencer
  facturas.sort((a, b) =>
    (Number(b.dias_retraso) || 0) - (Number(a.dias_retraso) || 0) ||
    String(a.fecha_vencimiento ?? '9999').localeCompare(String(b.fecha_vencimiento ?? '9999'))
  );

  const total = facturas.reduce((s, f) => s + Number(f.saldo_pendiente), 0);
  const vencidas = facturas.filter(f => Number(f.dias_retraso) > 0);
  const totalVencido = vencidas.reduce((s, f) => s + Number(f.saldo_pendiente), 0);

  const hoyStr = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });

  return (
    <main className="min-h-screen bg-gray-50 pb-10">
      {/* Encabezado */}
      <header className="px-5 py-5" style={{ background: 'linear-gradient(135deg, #4BB168 0%, #4ABCC2 100%)' }}>
        <div className="max-w-2xl mx-auto">
          <h1 className="text-white font-oswald text-xl tracking-wide">LOGISALUD</h1>
          <p className="text-white text-lg font-semibold mt-1">
            {vendedor.nombres} {vendedor.apellidos ?? ''}
          </p>
          <p className="text-white/70 text-xs mt-0.5">Cobranza pendiente · {hoyStr}</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 -mt-0">
        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Por cobrar</p>
            <p className="font-oswald text-2xl mt-1" style={{ color: '#4BB168' }}>{fmt(total)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{facturas.length} {facturas.length === 1 ? 'documento' : 'documentos'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Vencido</p>
            <p className={`font-oswald text-2xl mt-1 ${totalVencido > 0 ? 'text-red-600' : 'text-gray-300'}`}>{fmt(totalVencido)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{vencidas.length} {vencidas.length === 1 ? 'documento' : 'documentos'}</p>
          </div>
        </div>

        {/* Lista de facturas */}
        {facturas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 mt-4 text-center">
            <p className="text-3xl mb-2">🎉</p>
            <p className="font-oswald text-lg text-gray-700">¡Cartera al día!</p>
            <p className="text-gray-500 text-sm mt-1">No tienes clientes con deuda pendiente.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {facturas.map((f, i) => (
              <div key={`${f.comprobante}-${i}`} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-gray-800 text-sm font-semibold leading-snug">{f.razon_social}</p>
                    <p className="text-gray-400 text-xs mt-0.5 font-mono">{f.comprobante} · RUC {f.cliente_ruc}</p>
                  </div>
                  <p className="font-oswald text-lg text-gray-800 shrink-0">{fmt(Number(f.saldo_pendiente))}</p>
                </div>
                <div className="flex items-center justify-between mt-2.5">
                  <PlazoBadge f={f} />
                  <span className="text-xs text-gray-400">Vence: {fmtFecha(f.fecha_vencimiento)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-gray-300 mt-8">LOGISALUD · Vista de consulta — solo lectura</p>
      </div>
    </main>
  );
}
