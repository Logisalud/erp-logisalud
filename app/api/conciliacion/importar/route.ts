export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { parsearExtractoBanco } from '@/lib/banco-parser';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

// Fase 1: importa y clasifica el extracto bancario en movimientos_banco_import.
// NO toca facturas ni pagos. Anti-duplicado por (operacion_numero, fecha, monto)
// y, para filas sin nº de operación, por (fecha, monto, descripcion).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('archivo') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const movimientos = parsearExtractoBanco(buffer);
    if (movimientos.length === 0) return NextResponse.json({ error: 'El archivo no tiene movimientos legibles' }, { status: 400 });

    const db = supabaseAdmin();

    // Claves ya existentes en la tabla (para no duplicar en re-subidas).
    const existentes = await fetchAll<{ operacion_numero: string | null; fecha: string; monto: number; descripcion: string }>((from, to) =>
      db.from('movimientos_banco_import').select('operacion_numero, fecha, monto, descripcion').range(from, to)
    );
    const clave = (op: string | null, fecha: string | null, monto: number, desc: string) =>
      op ? `op|${op}|${fecha}|${monto}` : `nd|${fecha}|${monto}|${desc}`;
    const vistas = new Set(existentes.map(e => clave(e.operacion_numero, e.fecha, Number(e.monto), e.descripcion)));

    const aInsertar: Record<string, unknown>[] = [];
    let omitidos = 0;
    const filasSalida: (typeof movimientos[number] & { estado: 'nuevo' | 'duplicado' })[] = [];

    for (const m of movimientos) {
      if (!m.fecha) { omitidos++; filasSalida.push({ ...m, estado: 'duplicado' }); continue; }
      const k = clave(m.operacion_numero, m.fecha, m.monto, m.descripcion);
      if (vistas.has(k)) {
        omitidos++;
        filasSalida.push({ ...m, estado: 'duplicado' });
        continue;
      }
      vistas.add(k); // evita duplicados dentro del mismo archivo
      aInsertar.push({
        fecha: m.fecha, fecha_valuta: m.fecha_valuta, descripcion: m.descripcion, monto: m.monto,
        saldo: m.saldo, sucursal_agencia: m.sucursal_agencia, operacion_numero: m.operacion_numero,
        operacion_hora: m.operacion_hora, usuario: m.usuario, utc: m.utc, referencia2: m.referencia2,
        clasificacion: m.clasificacion, nombre_banco_detectado: m.nombre_banco_detectado,
        archivo_origen: file.name,
      });
      filasSalida.push({ ...m, estado: 'nuevo' });
    }

    if (aInsertar.length > 0) {
      for (let i = 0; i < aInsertar.length; i += 500) {
        const { error } = await db.from('movimientos_banco_import').insert(aInsertar.slice(i, i + 500));
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    const cobros = filasSalida.filter(f => f.clasificacion === 'cobro');
    const noCobranza = filasSalida.filter(f => f.clasificacion === 'no_cobranza');

    return NextResponse.json({
      total_archivo: movimientos.length,
      insertados: aInsertar.length,
      omitidos_duplicados: omitidos,
      resumen: {
        cobros_n: cobros.length,
        cobros_suma: Math.round(cobros.reduce((s, f) => s + f.monto, 0) * 100) / 100,
        no_cobranza_n: noCobranza.length,
        no_cobranza_suma: Math.round(noCobranza.reduce((s, f) => s + f.monto, 0) * 100) / 100,
      },
      filas: filasSalida,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
