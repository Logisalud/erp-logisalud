// OS-7 (migración 0027): cambios del LS-FR.43.03 (cierre de ruta con data logger, impresión registrada, escaneo firmado a 5 años) y la carga inicial como
// «cambio de sistema» (una sola confirmación de Dirección Técnica; recorrido ingreso en Cuarentena → liberación → ubicación final en el libro mayor).
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla, idPosicion, idPropietario } from './helpers'

let base: BaseDePrueba
let jt: string
let jefeAlmacen: string
let dtId: string
let asistente: string
let aux: string
let admin: string
let n = 0

const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const como = <T>(id: string, fn: (c: import('pg').Client) => Promise<T>) => base.como(id, fn)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}

beforeAll(async () => {
  base = await crearBaseDePrueba()
  jt = await persona('jefe_transporte')
  jefeAlmacen = base.personas.charlie.id
  dtId = base.personas.katia.id
  asistente = base.personas.sandra.id
  aux = base.personas.aux.id
  admin = base.personas.admin.id
}, 120_000)
afterAll(async () => { await base?.cerrar() })

// ── LS-FR.43.03 ───────────────────────────────────────────────────────────────────────────────────────────────────

async function ruta(estado: string, fecha = '2026-10-20') {
  n += 1
  const r = (await uno(`insert into wms.rutas (numero, fecha, estado, creada_por) values ($1, $2, $3, $4) returning id`, [`RUT-OS7-${n}-${randomUUID().slice(0, 4)}`, fecha, estado, jt])).id as string
  await base.admin.query(`insert into wms.registros_ls_fr_43_03 (ruta_id, codigo, version_formato, creado_por) values ($1, 'LS-FR.43.03', '01', $2)`, [r, jt])
  return r
}
const adjunto = (tipo: string, contenido: string = randomUUID()) => { const hash = sha(contenido); return { ref: `${tipo}/${hash.slice(0, 16)}-archivo.csv`, hash } }
const cerrar = (quien: string, r: string, min: number | null, max: number | null, a = adjunto('data_logger'), bytes = 2048) =>
  como(quien, async (c) => (await c.query('select wms.cerrar_ruta($1, $2, $3, $4, $5, $6, $7, $8, $9) id', [r, min, max, a.ref, 'logger.csv', a.hash, bytes, 'text/csv', 'Sin novedades'])).rows[0].id as string)
const estadoRuta = async (r: string) => (await uno('select estado from wms.rutas where id = $1', [r])).estado as string
const estadoRegistro = async (r: string) => (await uno('select estado from wms.registros_ls_fr_43_03 where ruta_id = $1', [r])).estado as string

describe('LS-FR.43.03: lo que DT resolvió deja de estar pendiente', () => {
  it('USUARIO, cajas = bultos, temperatura y copia física quedan resueltos; el formato del archivo del data logger sigue pendiente', async () => {
    const p = Object.fromEntries((await q(`select clave, valor from wms.parametros where clave like 'ls_fr_43_03_%' or clave = 'cajas_equivale_a_bultos'`)).map((x) => [x.clave, x.valor]))
    expect(p.ls_fr_43_03_usuario_significado).toMatch(/Jefe de Transporte/)
    expect(p.cajas_equivale_a_bultos).toBe('SI')
    expect(p.ls_fr_43_03_temperatura_metodo).toMatch(/Elitech GSP-6/)
    expect(p.ls_fr_43_03_copia_fisica).toBe('SI')
    expect(p.ls_fr_43_03_conservacion_anios).toBe('5')
    expect(p.ls_fr_43_03_logger_formato).toBe('PENDIENTE')
    expect(p.ls_fr_43_03_temperatura_fuera_de_rango).toBe('PENDIENTE')
  })
})

describe('cerrar la ruta (data logger, mínima y máxima)', () => {
  it('solo el Jefe de Transporte cierra', async () => {
    const r = await ruta('EN_RUTA')
    for (const quien of [aux, jefeAlmacen, dtId, asistente]) expect((await falla(cerrar(quien, r, 17, 22))).code).toBe('42501')
    expect(await estadoRuta(r)).toBe('EN_RUTA')
    await cerrar(jt, r, 17, 22)
    expect(await estadoRuta(r)).toBe('CERRADA')
  })

  it('solo se cierra una ruta que ya salió (EN_RUTA o PENDIENTE_CIERRE), una sola vez', async () => {
    for (const e of ['BORRADOR', 'PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA', 'CANCELADA']) {
      expect((await falla(cerrar(jt, await ruta(e), 17, 22))).message, e).toMatch(/todavía no salió/)
    }
    const r = await ruta('PENDIENTE_CIERRE')
    await cerrar(jt, r, 17, 22)
    expect((await falla(cerrar(jt, r, 17, 22))).message).toMatch(/ya está cerrada/)
  })

  it('pide mínima y máxima coherentes y el archivo del data logger', async () => {
    const r = await ruta('EN_RUTA')
    expect((await falla(cerrar(jt, r, null, 22))).message).toMatch(/mínima y la máxima/)
    expect((await falla(cerrar(jt, r, 25, 18))).message).toMatch(/mínima no puede ser mayor/)
    expect((await falla(cerrar(jt, r, -80, 18))).message).toMatch(/Revisa las temperaturas/)
    const mal = { ref: 'otra_carpeta/xxxx-logger.csv', hash: sha('x') }
    expect((await falla(cerrar(jt, r, 17, 22, mal))).message).toMatch(/no se subió bien/)
    expect((await falla(cerrar(jt, r, 17, 22, adjunto('data_logger'), 0))).message).toMatch(/vacío/)
    expect((await falla(como(jt, (c) => c.query(`select wms.cerrar_ruta($1, 17, 22, '', '', '', 0)`, [r])))).message).toMatch(/Adjunta el archivo/)
    expect(await estadoRuta(r)).toBe('EN_RUTA')
  })

  it('guarda el archivo tal cual con su hash, quién y cuándo; fuera del rango del formato se marca (sin bloquear)', async () => {
    const r = await ruta('EN_RUTA')
    const a = adjunto('data_logger', 'contenido-del-logger')
    await cerrar(jt, r, 14.5, 26.0, a)
    const c = await uno('select * from wms.ruta_cierres where ruta_id = $1', [r])
    expect(Number(c.temp_min)).toBe(14.5)
    expect(Number(c.temp_max)).toBe(26)
    expect(c.fuera_de_rango).toBe(true)
    expect(c.archivo_ref).toBe(a.ref)
    expect(c.archivo_hash).toBe(a.hash)
    expect(c.cerrado_por).toBe(jt)
    expect(c.cerrado_en).toBeTruthy()
    const dentro = await ruta('EN_RUTA')
    await cerrar(jt, dentro, 16, 24)
    expect((await uno('select fuera_de_rango from wms.ruta_cierres where ruta_id = $1', [dentro])).fuera_de_rango).toBe(false)
  })

  it('un cierre no se edita ni se borra; corregirlo crea una versión nueva con motivo y la anterior queda', async () => {
    const r = await ruta('EN_RUTA')
    await cerrar(jt, r, 17, 22)
    const id = (await uno('select id from wms.ruta_cierres where ruta_id = $1', [r])).id
    for (const sql of [`update wms.ruta_cierres set temp_max = 30 where id = $1`, `delete from wms.ruta_cierres where id = $1`]) {
      expect((await falla(base.admin.query(sql, [id]))).message).toMatch(/no se borra|no se edita/)
    }
    const a = adjunto('data_logger', 'otro')
    const corregir = (quien: string, motivo: string | null) => como(quien, (c) => c.query('select wms.corregir_cierre_ruta($1, 18, 23, $2, $3, $4, 100, $5, null)', [r, a.ref, 'logger2.csv', a.hash, motivo]))
    expect((await falla(corregir(jt, null))).message).toMatch(/por qué se corrige/)
    expect((await falla(corregir(aux, 'x'))).code).toBe('42501')
    await corregir(jt, 'Subí el archivo equivocado')
    const v = await q('select version, vigente, temp_max from wms.ruta_cierres where ruta_id = $1 order by version', [r])
    expect(v.map((x) => [x.version, x.vigente, Number(x.temp_max)])).toEqual([[1, false, 22], [2, true, 23]])
  })

  it('no se corrige un cierre que no existe (ruta sin cerrar)', async () => {
    const r = await ruta('EN_RUTA')
    const a = adjunto('data_logger')
    expect((await falla(como(jt, (c) => c.query('select wms.corregir_cierre_ruta($1, 18, 23, $2, $3, $4, 100, $5, null)', [r, a.ref, 'l.csv', a.hash, 'motivo'])))).message).toMatch(/todavía no está cerrada/)
  })

  it('la ruta cerrada libera al vehículo y al personal para planificar otra ese día', async () => {
    const veh = (await uno(`insert into wms.vehiculos (placa) values ($1) returning id`, [`V${randomUUID().slice(0, 5)}`.toUpperCase()])).id
    const r = await ruta('EN_RUTA')
    await base.admin.query('update wms.rutas set vehiculo_id = $2 where id = $1', [r, veh])
    await cerrar(jt, r, 17, 22)
    expect((await uno(`select count(*)::int n from wms.rutas where vehiculo_id = $1 and estado not in ('CERRADA', 'CANCELADA')`, [veh])).n).toBe(0)
  })
})

describe('imprimir la copia que viaja con el conductor', () => {
  it('queda registrado quién y cuándo, y si fue antes de la salida', async () => {
    const r = await ruta('LISTA_PARA_CARGA')
    expect(await estadoRegistro(r)).toBe('BASE')
    expect(await como(jt, async (c) => (await c.query('select wms.registrar_impresion_ls_fr($1) n', [r])).rows[0].n)).toBe(1)
    expect(await como(jefeAlmacen, async (c) => (await c.query('select wms.registrar_impresion_ls_fr($1) n', [r])).rows[0].n)).toBe(2)
    const f = await q('select por, antes_de_salir, estado_ruta from wms.ls_fr_impresiones where ruta_id = $1 order by en', [r])
    expect(f.map((x) => [x.por, x.antes_de_salir])).toEqual([[jt, true], [jefeAlmacen, true]])
    expect(await estadoRegistro(r)).toBe('GENERADO')
    await base.admin.query(`update wms.rutas set estado = 'EN_RUTA' where id = $1`, [r])
    await como(jt, (c) => c.query('select wms.registrar_impresion_ls_fr($1)', [r]))
    expect((await uno('select antes_de_salir from wms.ls_fr_impresiones where ruta_id = $1 order by en desc limit 1', [r])).antes_de_salir).toBe(false)
  })

  it('el auxiliar no registra impresiones, la historia no se borra y una ruta sin registro no se imprime', async () => {
    const r = await ruta('PLANIFICADA')
    expect((await falla(como(aux, (c) => c.query('select wms.registrar_impresion_ls_fr($1)', [r])))).code).toBe('42501')
    await como(jt, (c) => c.query('select wms.registrar_impresion_ls_fr($1)', [r]))
    expect((await falla(base.admin.query('delete from wms.ls_fr_impresiones where ruta_id = $1', [r]))).message).toBeTruthy()
    const sinRegistro = (await uno(`insert into wms.rutas (numero, fecha, estado, creada_por) values ($1, '2026-10-20', 'BORRADOR', $2) returning id`, [`RUT-OS7-SR-${randomUUID().slice(0, 4)}`, jt])).id
    expect((await falla(como(jt, (c) => c.query('select wms.registrar_impresion_ls_fr($1)', [sinRegistro])))).message).toMatch(/nace al confirmar/)
  })
})

describe('escaneo firmado (conductor y Dirección Técnica), conservado 5 años', () => {
  const subir = (quien: string, r: string, a = adjunto('ls_fr_escaneo'), motivo: string | null = null) =>
    como(quien, async (c) => (await c.query('select wms.subir_escaneo_ls_fr($1, $2, $3, $4, 5000, $5, $6) id', [r, a.ref, 'firmado.pdf', a.hash, motivo, 'application/pdf'])).rows[0].id as string)

  it('se sube desde que la unidad se libera, queda ligado a la ruta con su fecha «conservar hasta» (fecha de la ruta + 5 años)', async () => {
    const r = await ruta('PLANIFICADA', '2026-10-20')
    expect((await falla(subir(jt, r))).message).toMatch(/ya fue liberada/)
    await base.admin.query(`update wms.rutas set estado = 'EN_RUTA' where id = $1`, [r])
    for (const quien of [aux]) expect((await falla(subir(quien, r))).code).toBe('42501')
    await subir(asistente, r)
    const e = await uno('select * from wms.ls_fr_escaneos where ruta_id = $1', [r])
    expect(e.subido_por).toBe(asistente)
    expect(e.conservar_hasta.toISOString?.().slice(0, 10) ?? String(e.conservar_hasta)).toMatch(/2031-10-20/)
    expect(e.vigente).toBe(true)
  })

  it('el plazo es un parámetro', async () => {
    await base.admin.query(`update wms.parametros set valor = '7' where clave = 'ls_fr_43_03_conservacion_anios'`)
    try {
      const r = await ruta('EN_RUTA', '2026-11-02')
      await subir(jt, r)
      expect(String((await uno('select conservar_hasta::text d from wms.ls_fr_escaneos where ruta_id = $1', [r])).d)).toBe('2033-11-02')
    } finally { await base.admin.query(`update wms.parametros set valor = '5' where clave = 'ls_fr_43_03_conservacion_anios'`) }
  })

  it('cambiarlo exige motivo y deja el anterior; nada se borra', async () => {
    const r = await ruta('EN_RUTA')
    await subir(jt, r)
    expect((await falla(subir(jt, r))).message).toMatch(/cuenta por qué/)
    await subir(jt, r, adjunto('ls_fr_escaneo', 'segundo'), 'La primera foto salió movida')
    const v = await q('select version, vigente, motivo from wms.ls_fr_escaneos where ruta_id = $1 order by version', [r])
    expect(v.map((x) => [x.version, x.vigente])).toEqual([[1, false], [2, true]])
    expect(v[1].motivo).toMatch(/movida/)
    const id = (await uno('select id from wms.ls_fr_escaneos where ruta_id = $1 and version = 1', [r])).id
    expect((await falla(base.admin.query('delete from wms.ls_fr_escaneos where id = $1', [id]))).message).toMatch(/no se borra/)
    expect((await falla(base.admin.query(`update wms.ls_fr_escaneos set archivo_ref = 'x' where id = $1`, [id]))).message).toMatch(/no se edita/)
  })

  it('el registro avanza: generado → completo (cerrada) → archivado (con el escaneo firmado)', async () => {
    const r = await ruta('EN_RUTA')
    await cerrar(jt, r, 17, 22)
    expect(await estadoRegistro(r)).toBe('COMPLETO')
    await subir(jt, r)
    expect(await estadoRegistro(r)).toBe('ARCHIVADO')
    const r2 = await ruta('EN_RUTA')
    await subir(jt, r2)
    expect(await estadoRegistro(r2)).toBe('BASE')
    await cerrar(jt, r2, 17, 22)
    expect(await estadoRegistro(r2)).toBe('ARCHIVADO')
  })

  it('los clientes y quien no es del personal no ven nada de esto', async () => {
    const sinRol = base.personas.sinRol.id
    for (const t of ['ruta_cierres', 'ls_fr_escaneos', 'ls_fr_impresiones']) {
      expect(await como(sinRol, async (c) => (await c.query(`select count(*)::int n from wms.${t}`)).rows[0].n), t).toBe(0)
    }
  })
})

// ── Carga inicial ─────────────────────────────────────────────────────────────────────────────────────────────────

let logissa: string
let posAprobado: string
let posAprobado2: string
let posBajas: string
let posCuarentena: string
let dapa: string
const f = (extra: Record<string, unknown> = {}) => ({ producto: 'T-DAPA', lote: 'CI-L1', vence: '2029-05-31', propietario: 'LOGISSA', posicion: posAprobado, estado: 'APROBADO', cantidad: 25, ...extra })
const validar = (quien: string, filas: object[]) => como(quien, async (c) => (await c.query('select * from wms.validar_carga_inicial($1::jsonb)', [JSON.stringify(filas)])).rows as { fila: number; error: string }[])
const crear = (quien: string, filas: object[], nota: string | null = null) => como(quien, async (c) => (await c.query('select wms.crear_carga_inicial($1::jsonb, $2) id', [JSON.stringify(filas), nota])).rows[0].id as string)
const confirmar = (quien: string, carga: string) => como(quien, async (c) => (await c.query('select wms.confirmar_carga_inicial($1) id', [carga])).rows[0].id as string)
const saldoDe = async (lote: string, pos: string, estado: string) => (await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.lotes l on l.id = s.lote_id join wms.posiciones p on p.id = s.posicion_id
  where l.codigo = $1 and p.codigo = $2 and s.estado = $3`, [lote, pos, estado])).n as number
const sinDescuadre = async () => expect((await q('select * from wms.verificar_saldos()')).length).toBe(0)

describe('carga inicial: cambio de sistema', () => {
  beforeAll(async () => {
    logissa = await idPropietario(base.admin, 'LOGISSA')
    dapa = base.productos.dapa
    const pos = async (area: string, propietario: string, saltar = 0) => (await q(`select p.codigo from wms.posiciones p where p.tipo_area = $1 and p.activa and wms.posicion_acepta(p.id, $2, current_date) order by p.codigo offset $3 limit 1`, [area, propietario, saltar]))[0].codigo as string
    posAprobado = await pos('APROBADOS', logissa)
    posAprobado2 = await pos('APROBADOS', logissa, 1)
    posBajas = await pos('BAJAS_RECHAZADOS', logissa)
    posCuarentena = await pos('CUARENTENA', logissa)
  })

  it('todo lote lleva código de lote y vencimiento: una fila sin ellos se rechaza con un mensaje claro', async () => {
    const r = await validar(admin, [f({ lote: '' }), f({ lote: 'X-1', vence: '' }), f({ lote: 'X-2', vence: 'no-es-fecha' }), f({ lote: 'X-3', vence: null })])
    expect(r.map((x) => x.fila)).toEqual([1, 2, 3, 4])
    expect(r[0].error).toMatch(/Falta el código de lote: todo lote necesita código de lote y fecha de vencimiento/)
    expect(r[1].error).toMatch(/Falta la fecha de vencimiento: todo lote necesita/)
    expect(r[2].error).toMatch(/fecha de vencimiento no es válida/)
    expect(r[3].error).toMatch(/Falta la fecha de vencimiento/)
    expect((await falla(crear(admin, [f({ vence: '' })]))).message).toMatch(/1 filas con errores/)
  })

  it('la base también lo impone: una línea sin vencimiento no entra a la tabla', async () => {
    const carga = await crear(admin, [f({ lote: 'CI-TABLA' })])
    const e = await falla(base.admin.query(`insert into wms.cargas_iniciales_lineas (carga_id, fila, producto_id, lote_codigo, vence, propietario_id, posicion_id, estado, cantidad)
      values ($1, 99, $2, 'SINFECHA', null, $3, $4, 'APROBADO', 1)`, [carga, dapa, logissa, await idPosicion(base.admin, posAprobado)]))
    expect(e.message).toMatch(/cargas_iniciales_lineas_vence_check/)
  })

  it('la vista previa explica los demás errores: producto, ubicación, estado, registro sanitario, lotes repetidos y combinaciones duplicadas', async () => {
    const r = await validar(base.personas.katia.id, [
      f({ lote: 'V-OK' }),
      f({ lote: 'V-2', producto: 'NO-EXISTE' }),
      f({ lote: 'V-3', posicion: posCuarentena }),
      f({ lote: 'V-4', estado: 'DEVOLUCIONES' }),
      f({ lote: 'V-5', producto: 'T-LIZI' }),
      f({ lote: 'V-6', cantidad: 0 }),
      f({ lote: 'V-OK' }),
      f({ lote: 'V-OK', vence: '2030-01-01', posicion: posAprobado2 }),
    ])
    const por = (fila: number) => r.filter((x) => x.fila === fila).map((x) => x.error).join(' | ')
    expect(por(1)).toBe('')
    expect(por(2)).toMatch(/no existe en el catálogo/)
    expect(por(3)).toMatch(/no admite unidades en estado APROBADO/)
    expect(por(4)).toMatch(/no se carga: usa Aprobado, Cuarentena o Bajas/)
    expect(por(5)).toMatch(/registro sanitario .* vencido/)
    expect(por(6)).toMatch(/cantidad/)
    expect(por(7)).toMatch(/ya está en la fila 1/)
    expect(por(8)).toMatch(/dos vencimientos distintos/)
  })

  it('un producto sin registro sanitario cargado no entra Aprobado (pero sí en Cuarentena)', async () => {
    const sinRs = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ('T-SINRS', 'Sin RS (prueba)', 'TABLETA') returning id`)).id
    void sinRs
    const r = await validar(admin, [f({ producto: 'T-SINRS', lote: 'S-1' }), f({ producto: 'T-SINRS', lote: 'S-2', posicion: posCuarentena, estado: 'CUARENTENA' })])
    expect(r.map((x) => x.fila)).toEqual([1])
    expect(r[0].error).toMatch(/no tiene su registro sanitario y su vencimiento cargados/)
  })

  it('solo administración y Dirección Técnica preparan la carga; el resto, no', async () => {
    for (const quien of [jefeAlmacen, aux, asistente, jt]) expect((await falla(validar(quien, [f()]))).code, quien).toBe('42501')
    await crear(base.personas.katia.id, [f({ lote: 'DT-PREPARA' })])
  })

  it('UNA confirmación de Dirección Técnica deja cada cosa en su estado y ubicación, sin acta, y el libro muestra el recorrido', async () => {
    const filas = [
      f({ lote: 'CI-A', cantidad: 30 }),
      f({ lote: 'CI-B', posicion: posBajas, estado: 'BAJAS_RECHAZADOS', cantidad: 4 }),
      f({ lote: 'CI-C', posicion: posCuarentena, estado: 'CUARENTENA', cantidad: 6 }),
    ]
    const carga = await crear(admin, filas, 'Corte de Odoo (prueba)')
    for (const quien of [admin, jefeAlmacen, asistente, aux, jt]) expect((await falla(confirmar(quien, carga))).code, quien).toBe('42501')
    expect((await uno('select estado from wms.cargas_iniciales where id = $1', [carga])).estado).toBe('BORRADOR')

    const antesActas = (await uno('select (select count(*) from wms.actas_organolepticas)::int o, (select count(*) from wms.ingresos)::int i')) as { o: number; i: number }
    await confirmar(dtId, carga)

    expect(await saldoDe('CI-A', posAprobado, 'APROBADO')).toBe(30)
    expect(await saldoDe('CI-B', posBajas, 'BAJAS_RECHAZADOS')).toBe(4)
    expect(await saldoDe('CI-C', posCuarentena, 'CUARENTENA')).toBe(6)
    // En la ubicación intermedia de Cuarentena no queda nada de lo que se liberó o se dio de baja
    expect((await uno(`select coalesce(sum(s.cantidad), 0)::int n from wms.saldos s join wms.lotes l on l.id = s.lote_id where l.codigo in ('CI-A', 'CI-B') and s.estado = 'CUARENTENA'`)).n).toBe(0)
    const despues = (await uno('select (select count(*) from wms.actas_organolepticas)::int o, (select count(*) from wms.ingresos)::int i')) as { o: number; i: number }
    expect(despues).toEqual(antesActas)
    const c = await uno('select * from wms.cargas_iniciales where id = $1', [carga])
    expect(c.estado).toBe('CONFIRMADA')
    expect(c.confirmado_por).toBe(dtId)
    expect(c.movimiento_liberacion_id && c.movimiento_baja_id && c.movimiento_ubicacion_id && c.movimiento_aprobados_id).toBeTruthy()
    await sinDescuadre()

    // Historia del lote Aprobado: ingreso en Cuarentena → liberación → ubicación final, con movimientos reales
    const lote = (await uno(`select id from wms.lotes where codigo = 'CI-A'`)).id
    const h = await como(dtId, async (cl) => (await cl.query('select tipo, motivo, posicion, estado, delta, referencia_id from wms.historia_lote($1)', [lote])).rows)
    expect(h.map((x) => [x.tipo, x.estado, x.delta])).toEqual([
      ['CARGA_INICIAL', 'CUARENTENA', 30], ['CAMBIO_ESTADO', 'CUARENTENA', -30], ['CAMBIO_ESTADO', 'APROBADO', 30], ['MOVIMIENTO', 'APROBADO', -30], ['MOVIMIENTO', 'APROBADO', 30],
    ])
    expect(h[0].motivo).toMatch(/ingreso en Cuarentena → liberación → ubicación final/)
    expect(h[1].motivo).toMatch(/Liberación por carga inicial/)
    expect(h[3].motivo).toMatch(/Ubicación final por carga inicial/)
    expect(h[4].posicion).toBe(posAprobado)
    expect(h.every((x) => x.referencia_id === c.numero)).toBe(true)
    // El Kardex ve el ingreso (una sola entrada) con su recorrido en el motivo
    const k = await como(dtId, async (cl) => (await cl.query('select entrada, salida, saldo, tipo_documento, motivo from wms.kardex_filas($1, $2)', [dapa, lote])).rows)
    expect(k).toHaveLength(1)
    expect([k[0].entrada, k[0].saldo, k[0].tipo_documento]).toEqual([30, 30, 'Carga inicial'])
    expect(k[0].motivo).toMatch(/liberación/)
    // Lo dado de baja dice «baja»; lo que se queda en Cuarentena no promete nada más
    const hb = await como(dtId, async (cl) => (await cl.query(`select motivo from wms.historia_lote((select id from wms.lotes where codigo = 'CI-B')) order by partida_id`)).rows)
    expect(hb.map((x) => x.motivo).join(' | ')).toMatch(/ingreso en Cuarentena → baja → ubicación en Bajas.*Baja por carga inicial.*Ubicación final/)
    const hc = await como(dtId, async (cl) => (await cl.query(`select tipo, motivo from wms.historia_lote((select id from wms.lotes where codigo = 'CI-C'))`)).rows)
    expect(hc).toHaveLength(1)
    expect(hc[0].motivo).toMatch(/se queda en Cuarentena/)
  })

  it('solo se confirma una vez y no se vuelve a decidir un estado para toda la carga', async () => {
    const carga = await crear(admin, [f({ lote: 'CI-UNA', cantidad: 3 })])
    await confirmar(dtId, carga)
    expect((await falla(confirmar(dtId, carga))).message).toMatch(/ya no está en borrador/)
    expect(await saldoDe('CI-UNA', posAprobado, 'APROBADO')).toBe(3)
    expect((await falla(como(dtId, (c) => c.query(`select wms.decidir_estado_carga_inicial('APROBADO')`)))).message).toMatch(/Este paso ya no existe/)
  })

  it('al confirmar se vuelve a validar: si el registro sanitario venció entre la vista previa y hoy, no entra nada', async () => {
    const prod = (await uno(`insert into catalogo.productos (codigo, descripcion, unidad_medida) values ('T-RSVENCE', 'RS que vence (prueba)', 'TABLETA') returning id`)).id
    await base.admin.query(`insert into wms.producto_regulatorio (producto_id, registro_sanitario, rs_vence, estado_validacion, creado_por, validado_por, validado_en) values ($1, 'EG-7', '2031-01-01', 'VALIDADO', $2, $2, now())`, [prod, dtId])
    const carga = await crear(admin, [f({ producto: 'T-RSVENCE', lote: 'CI-RS', cantidad: 5 }), f({ lote: 'CI-RS-OK', cantidad: 2, posicion: posAprobado2 })])
    await base.admin.query(`update wms.producto_regulatorio set rs_vence = '2020-01-01' where producto_id = $1`, [prod])
    expect((await falla(confirmar(dtId, carga))).message).toMatch(/1 filas con errores/)
    expect((await uno(`select count(*)::int n from wms.lotes where codigo in ('CI-RS', 'CI-RS-OK')`)).n).toBe(0)
    expect((await uno('select estado from wms.cargas_iniciales where id = $1', [carga])).estado).toBe('BORRADOR')
    await sinDescuadre()
  })

  it('un lote que ya existe con otro vencimiento se rechaza, sin que entre nada', async () => {
    await base.admin.query(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'CI-EXISTE', '2027-01-01', $2)`, [dapa, logissa])
    const r = await validar(admin, [f({ lote: 'CI-EXISTE', vence: '2028-01-01' })])
    expect(r[0].error).toMatch(/ya existe con otro vencimiento/)
  })

  it('el contexto de la carga no abre la puerta a nadie más: sin la confirmación de Dirección Técnica, el libro sigue cerrado', async () => {
    const carga = await crear(admin, [f({ lote: 'CI-FORJA', cantidad: 1 })])
    const pos = await idPosicion(base.admin, posAprobado)
    const lote = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'CI-FORJA-L', '2029-01-01', $2) returning id`, [dapa, logissa])).id
    const partidas = JSON.stringify([{ posicion_id: pos, producto_id: dapa, lote_id: lote, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: 5 }])
    for (const quien of [jefeAlmacen, aux, asistente, jt]) {
      const t = await base.transaccionComo(quien)
      try {
        await t.cliente.query(`select set_config('wms.carga_ctx', $1, true)`, [carga])
        const e = await falla(t.cliente.query(`select wms.postear_movimiento('CARGA_INICIAL', 'forjado', $1::jsonb)`, [partidas]))
        expect(e.code, quien).toBe('42501')
      } finally { await t.rollback() }
    }
    // Dirección Técnica por su cuenta (sin pasar por la confirmación) tampoco registra movimientos sueltos
    expect((await falla(como(dtId, (c) => c.query(`select wms.postear_movimiento('CARGA_INICIAL', 'suelto', $1::jsonb)`, [partidas])))).code).toBe('42501')
    expect((await falla(como(dtId, (c) => c.query(`select wms.postear_movimiento('MOVIMIENTO', 'suelto', $1::jsonb)`, [partidas])))).code).toBe('42501')
    expect(await saldoDe('CI-FORJA-L', posAprobado, 'APROBADO')).toBe(0)
  })

  it('la carga de administración sigue funcionando para sembrar stock directo (los demás tests de la suite lo usan)', async () => {
    const pos = await idPosicion(base.admin, posAprobado2)
    const lote = (await uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, 'CI-DIRECTO', '2029-01-01', $2) returning id`, [dapa, logissa])).id
    const partidas = JSON.stringify([{ posicion_id: pos, producto_id: dapa, lote_id: lote, propietario_id: logissa, estado: 'APROBADO', origen: 'CARGA_INICIAL', procedencia_id: randomUUID(), delta: 5 }])
    await como(admin, (c) => c.query(`select wms.postear_movimiento('CARGA_INICIAL', 'directo', $1::jsonb)`, [partidas]))
    expect(await saldoDe('CI-DIRECTO', posAprobado2, 'APROBADO')).toBe(5)
  })
})

describe('la migración 0027', () => {
  it('es re-ejecutable (no duplica permisos ni parámetros, no vuelve a parchar postear_movimiento) y la confirmación sigue funcionando', async () => {
    const antes = (await uno(`select (select count(*) from wms.permisos_rol)::int p, (select count(*) from wms.parametros)::int q`)) as { p: number; q: number }
    await base.admin.query(SQL.m0027())
    await base.admin.query(SQL.m0027())
    expect(await uno(`select (select count(*) from wms.permisos_rol)::int p, (select count(*) from wms.parametros)::int q`)).toEqual(antes)
    const def = (await uno(`select pg_get_functiondef('wms.postear_movimiento(text, text, jsonb, text, text, text, text, uuid)'::regprocedure) d`)).d as string
    expect(def.split('_carga_en_confirmacion').length - 1).toBe(2)
    const carga = await crear(admin, [f({ lote: 'CI-REEJECUTADA', cantidad: 2 })])
    await confirmar(dtId, carga)
    expect(await saldoDe('CI-REEJECUTADA', posAprobado, 'APROBADO')).toBe(2)
  })
})
