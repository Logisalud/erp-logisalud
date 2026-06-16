import { NextRequest, NextResponse } from 'next/server';
import { FilaNubefact } from '@/lib/nubefact-parser';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { filas }: { filas: FilaNubefact[] } = await req.json();
    if (!filas?.length) return NextResponse.json({ error: 'Sin filas' }, { status: 400 });

    const db = supabaseAdmin();
    const resultados = { insertados: 0, actualizados: 0, errores: [] as string[] };

    // 1. Upsert de clientes (solo crea si no existe; no sobreescribe ubigeo/dirección)
    const clientesMap = new Map<string, string>(); // ruc → razon_social
    for (const f of filas) clientesMap.set(f.cliente_ruc, f.razon_social);

    const clientesUpsert = [...clientesMap.entries()].map(([ruc, razon_social]) => ({
      ruc,
      razon_social,
    }));

    const { error: errClientes } = await db
      .from('clientes')
      .upsert(clientesUpsert, { onConflict: 'ruc', ignoreDuplicates: true });

    if (errClientes) {
      return NextResponse.json({ error: `Error al insertar clientes: ${errClientes.message}` }, { status: 500 });
    }

    // 2. Separar facturas y NCs; las facturas primero para que las NCs puedan referenciarlas
    const facturas = filas.filter(f => f.tipo === '01');
    const ncs      = filas.filter(f => f.tipo === '07');

    // Función auxiliar: upsert de un documento y retorna su id
    async function upsertDocumento(f: FilaNubefact, doc_relacionado_id?: string | null) {
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
        anulado:           f.anulado,
        ...(doc_relacionado_id !== undefined && { documento_relacionado_id: doc_relacionado_id }),
      };

      const { data, error } = await db
        .from('documentos')
        .upsert(payload, { onConflict: 'tipo,serie,numero' })
        .select('id')
        .single();

      if (error) throw new Error(`Fila ${f.fila_excel} (${f.serie}-${f.numero}): ${error.message}`);
      return data.id as string;
    }

    // 3. Upsert facturas
    // Construir mapa tipo+serie+numero → id para linkear NCs después
    const docKey = (tipo: string, serie: string, numero: number) => `${tipo}|${serie}|${numero}`;
    const idsPorClave = new Map<string, string>();

    // Primero fetch de documentos ya existentes que sean referenciados por NCs
    const clavesRef = ncs
      .filter(n => n.doc_mod_tipo && n.doc_mod_serie && n.doc_mod_numero)
      .map(n => ({ tipo: n.doc_mod_tipo!, serie: n.doc_mod_serie!, numero: n.doc_mod_numero! }));

    if (clavesRef.length) {
      // Buscamos las facturas referenciadas que ya existen en BD
      for (const ref of clavesRef) {
        const { data } = await db
          .from('documentos')
          .select('id, tipo, serie, numero')
          .eq('tipo',   ref.tipo)
          .eq('serie',  ref.serie)
          .eq('numero', ref.numero)
          .maybeSingle();
        if (data) idsPorClave.set(docKey(data.tipo, data.serie, data.numero), data.id);
      }
    }

    for (const f of facturas) {
      try {
        const id = await upsertDocumento(f);
        idsPorClave.set(docKey(f.tipo, f.serie, f.numero), id);
        resultados.insertados++;
      } catch (e) {
        resultados.errores.push(String(e));
      }
    }

    // 4. Upsert notas de crédito con referencia
    for (const f of ncs) {
      try {
        const claveRef = docKey(f.doc_mod_tipo!, f.doc_mod_serie!, f.doc_mod_numero!);
        const relId = idsPorClave.get(claveRef) ?? null;
        await upsertDocumento(f, relId);
        resultados.insertados++;
      } catch (e) {
        resultados.errores.push(String(e));
      }
    }

    return NextResponse.json(resultados);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
