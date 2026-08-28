export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

// Resumen de uso de la vista del vendedor: una fila por vendedor con su último
// acceso, total y accesos en los últimos 7 días. Los que nunca entraron primero.
export async function GET() {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  const db = crearClienteServidor();

  const [vendedores, accesos] = await Promise.all([
    fetchAll<{ id: string; nombres: string; apellidos: string | null; codigo: string | null; activo: boolean }>((from, to) =>
      db.from('vendedores').select('id, nombres, apellidos, codigo, activo').range(from, to)
    ),
    fetchAll<{ vendedor_id: string; fecha_hora: string }>((from, to) =>
      db.from('accesos_vendedor').select('vendedor_id, fecha_hora').range(from, to)
    ),
  ]);

  const hace7dias = Date.now() - 7 * 86400000;
  const stats = new Map<string, { total: number; ultimos7: number; ultimo: string | null }>();
  for (const a of accesos) {
    let s = stats.get(a.vendedor_id);
    if (!s) { s = { total: 0, ultimos7: 0, ultimo: null }; stats.set(a.vendedor_id, s); }
    s.total++;
    if (new Date(a.fecha_hora).getTime() >= hace7dias) s.ultimos7++;
    if (!s.ultimo || a.fecha_hora > s.ultimo) s.ultimo = a.fecha_hora;
  }

  const filas = vendedores.map(v => {
    const s = stats.get(v.id);
    return {
      vendedor_id: v.id,
      nombre: `${v.nombres} ${v.apellidos ?? ''}`.trim(),
      codigo: v.codigo,
      activo: v.activo,
      total: s?.total ?? 0,
      ultimos7: s?.ultimos7 ?? 0,
      ultimo_acceso: s?.ultimo ?? null,
    };
  });

  // Orden: nunca entraron primero; luego por acceso más antiguo (inactivos arriba).
  filas.sort((a, b) => {
    if (!a.ultimo_acceso && !b.ultimo_acceso) return a.nombre.localeCompare(b.nombre);
    if (!a.ultimo_acceso) return -1;
    if (!b.ultimo_acceso) return 1;
    return a.ultimo_acceso.localeCompare(b.ultimo_acceso);
  });

  return NextResponse.json({ filas }, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } });
}
