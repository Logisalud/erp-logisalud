export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { parsearExcelNubefact, FilaNubefact } from '@/lib/nubefact-parser';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('archivo') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const filas = parsearExcelNubefact(buffer);

    // Validaciones básicas
    const errores: { fila: number; mensaje: string }[] = [];
    const filasValidas: FilaNubefact[] = [];

    for (const f of filas) {
      const msgs: string[] = [];
      if (!f.fecha_emision) msgs.push('FECHA E inválida o vacía');
      if (!f.serie || f.serie.length !== 4) msgs.push(`SERIE inválida: "${f.serie}"`);
      if (!f.numero || isNaN(f.numero) || f.numero <= 0) msgs.push('NÚMERO inválido');
      if (!f.cliente_ruc || f.cliente_ruc.length !== 11) msgs.push(`RUC inválido: "${f.cliente_ruc}"`);
      if (isNaN(f.importe_total) || f.importe_total < 0) msgs.push('TOTAL inválido');
      if (!['01','03','07','08'].includes(f.tipo)) msgs.push(`TIPO desconocido: "${f.tipo}"`);
      if (['07','08'].includes(f.tipo) && (!f.doc_mod_tipo || !f.doc_mod_serie || !f.doc_mod_numero)) {
        msgs.push('Nota de crédito/débito sin DOC MODIFICADO completo');
      }
      if (msgs.length > 0) {
        errores.push({ fila: f.fila_excel, mensaje: msgs.join(' | ') });
      } else {
        filasValidas.push(f);
      }
    }

    // Detectar clientes nuevos consultando la BD
    const rucs = [...new Set(filasValidas.map(f => f.cliente_ruc))];
    const db = supabaseAdmin();
    const { data: clientesExistentes } = await db
      .from('clientes')
      .select('ruc')
      .in('ruc', rucs);

    const rucsExistentes = new Set((clientesExistentes ?? []).map((c: { ruc: string }) => c.ruc));
    const clientesNuevos = rucs.filter(r => !rucsExistentes.has(r));

    // Enriquecer con razón social para mostrar en preview
    const clientesNuevosDetalle = clientesNuevos.map(ruc => {
      const fila = filasValidas.find(f => f.cliente_ruc === ruc);
      return { ruc, razon_social: fila?.razon_social ?? '' };
    });

    const resumen = {
      total_filas: filas.length,
      validas: filasValidas.length,
      facturas: filasValidas.filter(f => f.tipo === '01').length,
      boletas: filasValidas.filter(f => f.tipo === '03').length,
      notas_credito: filasValidas.filter(f => f.tipo === '07').length,
      notas_debito: filasValidas.filter(f => f.tipo === '08').length,
      anuladas: filasValidas.filter(f => f.anulado).length,
      clientes_nuevos: clientesNuevosDetalle,
      errores,
      // Enviamos las filas válidas serializadas para que el confirmar las use sin re-parsear
      filas: filasValidas,
    };

    return NextResponse.json(resumen);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
