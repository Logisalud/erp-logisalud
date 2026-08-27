export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { FilaNubefact } from '@/lib/nubefact-parser';
import { supabaseAdmin } from '@/lib/supabase';
import { exigirArea } from '@logisalud/auth/api';
import { AREAS_IMPORTACION } from '@/lib/autorizacion';

export async function POST(req: NextRequest) {
  const auth = await exigirArea(AREAS_IMPORTACION);
  if (!auth.ok) return auth.respuesta;

  try {
    const { filas }: { filas: FilaNubefact[] } = await req.json();
    if (!filas?.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 });

    const db = supabaseAdmin();
    const resultados = { insertados: 0, actualizados: 0, errores: [] as string[] };

    // 1. Upsert de clientes
    const clientesMap = new Map<string, string>();
    for (const f of filas) clientesMap.set(f.cliente_ruc, f.razon_social);
    const clientesUpsert = Array.from(clientesMap.entries()).map(([ruc, razon_social]) => ({ ruc, razon_social }));
    const { error: errClientes } = await db
      .from('clientes')
      .upsert(clientesUpsert, { onConflict: 'ruc', ignoreDuplicates: true });
    if (errClientes) {
      return NextResponse.json({ error: `Error al insertar clientes: ${errClientes.message}` }, { status: 500 });
    }

    // 2. Separar comprobantes primarios (facturas 01 + boletas 03) de los ajustes (NC/ND).
    //    Las boletas se comportan igual que las facturas y se insertan primero,
    //    para que una NC/ND pueda referenciarlas por (tipo, serie, número).
    const facturas = filas.filter(f => f.tipo === '01' || f.tipo === '03');
    const ajustes  = filas.filter(f => f.tipo === '07' || f.tipo === '08'); // NC + ND

    const upsertDocumento = async (f: FilaNubefact, doc_relacionado_id?: string | null) => {
      const payload: Record<string, unknown> = {
        tipo:              f.tipo,
        serie:             f.serie,
        numero:            f.numero,
        cliente_ruc:       f.cliente_ruc,
        fecha_emision:     f.fecha_emision,
        fecha_vencimiento: f.fecha_vencimiento ?? null,
        moneda:            f.moneda,
        tipo_cambio:       f.tipo_cambio ?? null,
        importe_total:     f.importe_total,
        forma_pago:        f.forma_pago,
        anulado:           f.anulado,
        aceptado_sunat:    f.aceptado_sunat,
        ...(doc_relacionado_id !== undefined && { documento_relacionado_id: doc_relacionado_id }),
      };
      const { data, error } = await db
        .from('documentos')
        .upsert(payload, { onConflict: 'tipo,serie,numero' })
        .select('id')
        .single();
      if (error) throw new Error(`Fila ${f.fila_excel} (${f.serie}-${f.numero}): ${error.message}`);
      return data.id as string;
    };

    // 3. Upsert facturas
    const docKey = (tipo: string, serie: string, numero: number) => `${tipo}|${serie}|${numero}`;
    const idsPorClave = new Map<string, string>();

    const clavesRef = ajustes
      .filter(n => n.doc_mod_tipo && n.doc_mod_serie && n.doc_mod_numero)
      .map(n => ({ tipo: n.doc_mod_tipo!, serie: n.doc_mod_serie!, numero: n.doc_mod_numero! }));

    for (const ref of clavesRef) {
      const { data } = await db
        .from('documentos')
        .select('id, tipo, serie, numero')
        .eq('tipo', ref.tipo).eq('serie', ref.serie).eq('numero', ref.numero)
        .maybeSingle();
      if (data) idsPorClave.set(docKey(data.tipo, data.serie, data.numero), data.id);
    }

    for (const f of facturas) {
      try {
        const id = await upsertDocumento(f);
        idsPorClave.set(docKey(f.tipo, f.serie, f.numero), id);
        resultados.insertados++;
      } catch (e) { resultados.errores.push(String(e)); }
    }

    // 4. Upsert NCs y NDs
    for (const f of ajustes) {
      try {
        const relId = idsPorClave.get(docKey(f.doc_mod_tipo!, f.doc_mod_serie!, f.doc_mod_numero!)) ?? null;
        await upsertDocumento(f, relId);
        resultados.insertados++;
      } catch (e) { resultados.errores.push(String(e)); }
    }

    return NextResponse.json(resultados);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
