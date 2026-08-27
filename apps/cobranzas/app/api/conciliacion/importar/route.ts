export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { parsearExtractoBanco } from '@/lib/banco-parser';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { sugerirParaMovimiento, type Categoria } from '@/lib/conciliacion';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_IMPORTACION } from '@/lib/autorizacion';

// Fase 1: importa y clasifica el extracto bancario en movimientos_banco_import.
// NO toca facturas ni pagos. Anti-duplicado por (operacion_numero, fecha, monto)
// y, para filas sin nº de operación, por (fecha, monto, descripcion).
export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_IMPORTACION);
  if (!auth.ok) return auth.respuesta;

  try {
    const form = await req.formData();
    const file = form.get('archivo') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const movimientos = parsearExtractoBanco(buffer);
    if (movimientos.length === 0) return NextResponse.json({ error: 'El archivo no tiene movimientos legibles' }, { status: 400 });

    const db = supabaseAdmin();

    // Chequeo de sanidad: importar el extracto NO debe cambiar ni un centavo
    // de la cartera (solo escribe en movimientos_banco_import, no en
    // documentos/pagos). Se compara antes/después del insert.
    const sumaSaldos = async () => {
      const filas = await fetchAll<{ saldo_pendiente: number }>((from, to) =>
        db.from('v_saldos').select('saldo_pendiente').range(from, to)
      );
      return Math.round(filas.reduce((s, f) => s + (Number(f.saldo_pendiente) || 0), 0) * 100) / 100;
    };
    const saldoTotalAntes = await sumaSaldos();

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

    const insertadosCobro: { id: string; fecha: string; monto: number; operacion_numero: string | null; nombre_banco_detectado: string | null }[] = [];
    if (aInsertar.length > 0) {
      for (let i = 0; i < aInsertar.length; i += 500) {
        const { data, error } = await db.from('movimientos_banco_import')
          .insert(aInsertar.slice(i, i + 500))
          .select('id, fecha, monto, operacion_numero, nombre_banco_detectado, clasificacion');
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        for (const r of data ?? []) {
          if (r.clasificacion === 'cobro') {
            insertadosCobro.push({
              id: r.id, fecha: r.fecha, monto: Number(r.monto),
              operacion_numero: r.operacion_numero, nombre_banco_detectado: r.nombre_banco_detectado,
            });
          }
        }
      }
    }

    const cobros = filasSalida.filter(f => f.clasificacion === 'cobro');
    const noCobranza = filasSalida.filter(f => f.clasificacion === 'no_cobranza');

    // Resumen del lote: qué falta hacer con lo recién importado. Solo
    // lectura — no ejecuta el auto-conciliar ni crea sugerencias, solo las
    // detecta para mostrarlas. Los auto-conciliables (N° operación con pago
    // exacto ya existente) se excluyen de la categorización manual.
    const opsConPago = new Set<string>();
    {
      const ops = Array.from(new Set(insertadosCobro.map(m => m.operacion_numero).filter(Boolean))) as string[];
      for (let i = 0; i < ops.length; i += 300) {
        const { data } = await db.from('pagos').select('referencia').in('referencia', ops.slice(i, i + 300));
        for (const p of data ?? []) if (p.referencia) opsConPago.add(p.referencia);
      }
    }
    const pendientesDeCategorizar = insertadosCobro.filter(m => !(m.operacion_numero && opsConPago.has(m.operacion_numero)));

    const categorias: Record<Categoria, number> = {
      nombre_y_monto: 0, nombre_sin_monto: 0, solo_monto_unica: 0, ambiguo: 0, sin_candidata: 0,
    };
    const resultados = await Promise.all(pendientesDeCategorizar.map(m => sugerirParaMovimiento(db, m)));
    for (const r of resultados) categorias[r.categoria]++;

    const saldoTotalDespues = await sumaSaldos();

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
      lote: {
        nuevos_cobros: insertadosCobro.length,
        auto_conciliables: insertadosCobro.length - pendientesDeCategorizar.length,
        categorias,
        saldo_total_antes: saldoTotalAntes,
        saldo_total_despues: saldoTotalDespues,
        saldo_cambio: Math.round((saldoTotalDespues - saldoTotalAntes) * 100) / 100,
      },
      filas: filasSalida,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
