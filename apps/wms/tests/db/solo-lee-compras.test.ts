// Piloto B.1: el WMS solo LEE Compras. Ninguna función del esquema `wms`, ningún disparador, ningún grant y ninguna consulta de la aplicación escribe, actualiza ni borra tablas
// de `compras.*` (ni de `almacen.*`, donde Compras guarda sus recepciones) ni de `catalogo.*`. Tampoco el WMS escribe `cantidad_recibida`: la integración de lo recibido es manual.
//
// PIL-8 (DECIDIDO por Sebas, 4-nov): los productos los crea Compras y el WMS los completa. En modo piloto el WMS NO escribe fuera de su esquema (`wms.crear_producto` se rechaza y
// `wms.editar_regulatorio` rechaza presentación y principio activo; ver tests/db/productos-por-completar.test.ts). En el TEXTO de las funciones solo queda la escritura que se
// reactiva en el go-live (D-38): `crear_producto` y, con la 0008 al final, `editar_regulatorio`. Lista CERRADA.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba } from './helpers'

const RAIZ = resolve(__dirname, '../..')
const MONOREPO = resolve(RAIZ, '../..')
const ESCRITURA = /\b(insert\s+into|update|delete\s+from|truncate(?:\s+table)?|merge\s+into)\s+(?:only\s+)?(compras|almacen|catalogo)\s*\.\s*([a-z_]+)/gi
/** Las únicas escrituras permitidas, por función: «operación esquema.tabla». */
const EXCEPCIONES_GO_LIVE: Record<string, string[]> = {
  crear_producto: ['insert into catalogo.productos'],
}
const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
const normalizar = (op: string, esquema: string, tabla: string) => `${op.toLowerCase().replace(/\s+/g, ' ')} ${esquema.toLowerCase()}.${tabla.toLowerCase()}`
const escrituras = (cuerpo: string) => [...sinComentarios(cuerpo).matchAll(ESCRITURA)].map((m) => normalizar(m[1], m[2], m[3]))
function archivos(dir: string, ext: RegExp, ignorar = /node_modules|\.next|\.git$/): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (ignorar.test(p)) return []
    return statSync(p).isDirectory() ? archivos(p, ext, ignorar) : ext.test(n) ? [p] : []
  })
}

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 180_000)
afterAll(async () => { await base?.cerrar() })

describe('el WMS solo lee Compras (base de datos)', () => {
  it('ninguna función del esquema wms (cuerpo, incluido SQL dinámico) escribe en compras, almacen o catalogo, salvo la lista cerrada', async () => {
    const r = await base.admin.query(`select p.proname n, p.prosrc src from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'wms'`)
    expect(r.rowCount).toBeGreaterThan(200)
    const halladas: Record<string, string[]> = {}
    for (const f of r.rows) {
      const e = [...new Set(escrituras(f.src))]
      if (e.length) halladas[f.n] = [...new Set([...(halladas[f.n] ?? []), ...e])]
    }
    // En la ventana del piloto (sin la 0008) `editar_regulatorio` ni siquiera tiene la escritura: la 0008 va al final.
    expect(halladas).toEqual(EXCEPCIONES_GO_LIVE)
    // nada sobre Compras o Almacén: la excepción es solo del catálogo
    for (const ops of Object.values(halladas)) for (const op of ops) expect(op).toMatch(/ catalogo\.productos$/)
  })

  it('ninguna función dinámica arma el nombre de una tabla de Compras (format con %s/%I sobre esos esquemas)', async () => {
    const r = await base.admin.query(`select p.proname n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'wms'
      and p.prosrc ~* '(insert\\s+into|update|delete\\s+from)\\s+%[sI]\\s*\\.' `)
    expect(r.rows.map((x) => x.n)).toEqual([])
  })

  it('ni un disparador del WMS sobre tablas de Compras, Almacén o el catálogo (el que protege presentación y principio activo es de la 0008, que va al final)', async () => {
    const r = await base.admin.query(`select c.relnamespace::regnamespace::text esquema, c.relname tabla, t.tgname n from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relnamespace::regnamespace::text in ('compras', 'almacen', 'catalogo')`)
    expect(r.rows.map((x) => `${x.esquema}.${x.tabla}:${x.n}`)).toEqual([])
  })

  it('ningún rol del WMS (authenticated, anon) tiene privilegios de escritura sobre compras ni almacen', async () => {
    const r = await base.admin.query(`select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants
      where table_schema in ('compras', 'almacen') and grantee in ('authenticated', 'anon', 'PUBLIC') and privilege_type <> 'SELECT'`)
    expect(r.rows).toEqual([])
  })

  it('el WMS no escribe cantidad_recibida (ni la facturada): ninguna función la asigna y sincronizar las OC no toca Compras', async () => {
    const r = await base.admin.query(`select p.proname n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'wms' and p.prosrc ~* '(\\mset\\M|,)\\s*cantidad_(recibida|facturada)\\s*=[^=]' and p.prosrc ~* 'update'`)
    expect(r.rows.map((x) => x.n)).toEqual([])
    const foto = async () => (await base.admin.query(`select (select md5(string_agg(t::text, '|' order by t::text)) from compras.ordenes_compra_items t) i,
      (select md5(string_agg(t::text, '|' order by t::text)) from compras.ordenes_compra t) o`)).rows[0]
    const prov = (await base.admin.query(`insert into compras.proveedores (ruc, razon_social) values ('20111111111', 'P') returning id`)).rows[0].id
    const oc = (await base.admin.query(`insert into compras.ordenes_compra (codigo, proveedor_id, estado) values ('OC-S-1', $1, 'enviada') returning id`, [prov])).rows[0].id
    await base.admin.query(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida, cantidad_recibida) values ($1, $2, 10, 3)`, [oc, base.productos.dapa])
    const antes = await foto()
    await base.como(base.personas.sandra.id, (c) => c.query('select wms.sincronizar_ocs_abiertas()'))
    expect(await foto()).toEqual(antes)
  })
})

describe('el WMS solo lee Compras (código)', () => {
  it('ninguna migración del WMS concede ni deja escribir sobre compras, almacen o catalogo, y las escrituras son solo las de la lista cerrada', () => {
    const dir = join(RAIZ, 'supabase/migrations')
    const porFuncion: string[] = []
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
      const sql = sinComentarios(readFileSync(join(dir, f), 'utf8'))
      expect(sql, f).not.toMatch(/\bgrant\b[^;]*\b(insert|update|delete|truncate|all)\b[^;]*\bon\b[^;]*\b(compras|almacen|catalogo)\b/i)
      expect(sql, f).not.toMatch(/alter\s+default\s+privileges[^;]*\b(compras|almacen|catalogo)\b/i)
      expect(sql, f).not.toMatch(/\bcreate\s+policy\b[^;]*\bon\s+(compras|almacen|catalogo)\./i)
      for (const e of escrituras(sql)) porFuncion.push(`${f}: ${e}`)
    }
    // 0003/0006 (crear_producto) y 0008 (editar_regulatorio): la excepción PIL-8
    expect(porFuncion.every((x) => /(0003|0006|0008)_.*: (insert into|update) catalogo\.productos$/.test(x)), porFuncion.join('\n')).toBe(true)
  })

  it('la aplicación (services/, app/) no escribe en compras, almacen ni catalogo por la API', () => {
    const fuentes = [...archivos(join(RAIZ, 'services'), /\.tsx?$/), ...archivos(join(RAIZ, 'app'), /\.tsx?$/)]
    for (const f of fuentes) {
      const t = readFileSync(f, 'utf8')
      expect(t, f).not.toMatch(/schema\(\s*['"](compras|almacen|catalogo)['"]\s*\)\s*\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(/)
      expect(t, f).not.toMatch(/from\(\s*['"](ordenes_compra|ordenes_compra_items|recepciones)['"]\s*\)\s*\.(insert|update|upsert|delete)/)
      expect(t, f).not.toMatch(/rpc\(\s*['"](compras|almacen|catalogo)\./)
    }
    // el único «cat()» (salida manual) solo lee
    expect(readFileSync(join(RAIZ, 'services/supabase/salida-manual-supabase.ts'), 'utf8')).not.toMatch(/cat\(\)\.from\([^)]*\)\.(insert|update|upsert|delete)/)
  })

  it('Compras no muestra «recibido según almacén» del WMS: su código y sus migraciones no leen nada del esquema wms', () => {
    const fuentes = archivos(join(MONOREPO, 'apps/compras'), /\.(tsx?|sql)$/)
    expect(fuentes.length).toBeGreaterThan(50)
    for (const f of fuentes) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bwms\s*[._]|schema\(\s*['"]wms['"]|v_oc_versiones|oc_versiones/i)
  })
})
