// Supabase carga `pg_safeupdate` para los roles de la API: un UPDATE (o DELETE) sin WHERE dentro de una función que llama la aplicación falla con el
// error 21000 ("UPDATE requires a WHERE clause"). El Postgres local no trae esa protección, así que esta prueba lo vigila leyendo el texto de las funciones
// del schema wms. (Origen: 2026-11-07, «Revisar Compras ahora» no guardaba la copia de las OC en producción: 0045 → 0048.)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() })
afterAll(async () => { await base.cerrar() })

/** Sentencias `update <tabla> set … ;` y `delete from <tabla> ;` sin WHERE (ni subconsulta que lo traiga) dentro de un cuerpo de función. */
export function sentenciasSinWhere(cuerpo: string): string[] {
  const sinComentarios = cuerpo.replace(/--[^\n]*/g, '')
  const out: string[] = []
  for (const m of sinComentarios.matchAll(/\b(update\s+[\w.]+\s+set\b[^;]*;|delete\s+from\s+[\w.]+\s*;)/gi)) {
    if (!/\bwhere\b/i.test(m[1])) out.push(m[1].replace(/\s+/g, ' ').slice(0, 90))
  }
  return out
}

describe('UPDATE y DELETE sin WHERE en funciones del WMS', () => {
  it('el detector reconoce lo que pg_safeupdate rechaza', () => {
    expect(sentenciasSinWhere('update wms.t set a = 1;')).toHaveLength(1)
    expect(sentenciasSinWhere('delete from wms.t;')).toHaveLength(1)
    expect(sentenciasSinWhere('update wms.t set a = 1 where id;')).toEqual([])
    expect(sentenciasSinWhere("update wms.t set a = 1 where id = (select 1);")).toEqual([])
  })

  it('ninguna función del schema wms los trae', async () => {
    const { rows } = await base.admin.query(`select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wms' and p.prokind = 'f'`)
    const malas = rows.flatMap((r: { proname: string; def: string }) => sentenciasSinWhere(r.def).map((s) => `${r.proname}: ${s}`))
    expect(malas).toEqual([])
  })
})
