export const dynamic = 'force-dynamic';
import * as XLSX from 'xlsx';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

// Mismo cálculo que /api/whatsapp-ranking, pero como Excel descargable.
// supabaseAdmin(): whatsapp_mensajes_enviados tiene RLS sin policies (ver
// /api/whatsapp-ranking/route.ts) — con el cliente de sesión esto exportaría
// todo en 0.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const db = supabaseAdmin();

    const [vendedores, accesos, mensajes] = await Promise.all([
      fetchAll<{ id: string; nombres: string; apellidos: string | null; codigo: string | null; activo: boolean; piloto_whatsapp: boolean }>((from, to) =>
        db.from('vendedores').select('id, nombres, apellidos, codigo, activo, piloto_whatsapp').range(from, to)
      ),
      fetchAll<{ vendedor_id: string }>((from, to) =>
        db.from('accesos_vendedor').select('vendedor_id').range(from, to)
      ),
      fetchAll<{ vendedor_id: string; tipo_mensaje: 'descuento' | 'vencimiento' }>((from, to) =>
        db.from('whatsapp_mensajes_enviados').select('vendedor_id, tipo_mensaje').range(from, to)
      ),
    ]);

    const accesosPorVendedor = new Map<string, number>();
    for (const a of accesos) accesosPorVendedor.set(a.vendedor_id, (accesosPorVendedor.get(a.vendedor_id) ?? 0) + 1);

    const mensajesPorVendedor = new Map<string, { descuento: number; vencimiento: number }>();
    for (const m of mensajes) {
      const s = mensajesPorVendedor.get(m.vendedor_id) ?? { descuento: 0, vencimiento: 0 };
      s[m.tipo_mensaje]++;
      mensajesPorVendedor.set(m.vendedor_id, s);
    }

    const filas = vendedores
      .filter(v => v.activo)
      .map(v => {
        const s = mensajesPorVendedor.get(v.id) ?? { descuento: 0, vencimiento: 0 };
        return {
          nombre: `${v.nombres} ${v.apellidos ?? ''}`.trim(),
          codigo: v.codigo ?? '',
          piloto_whatsapp: v.piloto_whatsapp,
          accesos: accesosPorVendedor.get(v.id) ?? 0,
          wa_descuento: s.descuento,
          wa_vencimiento: s.vencimiento,
          wa_total: s.descuento + s.vencimiento,
        };
      })
      .sort((a, b) => b.wa_total - a.wa_total || b.accesos - a.accesos || a.nombre.localeCompare(b.nombre));

    const rows = filas.map(f => ({
      'Vendedor':              f.nombre,
      'Código':                f.codigo,
      'Piloto WhatsApp':       f.piloto_whatsapp ? 'Sí' : 'No',
      'Accesos':               f.accesos,
      'Rec. pronto pago':      f.wa_descuento,
      'Rec. vencimiento':      f.wa_vencimiento,
      'Total recordatorios':   f.wa_total,
      'Entra pero no usa':     (f.wa_total === 0 && f.accesos > 0) ? 'Sí' : '',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 14 },
    ];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Ranking WhatsApp');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ranking-whatsapp-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
