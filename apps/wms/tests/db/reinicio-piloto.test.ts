// Fase 4 · P5: el script de reinicio del piloto, en Postgres local con datos sembrados (nunca contra una base real).
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BORRAR, CONSERVAR, REINICIAR, clasificarTablas, exigirCopiaDelDia, hoyLima, leerArgumentos, listarArchivos, reiniciar as reiniciarJs } from '../../scripts/reinicio-piloto-lib.mjs'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario } from './helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reiniciar = reiniciarJs as (c: unknown, o: Record<string, unknown>) => Promise<any>
let base: BaseDePrueba
let posAprobado: string
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)

/** Un almacén de archivos falso con los mismos métodos que el bucket real. */
function almacenFalso(refs: string[]) {
  const vivos = new Set(refs)
  return {
    vivos,
    async listar(prefijo: string) {
      const hijos = new Map<string, boolean>()
      for (const r of vivos) {
        if (prefijo && !r.startsWith(`${prefijo}/`)) continue
        const resto = prefijo ? r.slice(prefijo.length + 1) : r
        const [n, ...mas] = resto.split('/')
        hijos.set(n, mas.length > 0 || hijos.get(n) === true)
      }
      return [...hijos].map(([name, esCarpeta]) => ({ name, esCarpeta }))
    },
    async borrar(rutas: string[]) { for (const r of rutas) vivos.delete(r) },
  }
}

beforeAll(async () => {
  base = await crearBaseDePrueba({ piloto: true })
  const logissa = await idPropietario(base.admin, 'LOGISSA')
  posAprobado = (await uno(`select p.codigo from wms.posiciones p where p.tipo_area = 'APROBADOS' and p.activa and wms.posicion_acepta(p.id, $1, current_date) order by p.codigo limit 1`, [logissa])).codigo
  // datos transaccionales reales del piloto: una carga de ensayo confirmada (lotes, saldos, movimientos, partidas), con su auditoría
  const filas = [{ producto: 'T-DAPA', lote: 'REI-1', vence: '2029-05-31', propietario: 'LOGISSA', posicion: posAprobado, estado: 'APROBADO', cantidad: 40 }]
  await como(base.personas.admin.id, (c) => c.query(`select wms.registrar_informe_carga($1::jsonb, 'LISTA')`, [JSON.stringify(filas)]))
  const id = (await como(base.personas.admin.id, (c) => c.query('select wms.crear_carga_ensayo($1::jsonb, null) id', [JSON.stringify(filas)]))).rows[0].id
  await como(base.personas.katia.id, (c) => c.query('select wms.confirmar_carga_inicial($1)', [id]))
  // un documento regulatorio de lote (se borra) y uno de producto (se conserva)
  const lote = (await uno(`select id from wms.lotes where codigo = 'REI-1'`)).id
  const dapa = base.productos.dapa
  await base.admin.query(`set session_replication_role = replica`)
  await base.admin.query(`insert into wms.documentos_regulatorios (producto_id, lote_id, tipo, nombre_archivo, archivo_ref, hash_sha256, tamano_bytes, subido_por) values (null, $2, 'COA', 'coa.pdf', 'coa/lote-coa.pdf', $4, 10, $3), ($1, null, 'REGISTRO_SANITARIO', 'rs.pdf', 'registro/rs-conservar.pdf', $4, 10, $3)`, [dapa, lote, base.personas.katia.id, 'a'.repeat(64)])
  await base.admin.query(`set session_replication_role = origin`)
})
afterAll(async () => { await base?.cerrar() })

const tablasTransaccionales = () => BORRAR as string[]
const conteo = async (t: string) => Number((await uno(`select count(*)::int n from wms.${t}`)).n)

describe('banderas y lista cerrada', () => {
  it('sin --ejecutar es simulación; para ejecutar exige la copia DEL DÍA de hoy y se niega si falta o es de otro día', () => {
    expect(leerArgumentos([])).toMatchObject({ ejecutar: false, simular: true })
    expect(leerArgumentos(['--simular'])).toMatchObject({ ejecutar: false })
    expect(() => leerArgumentos(['--borrar-todo'])).toThrow(/desconocida/)
    const hoy = hoyLima()
    expect(() => exigirCopiaDelDia(leerArgumentos(['--ejecutar']))).toThrow(/falta --confirmo-copia-del-dia/)
    expect(() => exigirCopiaDelDia(leerArgumentos(['--ejecutar', '--confirmo-copia-del-dia', '2020-01-01']))).toThrow(/copia DEL DÍA/)
    expect(() => exigirCopiaDelDia(leerArgumentos(['--ejecutar', '--confirmo-copia-del-dia', 'ayer']))).toThrow(/AAAA-MM-DD/)
    expect(() => exigirCopiaDelDia(leerArgumentos(['--ejecutar', '--confirmo-copia-del-dia', hoy]))).not.toThrow()
  })
  it('todas las tablas de wms están decididas; una tabla nueva sin decidir aborta', async () => {
    const r = await clasificarTablas(base.admin)
    expect(r.auditoria).toBe(true)
    expect(new Set([...r.borrar, ...r.conservar]).size).toBe(r.borrar.length + r.conservar.length)   // ninguna en las dos listas
    await base.admin.query('create table wms.zz_tabla_nueva (id int)')
    try { await expect(clasificarTablas(base.admin)).rejects.toThrow(/zz_tabla_nueva/) } finally { await base.admin.query('drop table wms.zz_tabla_nueva') }
  })
  it('lo que el plan manda conservar no está entre lo que se borra (y los correlativos se reinician: no se conservan ni se borran)', () => {
    for (const t of ['usuario_roles', 'permisos_rol', 'parametros', 'propietarios', 'posiciones', 'producto_regulatorio', 'documentos_regulatorios', 'reinicios']) { expect(CONSERVAR).toContain(t); expect(BORRAR).not.toContain(t) }
    for (const t of ['correlativos', 'guia_correlativos']) { expect(REINICIAR).toContain(t); expect(CONSERVAR).not.toContain(t); expect(BORRAR).not.toContain(t) }
    for (const t of ['pedidos_despacho', 'importaciones_pedidos', 'oc_versiones', 'cargas_iniciales', 'acta_firmas', 'ruta_paradas_eventos', 'saldos', 'movimientos']) expect(BORRAR).toContain(t)
  })
})

describe('simular (el modo por defecto)', () => {
  it('cuenta tablas, auditoría y archivos, lista prefijos y NO borra ni registra nada', async () => {
    const almacen = almacenFalso(['actas/a.pdf', 'entregas/f1.jpg', 'firmas/x.png', 'registro/rs-conservar.pdf'])
    const antes = await Promise.all(tablasTransaccionales().map(conteo))
    expect(antes.some((n) => n > 0)).toBe(true)
    const inf = await reiniciar(base.admin, { ejecutar: false, almacen })
    expect(inf.modo).toBe('SIMULAR')
    expect(inf.tablasABorrar.lotes).toBeGreaterThan(0); expect(inf.tablasABorrar.saldos).toBeGreaterThan(0); expect(inf.tablasABorrar.cargas_iniciales).toBe(1)
    expect(inf.auditoria.filas).toBeGreaterThan(0)
    expect(inf.archivos).toMatchObject({ disponible: true, total: 4, aBorrar: 3, conservados: 1 })
    expect(Object.keys(inf.archivos.prefijos).sort()).toEqual(['actas', 'entregas', 'firmas', 'registro'])
    expect(await Promise.all(tablasTransaccionales().map(conteo))).toEqual(antes)
    expect(almacen.vivos.size).toBe(4)
    expect(await conteo('reinicios')).toBe(0)
  })
})

describe('ejecutar', () => {
  it('borra lo transaccional (copias de pedidos y OC, carga de ensayo, firmas, fotos), conserva configuración y correlativos, exporta la auditoría y registra el reinicio', async () => {
    await base.admin.query(`insert into wms.pedidos_despacho (pedido_id, version, numero, fecha, cliente_id, cliente_nombre, cliente_ruc, snapshot, cambios, vigente, importado_por) values ('rp-1', 1, 'PED-1', current_date, 'c', 'Cliente', null, '{}'::jsonb, '{}', true, $1)`, [base.personas.katia.id])
    await base.admin.query(`insert into wms.importaciones_pedidos (origen, ok, por) values ('prueba', true, $1)`, [base.personas.katia.id]).catch(() => undefined)
    await base.admin.query(`insert into wms.correlativos (clave, ultimo) values ('ZZ-2026', 7) on conflict (clave) do update set ultimo = 7`)
    await base.admin.query(`update wms.guia_correlativos set ultimo = 3000, confirmado = true`)
    const conservadas = Object.fromEntries(await Promise.all(CONSERVAR.filter((t: string) => t !== 'reinicios' && t !== 'documentos_regulatorios').map(async (t: string) => [t, await conteo(t)])))
    const auditoriaAntes = await conteo('audit_events')
    const almacen = almacenFalso(['actas/a.pdf', 'entregas/f1.jpg', 'firmas/x.png', 'registro/rs-conservar.pdf'])
    const salida = mkdtempSync(join(tmpdir(), 'reinicio-'))
    const inf = await reiniciar(base.admin, { ejecutar: true, almacen, salida, ejecutadoPor: 'prueba', fechaCopia: hoyLima() })
    // lo transaccional quedó vacío
    for (const t of tablasTransaccionales()) expect(await conteo(t), t).toBe(0)
    expect(await conteo('audit_events')).toBe(0)
    // la configuración sigue igual; los correlativos vuelven a su base
    for (const [t, n] of Object.entries(conservadas)) expect(await conteo(t), t).toBe(n)
    expect((await uno(`select count(*)::int n from wms.correlativos where ultimo <> 0`)).n).toBe(0)
    expect(await uno(`select ultimo, confirmado from wms.guia_correlativos where serie = 'TTT1'`)).toMatchObject({ ultimo: 2887, confirmado: false })   // la serie real NO vuelve a 0
    expect((await uno(`select count(*)::int n from wms.documentos_regulatorios where lote_id is not null`)).n).toBe(0)   // el COA de un lote del piloto se borra
    expect((await uno(`select count(*)::int n from wms.documentos_regulatorios`)).n).toBe(1)                              // el registro sanitario del producto se conserva
    // la auditoría quedó en un archivo fuera de la base, completa
    expect(inf.auditoriaArchivo && existsSync(inf.auditoriaArchivo)).toBe(true)
    expect(readFileSync(inf.auditoriaArchivo, 'utf8').trim().split('\n')).toHaveLength(auditoriaAntes)
    // los archivos: se borran todos salvo los de documentos regulatorios que se conservan
    expect([...almacen.vivos].sort()).toEqual(['registro/rs-conservar.pdf'])
    // el reinicio quedó registrado, fuera de lo que se borra, y el registro solo se agrega
    const reg = await uno('select * from wms.reinicios')
    expect(reg).toMatchObject({ ejecutado_por: 'prueba', auditoria_filas: auditoriaAntes })
    expect(reg.tablas.lotes).toBeGreaterThan(0); expect(reg.tablas.cargas_iniciales).toBe(1)
    expect(reg.archivos).toMatchObject({ borrados: 3, conservados: 1 })
    expect((await falla(base.admin.query('delete from wms.reinicios'))).message).toMatch(/solo admite agregar/)
    expect((await falla(como(base.personas.admin.id, (c) => c.query(`insert into wms.reinicios (fecha_copia, ejecutado_por, tablas) values (current_date, 'x', '{}')`)))).code).toBeTruthy()
    // el sistema sigue sano: sin descuadres, y se puede cargar de nuevo
    expect((await q('select * from wms.verificar_saldos()')).length).toBe(0)
    expect(inf.registro).toBe(reg.id)
  })
  it('un segundo reinicio también se registra; si falla en la base, no queda nada a medias', async () => {
    await reiniciar(base.admin, { ejecutar: true, salida: mkdtempSync(join(tmpdir(), 'reinicio-')), ejecutadoPor: 'prueba-2' })
    expect(await conteo('reinicios')).toBe(2)
    await base.admin.query('create table wms.zz_tabla_nueva (id int)')
    try { await expect(reiniciar(base.admin, { ejecutar: true })).rejects.toThrow(/sin decidir/) } finally { await base.admin.query('drop table wms.zz_tabla_nueva') }
    expect(await conteo('reinicios')).toBe(2)
  })
  it('listarArchivos recorre las carpetas del bucket', async () => {
    expect((await listarArchivos(almacenFalso(['a/b/c.pdf', 'a/d.pdf', 'e.pdf']))).sort()).toEqual(['a/b/c.pdf', 'a/d.pdf', 'e.pdf'])
    void randomUUID; void idPosicion
  })
})

describe('el script desde la línea de comandos', () => {
  it('con --ejecutar y sin la copia del día se niega (código 2) antes de conectarse a nada', async () => {
    const { spawnSync } = await import('node:child_process')
    const r = spawnSync('node', [join(__dirname, '../../scripts/reinicio-piloto.mjs'), '--ejecutar', '--db-url', 'postgres://nadie@127.0.0.1:1/x'], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/falta --confirmo-copia-del-dia/)
    const r2 = spawnSync('node', [join(__dirname, '../../scripts/reinicio-piloto.mjs'), '--ejecutar', '--confirmo-copia-del-dia', '2020-01-01', '--db-url', 'postgres://nadie@127.0.0.1:1/x'], { encoding: 'utf8' })
    expect(r2.status).toBe(2); expect(r2.stderr).toMatch(/copia DEL DÍA/)
  })
})
