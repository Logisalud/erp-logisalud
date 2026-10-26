import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { crearClienteServidor } from '@logisalud/auth/server';
import { fetchAll } from '@/lib/fetchAll';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_LECTURA } from '@/lib/autorizacion';

export const dynamic = 'force-dynamic';

const toDate = (s: string | null | undefined): Date | string => {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

interface PagoEfectivo {
  id: string;
  documento_id: string;
  monto: number | string;
  fecha_pago: string;
  registrado_por: string | null;
  voucher_path: string | null;
  voucher_deposito_path: string | null;
  estado_efectivo: 'cobrado_por_depositar' | 'depositado' | null;
  fecha_deposito: string | null;
  referencia: string | null;
  documentos: {
    serie: string;
    numero: number;
    cliente_ruc: string;
    clientes: { razon_social: string } | null;
  } | null;
}

/**
 * Todo el efectivo cobrado, depositado o no.
 *
 * La pantalla de "Efectivo por depositar" muestra por defecto solo lo
 * pendiente — es su trabajo: lo que falta llevar al banco. Este Excel es
 * otra pregunta, la que pidió Administración: **quién pagó en efectivo**.
 * Para eso hace falta el historial completo, así que acá NO se filtra por
 * `estado_efectivo`: salen los dos estados siempre, con la columna que los
 * distingue. El botón de la pantalla lo dice con todas las letras para que
 * nadie espere ver solo lo pendiente.
 *
 * El orden lleva `id` de desempate: `fetchAll` pagina y sin clave única la
 * página 2 repite filas de la 1 (ver lib/fetchAll.ts).
 */
export async function GET(_req: NextRequest) {
  const auth = await exigirArea(AREAS_LECTURA);
  if (!auth.ok) return auth.respuesta;

  try {
    const db = crearClienteServidor();

    // El cast es por el tipo que infiere supabase-js para una relación
    // embebida (la da como arreglo); la consulta trae una sola fila por
    // documento, igual que en /api/efectivo-por-depositar.
    const pagos = (await fetchAll((from, to) =>
      db.from('pagos')
        .select(`
          id, documento_id, monto, fecha_pago, registrado_por,
          voucher_path, voucher_deposito_path, estado_efectivo, fecha_deposito, referencia,
          documentos:documento_id ( serie, numero, cliente_ruc, clientes:cliente_ruc ( razon_social ) )
        `)
        .eq('medio_cobro', 'efectivo')
        .order('fecha_pago', { ascending: false })
        .order('id')
        .range(from, to)
    )) as unknown as PagoEfectivo[];

    const hoy = Date.now();

    const filas = pagos.map(p => {
      const depositado = p.estado_efectivo === 'depositado';
      return {
        'Comprobante':   p.documentos ? `${p.documentos.serie}-${p.documentos.numero}` : '—',
        'RUC Cliente':   p.documentos?.cliente_ruc ?? '',
        'Razón Social':  p.documentos?.clientes?.razon_social ?? '',
        'Monto':         Number(p.monto) || 0,
        'Fecha de cobro': toDate(p.fecha_pago),
        'Cobrado por':   p.registrado_por ?? '',
        'Estado':        depositado ? 'Depositado' : 'Por depositar',
        // Solo para lo pendiente: en lo ya depositado el número sería la
        // antigüedad de algo que ya se resolvió, y se leería como una
        // demora que no existe.
        'Días sin depositar': depositado
          ? ''
          : Math.floor((hoy - new Date(p.fecha_pago).getTime()) / 86_400_000),
        'Fecha de depósito':  toDate(p.fecha_deposito),
        'Referencia depósito': p.referencia ?? '',
        'Voucher de cobro':    p.voucher_path ? 'Sí' : 'No',
        'Voucher de depósito': p.voucher_deposito_path ? 'Sí' : 'No',
      };
    });

    const COLUMNAS = [
      'Comprobante', 'RUC Cliente', 'Razón Social', 'Monto', 'Fecha de cobro',
      'Cobrado por', 'Estado', 'Días sin depositar', 'Fecha de depósito',
      'Referencia depósito', 'Voucher de cobro', 'Voucher de depósito',
    ];

    const ws = XLSX.utils.json_to_sheet(filas, { header: COLUMNAS, cellDates: true });
    ws['!cols'] = [
      { wch: 14 }, { wch: 13 }, { wch: 40 }, { wch: 12 }, { wch: 14 },
      { wch: 16 }, { wch: 14 }, { wch: 17 }, { wch: 16 }, { wch: 20 },
      { wch: 16 }, { wch: 18 },
    ];
    const rango = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    ws['!autofilter'] = { ref: XLSX.utils.encode_range(rango) };

    // Dos totales y no uno: el de abajo es la caja que todavía no llegó al
    // banco, que es el número por el que se mira esta pantalla.
    const total = filas.reduce((s, f) => s + f['Monto'], 0);
    const pendiente = filas
      .filter(f => f['Estado'] === 'Por depositar')
      .reduce((s, f) => s + f['Monto'], 0);

    XLSX.utils.sheet_add_json(
      ws,
      [
        { 'Comprobante': 'TOTAL COBRADO EN EFECTIVO', 'Monto': total },
        { 'Comprobante': 'TOTAL POR DEPOSITAR', 'Monto': pendiente },
      ],
      { header: COLUMNAS, skipHeader: true, origin: -1 },
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Efectivo');

    const fecha = new Date().toISOString().slice(0, 10);
    const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="efectivo-cobrado-${fecha}.xlsx"`,
      },
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
