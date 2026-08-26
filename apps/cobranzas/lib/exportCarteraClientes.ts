import * as XLSX from 'xlsx';
import { supabaseAdmin } from './supabase';
import { fetchAll } from './fetchAll';

// Genera el Excel de cartera de clientes COMPLETA de un vendedor (no solo
// los que tienen deuda) — territorio para saber dónde buscar clientes
// nuevos. Compartido entre el export de admin (/api/vendedores-links/...,
// por vendedor_id) y el export público del propio vendedor
// (/api/v/exportar-clientes, por token) para no duplicar la lógica.
export async function carteraClientesXlsx(vendedorId: string): Promise<{ buf: ArrayBuffer; filename: string } | null> {
  const db = supabaseAdmin();

  const [vendedor, clientes] = await Promise.all([
    db.from('vendedores').select('nombres, apellidos, codigo').eq('id', vendedorId).single(),
    fetchAll<{ ruc: string; razon_social: string; distrito: string | null; codigo_zona: string | null; celular: string | null }>(
      (from, to) =>
        db.from('clientes')
          .select('ruc, razon_social, distrito, codigo_zona, celular')
          .eq('vendedor_actual_id', vendedorId)
          .order('razon_social')
          .range(from, to)
    ),
  ]);

  if (vendedor.error || !vendedor.data) return null;

  const rows = clientes.map(c => ({
    'RUC':          c.ruc,
    'Razón Social': c.razon_social,
    'Distrito':     c.distrito ?? '',
    'Zona':         c.codigo_zona ?? '',
    'Celular':      c.celular ?? '',
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 13 }, { wch: 40 }, { wch: 22 }, { wch: 10 }, { wch: 13 }];
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
  ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  XLSX.utils.book_append_sheet(wb, ws, 'Cartera de Clientes');

  const nombreVendedor = `${vendedor.data.nombres} ${vendedor.data.apellidos ?? ''}`.trim();
  const codigo = vendedor.data.codigo ?? '';
  const fecha = new Date().toISOString().slice(0, 10);
  const raw: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;

  return { buf, filename: `cartera-clientes-${codigo || nombreVendedor}-${fecha}.xlsx` };
}
