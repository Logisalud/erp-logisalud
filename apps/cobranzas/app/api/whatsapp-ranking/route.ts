export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

// Ranking de uso de los dos botones de WhatsApp del link del vendedor
// (ver BotonesWhatsApp en app/v/[token]/VistaVendedorClient.tsx):
// 'descuento' = recordatorio de pronto pago, 'vencimiento' = recordatorio
// de vencimiento/morosidad. Con el total de accesos al lado para ver si el
// que no usa el botón al menos entra.
//
// supabaseAdmin(), no crearClienteServidor(): a diferencia de vendedores/
// accesos_vendedor (tienen policy "cartera_lectura_staff"), la tabla
// whatsapp_mensajes_enviados tiene RLS activado SIN ninguna policy — con el
// cliente de sesión esta pantalla mostraba 0 recordatorios para todos.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

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
        vendedor_id: v.id,
        nombre: `${v.nombres} ${v.apellidos ?? ''}`.trim(),
        codigo: v.codigo,
        piloto_whatsapp: v.piloto_whatsapp,
        accesos: accesosPorVendedor.get(v.id) ?? 0,
        wa_descuento: s.descuento,
        wa_vencimiento: s.vencimiento,
        wa_total: s.descuento + s.vencimiento,
      };
    })
    .sort((a, b) => b.wa_total - a.wa_total || b.accesos - a.accesos || a.nombre.localeCompare(b.nombre));

  return NextResponse.json({ filas }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
