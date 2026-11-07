// Fase 4 · P7: la reversa de la ventana del piloto, probada en Postgres local: cadena → reversa (dos veces) → no queda nada del WMS ni cambió nada fuera de él → cadena de nuevo.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

const RAIZ = resolve(__dirname, '../..')
const reversa = readFileSync(join(RAIZ, 'supabase/rollback/ventana_piloto_reversa.sql'), 'utf8')
let base: BaseDePrueba
const q = (sql: string) => base.admin.query(sql).then((r) => r.rows)
const FUERA = `select md5(coalesce(string_agg(x, '|' order by x), '')) h from (
  select 'c:' || n.nspname || '.' || c.relname || ':' || c.relkind::text x from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname not in ('wms', 'pg_catalog', 'information_schema', 'pg_toast') and n.nspname not like 'pg_temp%' and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  union all select 'p:' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('wms', 'pg_catalog', 'information_schema') and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  union all select 't:' || tgrelid::regclass::text || ':' || tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'wms.%'
  union all select 'o:' || polrelid::regclass::text || ':' || polname from pg_policy where polrelid::regclass::text not like 'wms.%') y`

/** Vuelve a aplicar la cadena de la ventana (todas las migraciones menos la 0008) y las semillas, como lo haría quien la aplica a mano. */
async function aplicarCadena() {
  for (const f of readdirSync(join(RAIZ, 'supabase/migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    if (f.startsWith('0008_')) continue
    await base.admin.query(readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8'))
  }
  for (const s of ['0001_topologia', '0002_transporte_inicial']) await base.admin.query(readFileSync(join(RAIZ, `supabase/seeds/${s}.sql`), 'utf8'))
}

beforeAll(async () => { base = await crearBaseDePrueba({ piloto: true }) })
afterAll(async () => { await base?.cerrar() })

describe('reversa de la ventana del piloto', () => {
  it('la reversa solo toca el esquema wms (nada fuera) y no se aplica la 0008', () => {
    expect(reversa).toMatch(/drop schema wms cascade/)
    expect(reversa.replace(/--.*$/gm, '')).not.toMatch(/drop (table|function|view|extension)\b/i)
    for (const f of readdirSync(join(RAIZ, 'supabase/migrations')).filter((x) => x.endsWith('.sql') && !x.startsWith('0008_'))) {
      const t = readFileSync(join(RAIZ, 'supabase/migrations', f), 'utf8').replace(/--.*$/gm, '')
      expect(t, f).not.toMatch(/\b(create|alter)\s+(table|view|function|trigger|policy|index)\s+(if not exists\s+)?(public|compras|catalogo|almacen|storage)\./i)
    }
  })
  it('cadena → reversa (dos veces) → no queda nada del WMS y lo de fuera queda igual → la cadena se aplica de nuevo', async () => {
    const fueraAntes = (await q(FUERA))[0].h
    expect(Number((await q(`select count(*)::int n from pg_tables where schemaname = 'wms'`))[0].n)).toBeGreaterThan(100)
    await base.admin.query(reversa)
    await base.admin.query(reversa)   // re-ejecutable
    expect(Number((await q(`select count(*)::int n from pg_namespace where nspname = 'wms'`))[0].n)).toBe(0)
    expect(Number((await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'wms'`))[0].n)).toBe(0)
    expect((await q(FUERA))[0].h).toBe(fueraAntes)
    await aplicarCadena()
    expect(Number((await q(`select count(*)::int n from wms.verificar_saldos()`))[0].n)).toBe(0)
    expect(Number((await q(`select count(*)::int n from pg_tables where schemaname = 'wms' and not rowsecurity`))[0].n)).toBe(0)
    expect(Number((await q(`select count(*)::int n from wms.parametros where clave = 'modo_piloto'`))[0].n)).toBe(1)
  })
})
