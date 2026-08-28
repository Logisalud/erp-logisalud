import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

// Exporta a Excel la lista de clientes con los MISMOS filtros de la pantalla
// (zona, vendedor, búsqueda). Columnas: RUC, razón social, zona, vendedor
// asignado, distrito, override manual.
export async function GET(req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const { searchParams } = new URL(req.url);
    const search     = searchParams.get('search')?.trim() ?? '';
    const zona       = searchParams.get('zona')?.trim() ?? '';
    const vendedorId = searchParams.get('vendedor_id')?.trim() ?? '';
    const sinAsignar = searchParams.get('sin_asignar') === 'true';
    const soloOverride = searchParams.get('solo_override') === 'true';

    const db = crearClienteServidor();

    const [clientes, vendedores] = await Promise.all([
      fetchAll<{
        ruc: string; razon_social: string; codigo_zona: string | null;
        distrito: string | null; vendedor_actual_id: string | null; vendedor_manual_id: string | null;
      }>((from, to) => {
        let q = db
          .from('clientes')
          .select('ruc, razon_social, codigo_zona, distrito, vendedor_actual_id, vendedor_manual_id')
          .order('razon_social')
          .range(from, to);
        if (sinAsignar)   q = q.is('codigo_zona', null);
        if (soloOverride) q = q.not('vendedor_manual_id', 'is', null);
        if (zona)         q = q.eq('codigo_zona', zona);
        if (vendedorId)   q = q.eq('vendedor_actual_id', vendedorId);
        if (search)       q = q.or(`ruc.ilike.%${search}%,razon_social.ilike.%${search}%`);
        return q;
      }),
      fetchAll<{ id: string; codigo: string; nombres: string; apellidos: string }>((from, to) =>
        db.from('vendedores').select('id, codigo, nombres, apellidos').range(from, to)
      ),
    ]);

    const vendMap = new Map(vendedores.map(v => [v.id, `${v.nombres} ${v.apellidos} (${v.codigo})`.trim()]));

    const rows = clientes.map(c => ({
      'RUC':            c.ruc,
      'Razón Social':   c.razon_social,
      'Zona DIGEMID':   c.codigo_zona ?? '',
      'Vendedor':       c.vendedor_actual_id ? (vendMap.get(c.vendedor_actual_id) ?? '') : 'Sin asignar',
      'Distrito':       c.distrito ?? '',
      'Override Manual': c.vendedor_manual_id ? 'Sí' : 'No',
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 13 }, { wch: 40 }, { wch: 13 }, { wch: 28 }, { wch: 22 }, { wch: 14 }];
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="clientes-filtrado-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
