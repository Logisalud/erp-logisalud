// Batch 3b (migración 0009): revisión diaria (INV-04), programación de los 3 conteos semanales (INV-05),
// vistas guardadas de reportes y exactitud de inventario.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, sembrarStock } from './helpers'

let base: BaseDePrueba
beforeAll(async () => { base = await crearBaseDePrueba() }, 60_000)
afterAll(async () => { await base?.cerrar() })
const P = () => base.personas

async function persona(rol: string): Promise<string> {
  const id = randomUUID()
  await base.admin.query('insert into auth.users (id) values ($1)', [id])
  await base.admin.query('insert into wms.usuario_roles (user_id, rol) values ($1, $2)', [id, rol])
  return id
}
const rpc = <T = unknown>(quien: string, sql: string, args: unknown[] = []) =>
  base.como(quien, async (c) => (await c.query(sql, args)).rows as T[])
const hoy = async () => (await base.admin.query(`select wms._hoy_lima()::text as d`)).rows[0].d as string

describe('revisión diaria (INV-04)', () => {
  const iniciar = async (quien = P().charlie.id) => (await rpc<{ id: string }>(quien, 'select wms.iniciar_revision_diaria() as id'))[0].id
  const focos = ['ORDEN', 'LIMPIEZA', 'UBICACIONES', 'ANORMAL']
  // Una revisión por día: la que se cerró en una prueba se pasa a un día anterior para que la siguiente prueba parta de una abierta.
  let atras = 0
  const archivar = async (id: string) => {
    atras += 1
    await base.admin.query(`update wms.revisiones_diarias set fecha = fecha - $2::int, numero = 'RD-' || to_char(fecha - $2::int, 'YYYYMMDD') where id = $1`, [id, atras])
  }

  it('solo el Jefe (o su reemplazo) hace el recorrido; hay una revisión por día', async () => {
    const aux = await persona('auxiliar')
    expect((await falla(iniciar(aux))).code).toBe('42501')
    expect((await falla(iniciar(P().katia.id))).code).toBe('42501')
    const a = await iniciar()
    const reemplazo = await persona('reemplazo_jefe')
    expect(await iniciar(reemplazo)).toBe(a) // la misma del día, no otra
    const r = (await base.admin.query('select numero, estado, fecha::text from wms.revisiones_diarias where id = $1', [a])).rows[0]
    expect(r).toMatchObject({ estado: 'ABIERTA', fecha: await hoy() })
    expect(r.numero).toMatch(/^RD-\d{8}$/)
  })

  it('no se cierra hasta revisar los 4 focos; con todo en orden cierra y deja auditoría', async () => {
    const id = await iniciar()
    const e = await falla(rpc(P().charlie.id, 'select wms.cerrar_revision_diaria($1)', [id]))
    expect(e.message).toMatch(/Falta revisar: orden y circulación, limpieza, ubicaciones, situaciones anormales/)
    for (const f of focos.slice(0, 3)) await rpc(P().charlie.id, `select wms.marcar_foco($1, $2, 'SIN_PROBLEMAS')`, [id, f])
    expect((await falla(rpc(P().charlie.id, 'select wms.cerrar_revision_diaria($1)', [id]))).message).toMatch(/Falta revisar: situaciones anormales/)
    await rpc(P().charlie.id, `select wms.marcar_foco($1, 'ANORMAL', 'SIN_PROBLEMAS')`, [id])
    await rpc(P().charlie.id, `select wms.cerrar_revision_diaria($1, 'Todo en orden')`, [id])
    expect((await base.admin.query('select estado, nota_cierre from wms.revisiones_diarias where id = $1', [id])).rows[0]).toMatchObject({ estado: 'CERRADA', nota_cierre: 'Todo en orden' })
    const a = await base.admin.query(`select evento from wms.audit_events where entidad_id = $1 order by id`, [id])
    expect(a.rows.map((x) => x.evento)).toEqual(['revision_diaria_iniciada', 'revision_diaria_cerrada'])
    // una revisión cerrada ya no recibe pendientes ni cambios de foco
    const aux = await persona('auxiliar')
    expect((await falla(rpc(P().charlie.id, `select wms.registrar_pendiente($1, 'ORDEN', 'Caja en el pasillo', $2)`, [id, aux]))).message).toMatch(/ya está cerrada/)
    expect((await falla(rpc(P().charlie.id, `select wms.marcar_foco($1, 'ORDEN', 'SIN_PROBLEMAS')`, [id]))).message).toMatch(/ya está cerrada/)
    await archivar(id)
  })

  describe('pendientes: siempre con responsable', () => {
    it('sin responsable, sin descripción o con alguien ajeno al equipo se rechaza', async () => {
      const id = await iniciar()
      const aux = await persona('auxiliar')
      const reg = (desc: string | null, resp: string | null) =>
        rpc(P().charlie.id, `select wms.registrar_pendiente($1, 'ORDEN', $2, $3)`, [id, desc, resp])
      expect((await falla(reg('Cajas vacías en el pasillo B', null))).message).toMatch(/necesita un responsable/)
      expect((await falla(reg('  ', aux))).message).toMatch(/Cuenta qué pasó/)
      const ajeno = randomUUID()
      await base.admin.query('insert into auth.users (id) values ($1)', [ajeno])
      expect((await falla(reg('Cajas vacías', ajeno))).message).toMatch(/persona del equipo/)
      expect((await falla(rpc(aux, `select wms.registrar_pendiente($1, 'ORDEN', 'x', $2)`, [id, aux]))).code).toBe('42501')
    })

    it('registrar un pendiente marca el foco «con pendientes» y ese foco ya no puede quedar «sin problemas»', async () => {
      const id = await iniciar()
      const aux = await persona('auxiliar')
      const p = (await rpc<{ id: string }>(P().charlie.id, `select wms.registrar_pendiente($1, 'LIMPIEZA', 'Derrame junto a la puerta 2', $2, false, false, 'A-02.1') as id`, [id, aux]))[0].id
      expect((await base.admin.query(`select resultado from wms.revision_focos where revision_id = $1 and foco = 'LIMPIEZA'`, [id])).rows[0].resultado).toBe('CON_PENDIENTES')
      expect((await falla(rpc(P().charlie.id, `select wms.marcar_foco($1, 'LIMPIEZA', 'SIN_PROBLEMAS')`, [id]))).message).toMatch(/pendientes abiertos/)
      expect((await base.admin.query('select responsable_id, estado, ubicacion from wms.revision_pendientes where id = $1', [p])).rows[0]).toEqual({ responsable_id: aux, estado: 'ABIERTO', ubicacion: 'A-02.1' })
    })

    it('registrar pendientes no mueve stock ni cambia estados', async () => {
      const antes = (await base.admin.query('select count(*)::int n, coalesce(sum(delta),0)::int u from wms.partidas')).rows[0]
      const id = await iniciar()
      const aux = await persona('auxiliar')
      await rpc(P().charlie.id, `select wms.registrar_pendiente($1, 'UBICACIONES', 'Producto sin ubicar', $2)`, [id, aux])
      expect((await base.admin.query('select count(*)::int n, coalesce(sum(delta),0)::int u from wms.partidas')).rows[0]).toEqual(antes)
    })

    it('si puede afectar producto, avisa a Dirección Técnica (una sola alerta)', async () => {
      const id = await iniciar()
      const aux = await persona('auxiliar')
      const p = (await rpc<{ id: string }>(P().charlie.id, `select wms.registrar_pendiente($1, 'ANORMAL', 'Filtración sobre el rack C-3', $2, true, true) as id`, [id, aux]))[0].id
      const al = await base.admin.query(`select tipo, destinatario_rol, estado from wms.alertas where clave = $1`, ['rd-pend:' + p])
      expect(al.rows).toEqual([{ tipo: 'PENDIENTE_AFECTA_PRODUCTO', destinatario_rol: 'direccion_tecnica', estado: 'ABIERTA' }])
    })

    it('lo resuelve su responsable (o el Jefe) y el Jefe lo verifica; nadie más; un pendiente no se borra', async () => {
      const id = await iniciar()
      const aux = await persona('auxiliar'); const otro = await persona('auxiliar')
      const p = (await rpc<{ id: string }>(P().charlie.id, `select wms.registrar_pendiente($1, 'ORDEN', 'Pallet mal puesto', $2, true) as id`, [id, aux]))[0].id
      expect((await falla(rpc(otro, 'select wms.resolver_pendiente($1)', [p]))).code).toBe('42501')
      expect((await falla(rpc(aux, 'select wms.verificar_pendiente($1, true)', [p]))).code).toBe('42501') // verificar es del Jefe
      expect((await falla(rpc(P().charlie.id, 'select wms.verificar_pendiente($1, true)', [p]))).message).toMatch(/ya está resuelto/)
      await rpc(aux, `select wms.resolver_pendiente($1, 'Se reubicó el pallet')`, [p])
      expect((await falla(rpc(aux, 'select wms.resolver_pendiente($1)', [p]))).message).toMatch(/ya no está abierto/)
      // el Jefe no lo da por bueno: lo reabre con su nota
      expect((await falla(rpc(P().charlie.id, 'select wms.verificar_pendiente($1, false)', [p]))).message).toMatch(/qué falta/)
      await rpc(P().charlie.id, `select wms.verificar_pendiente($1, false, 'Sigue estorbando')`, [p])
      expect((await base.admin.query('select estado, nota_resolucion from wms.revision_pendientes where id = $1', [p])).rows[0]).toMatchObject({ estado: 'ABIERTO', nota_resolucion: 'Reabierto: Sigue estorbando' })
      await rpc(aux, 'select wms.resolver_pendiente($1)', [p])
      await rpc(P().charlie.id, 'select wms.verificar_pendiente($1, true)', [p])
      expect((await base.admin.query('select estado from wms.revision_pendientes where id = $1', [p])).rows[0].estado).toBe('VERIFICADO')
      expect((await falla(base.como(P().charlie.id, (c) => c.query('delete from wms.revision_pendientes where id = $1', [p])))).code).toBe('42501')
      expect((await falla(base.como(P().charlie.id, (c) => c.query(`update wms.revision_pendientes set responsable_id = null where id = $1`, [p])))).code).toBe('42501')
    })

    it('un pendiente abierto de ayer sigue disponible para resolver aunque la revisión esté cerrada', async () => {
      const id = await iniciar()
      const aux = await persona('auxiliar')
      const p = (await rpc<{ id: string }>(P().charlie.id, `select wms.registrar_pendiente($1, 'ORDEN', 'Pasillo con cajas', $2) as id`, [id, aux]))[0].id
      for (const f of focos) await rpc(P().charlie.id, `select wms.marcar_foco($1, $2, 'CON_PENDIENTES')`, [id, f]).catch(() => undefined)
      for (const f of focos) await base.admin.query(`insert into wms.revision_focos (revision_id, foco, resultado, revisado_por) values ($1, $2, 'CON_PENDIENTES', $3) on conflict do nothing`, [id, f, P().charlie.id])
      await rpc(P().charlie.id, 'select wms.cerrar_revision_diaria($1)', [id])
      await archivar(id)
      await rpc(aux, `select wms.resolver_pendiente($1, 'Listo')`, [p])
      expect((await base.admin.query('select estado from wms.revision_pendientes where id = $1', [p])).rows[0].estado).toBe('RESUELTO')
    })
  })

  it('el selector de responsable lista solo al equipo, una fila por persona', async () => {
    const p = await rpc<{ user_id: string; rol: string }>(P().charlie.id, 'select * from wms.personas_del_equipo()')
    expect(new Set(p.map((x) => x.user_id)).size).toBe(p.length)
    expect(p.map((x) => x.rol).every((r) => ['jefe_almacen', 'reemplazo_jefe', 'auxiliar', 'asistente_dt', 'direccion_tecnica'].includes(r))).toBe(true)
    expect(p.some((x) => x.user_id === P().auditor.id)).toBe(false)
    expect(await rpc(P().sinRol.id, 'select * from wms.personas_del_equipo()')).toEqual([])
  })
})

describe('programación de los 3 conteos semanales (INV-05)', () => {
  const lunes = async (extra = 0) => (await base.admin.query(`select (wms._lunes(wms._hoy_lima()) + $1::int)::text as d`, [extra])).rows[0].d as string
  async function posConStock(codigo: string, lote: string) {
    return (await sembrarStock(base, { posicion: codigo, producto: base.productos.dapa, lote, propietario: 'DIPHASAC', cantidad: 6 })).posicionId
  }
  const programar = (quien: string, semana: string, orden: number, pos: string[], nota: string | null = null) =>
    rpc<{ id: string }>(quien, 'select wms.programar_conteo_semanal($1::date, $2, $3::uuid[], $4) as id', [semana, orden, pos, nota])

  it('solo el Jefe programa; son exactamente tres por semana', async () => {
    const aux = await persona('auxiliar')
    const sem = await lunes(7)
    const p1 = await posConStock('A-15.2', 'PRG-1'); const p2 = await posConStock('A-16.2', 'PRG-2')
    const p3 = await posConStock('A-17.2', 'PRG-3'); const p4 = await posConStock('A-18.2', 'PRG-4')
    expect((await falla(programar(aux, sem, 1, [p1]))).code).toBe('42501')
    expect((await falla(programar(P().charlie.id, sem, 4, [p1]))).message).toMatch(/tres conteos por semana/)
    expect((await falla(programar(P().charlie.id, sem, 0, [p1]))).message).toMatch(/tres conteos por semana/)
    expect((await falla(programar(P().charlie.id, sem, 1, []))).message).toMatch(/al menos una ubicación/)
    await programar(P().charlie.id, sem, 1, [p1]); await programar(P().charlie.id, sem, 2, [p2]); await programar(P().charlie.id, sem, 3, [p3])
    expect((await falla(programar(P().charlie.id, sem, 2, [p4]))).message).toMatch(/ya está programado/)
    // el mismo lunes se calcula desde cualquier día de la semana
    const miercoles = await lunes(9)
    expect((await falla(programar(P().charlie.id, miercoles, 3, [p4]))).message).toMatch(/Son|ya está programado/)
    expect((await base.admin.query(`select count(*)::int n from wms.programacion_conteos where semana = $1::date and tipo = 'ROTATIVO'`, [sem])).rows[0].n).toBe(3)
  })

  it('una ubicación no se repite dentro de la semana; cancelar libera el cupo', async () => {
    const sem = await lunes(14)
    const p1 = await posConStock('A-19.2', 'PRG-5'); const p2 = await posConStock('A-20.3', 'PRG-6')
    const a = (await programar(P().charlie.id, sem, 1, [p1]))[0].id
    expect((await falla(programar(P().charlie.id, sem, 2, [p1, p2]))).message).toMatch(/ya está en otro conteo de esa semana/)
    expect((await falla(rpc(P().charlie.id, 'select wms.cancelar_programacion($1, $2)', [a, '  ']))).message).toMatch(/por qué se cancela/)
    await rpc(P().charlie.id, `select wms.cancelar_programacion($1, 'Se movió el producto')`, [a])
    await programar(P().charlie.id, sem, 1, [p1]) // el cupo 1 quedó libre
    expect((await falla(rpc(P().charlie.id, 'select wms.cancelar_programacion($1, $2)', [a, 'otra vez']))).message).toMatch(/todavía no se generó/)
  })

  it('el conteo extra exige la incidencia y no ocupa uno de los 3 cupos', async () => {
    const p1 = await posConStock('A-21.2', 'PRG-7')
    expect((await falla(rpc(P().charlie.id, 'select wms.programar_conteo_extra($1::uuid[], $2)', [[p1], ' ']))).message).toMatch(/cuál fue la incidencia/)
    const x = (await rpc<{ id: string }>(P().charlie.id, 'select wms.programar_conteo_extra($1::uuid[], $2) as id', [[p1], 'Cliente reclamó faltante']))[0].id
    expect((await base.admin.query('select tipo, orden, estado from wms.programacion_conteos where id = $1', [x])).rows[0]).toEqual({ tipo: 'EXTRA', orden: null, estado: 'PROGRAMADO' })
  })

  it('generar el conteo crea un conteo real (ciego, con pausa de la ubicación) y deja la programación enlazada', async () => {
    const sem = await lunes(21)
    const p1 = await posConStock('A-22.2', 'PRG-8')
    const id = (await programar(P().charlie.id, sem, 1, [p1], 'Rotación semana 3'))[0].id
    const aux = await persona('auxiliar')
    expect((await falla(rpc(aux, 'select wms.generar_conteo_programado($1)', [id]))).code).toBe('42501')
    const conteo = (await rpc<{ c: string }>(P().charlie.id, 'select wms.generar_conteo_programado($1) as c', [id]))[0].c
    expect((await base.admin.query('select estado, conteo_id from wms.programacion_conteos where id = $1', [id])).rows[0]).toEqual({ estado: 'GENERADO', conteo_id: conteo })
    expect((await base.admin.query('select estado, nota from wms.conteos where id = $1', [conteo])).rows[0]).toEqual({ estado: 'PROGRAMADO', nota: 'Rotación semana 3' })
    expect((await falla(rpc(P().charlie.id, 'select wms.generar_conteo_programado($1)', [id]))).message).toMatch(/ya se generó o se canceló/)
    // y la ubicación queda en conteo: no se puede mover (INV-05, paso 3)
    const bloq = await rpc<{ motivo: string }>(P().charlie.id, 'select * from wms.posiciones_bloqueadas() where posicion_id = $1', [p1])
    expect(bloq[0].motivo).toMatch(/en conteo/)
  })

  it('la última cobertura de una ubicación sale del conteo o de la programación más reciente', async () => {
    const p1 = await posConStock('A-23.2', 'PRG-9'); const p2 = await posConStock('A-24.2', 'PRG-10')
    await programar(P().charlie.id, await lunes(28), 1, [p1])
    const r = await rpc<{ posicion_id: string; ultima: string }>(P().charlie.id, 'select posicion_id, ultima::text from wms.ultima_cobertura_por_posicion()')
    expect(r.find((x) => x.posicion_id === p1)?.ultima).toBe(await lunes(28))
    expect(r.find((x) => x.posicion_id === p2)).toBeUndefined() // nunca cubierta
  })
})

describe('vistas guardadas de reportes', () => {
  const guardar = (quien: string, reporte: string, nombre: string, filtros: object = {}) =>
    base.como(quien, (c) => c.query('insert into wms.vistas_guardadas (reporte, nombre, filtros) values ($1, $2, $3::jsonb) returning id', [reporte, nombre, JSON.stringify(filtros)]))
  it('cada persona guarda, lee y borra solo las suyas', async () => {
    await guardar(P().charlie.id, 'INVENTARIO', 'Cuarentena de Logissa', { estado: 'CUARENTENA', propietario: 'LOGISSA' })
    const mias = await base.como(P().charlie.id, async (c) => (await c.query('select reporte, nombre, filtros from wms.vistas_guardadas')).rows)
    expect(mias).toEqual([{ reporte: 'INVENTARIO', nombre: 'Cuarentena de Logissa', filtros: { estado: 'CUARENTENA', propietario: 'LOGISSA' } }])
    expect(await base.como(P().katia.id, async (c) => (await c.query('select * from wms.vistas_guardadas')).rows)).toEqual([])
    const ajena = (await base.admin.query('select id from wms.vistas_guardadas limit 1')).rows[0].id
    await base.como(P().katia.id, (c) => c.query('delete from wms.vistas_guardadas where id = $1', [ajena]))
    expect((await base.admin.query('select count(*)::int n from wms.vistas_guardadas')).rows[0].n).toBe(1) // no era suya: no se borró
    await base.como(P().charlie.id, (c) => c.query('delete from wms.vistas_guardadas where id = $1', [ajena]))
    expect((await base.admin.query('select count(*)::int n from wms.vistas_guardadas')).rows[0].n).toBe(0)
  })
  it('no se guarda a nombre de otra persona, ni sin rol, ni un reporte que no existe, ni dos con el mismo nombre', async () => {
    expect((await falla(base.como(P().charlie.id, (c) => c.query(`insert into wms.vistas_guardadas (usuario_id, reporte, nombre) values ($1, 'INVENTARIO', 'x')`, [P().katia.id])))).code).toBe('42501')
    expect((await falla(guardar(P().sinRol.id, 'INVENTARIO', 'x'))).code).toBe('42501')
    expect((await falla(guardar(P().charlie.id, 'OTRO', 'x'))).code).toBe('23514')
    await guardar(P().charlie.id, 'MOVIMIENTOS', 'Esta semana')
    expect((await falla(guardar(P().charlie.id, 'MOVIMIENTOS', 'Esta semana'))).code).toBe('23505')
    await guardar(P().katia.id, 'MOVIMIENTOS', 'Esta semana') // otra persona sí puede usar el mismo nombre
  })
})

describe('exactitud del inventario', () => {
  it('solo cuenta conteos cerrados; la cantidad contada es la del reconteo si lo hubo; no la ve un auxiliar', async () => {
    const aux1 = await persona('auxiliar'); const aux2 = await persona('auxiliar')
    const s = await sembrarStock(base, { posicion: 'A-25.2', producto: base.productos.dapa, lote: 'EX-1', propietario: 'DIPHASAC', cantidad: 10 })
    const conteo = (await rpc<{ id: string }>(P().charlie.id, 'select wms.programar_conteo(array[$1]::uuid[], $2) as id', [s.posicionId, 'Exactitud']))[0].id
    const linea = (await base.admin.query('select id from wms.conteo_lineas where conteo_id = $1', [conteo])).rows[0].id as string
    const exact = () => rpc<{ conteo: string; cantidad_sistema: number; cantidad_contada: number; diferencia: number; resultado: string }>(
      P().auditor.id, `select * from wms.exactitud_conteos() where posicion = 'A-25.2'`)
    expect(await exact()).toEqual([]) // todavía abierto
    await rpc(aux1, 'select wms.registrar_conteo($1, 8)', [linea])
    await rpc(aux2, 'select wms.registrar_conteo($1, 8)', [linea])
    await rpc(P().charlie.id, 'select wms.registrar_causa_conteo($1, $2)', [linea, 'Despacho sin registrar'])
    const aj = (await rpc<{ id: string }>(P().charlie.id, 'select wms.proponer_ajuste($1, $2) as id', [linea, 'Restar 2']))[0].id
    await rpc(P().katia.id, 'select wms.decidir_ajuste($1, $2, $3)', [aj, 'RECHAZAR', 'Falta evidencia del despacho'])
    await rpc(P().charlie.id, 'select wms.cerrar_conteo($1, $2, $3)', [conteo, 'Despacho sin registrar', 'Escalado a Dirección Técnica'])
    const r = await exact()
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ cantidad_sistema: 10, cantidad_contada: 8, primer_conteo: 8, diferencia: -2, resultado: 'ESCALADA' })
    expect((await falla(rpc(aux1, 'select * from wms.exactitud_conteos()'))).code).toBe('42501')
    expect(await rpc(P().auditor.id, `select * from wms.exactitud_conteos(current_date + 1)`)).toEqual([])
  })
})

describe('las tablas nuevas no admiten escritura directa', () => {
  it('sin DML para la sesión de la persona en revisión, programación y focos', async () => {
    for (const t of ['revisiones_diarias', 'revision_focos', 'revision_pendientes', 'programacion_conteos']) {
      const e = await falla(base.como(P().admin.id, (c) => c.query(`delete from wms.${t}`)))
      expect(e.code, t).toBe('42501')
    }
    void idPosicion
  })
})

describe('indicadores: el stock en una fecha', () => {
  it('suma el libro mayor hasta ese día; no hay stock antes de existir; el contador no lo ve', async () => {
    const aux = await persona('auxiliar')
    const s = await sembrarStock(base, { posicion: 'A-25.3', producto: base.productos.dapa, lote: 'SA-1', propietario: 'DIPHASAC', cantidad: 12 })
    const hoy = (await base.admin.query(`select (now() at time zone 'America/Lima')::date::text as d`)).rows[0].d as string
    const ayer = (await base.admin.query(`select ((now() at time zone 'America/Lima')::date - 1)::text as d`)).rows[0].d as string
    const alHoy = await rpc<{ posicion_id: string; cantidad: string }>(P().auditor.id, 'select * from wms.saldos_al($1::date) where posicion_id = $2', [hoy, s.posicionId])
    expect(alHoy).toHaveLength(1)
    expect(Number(alHoy[0].cantidad)).toBe(12)
    expect(await rpc(P().auditor.id, 'select * from wms.saldos_al($1::date) where posicion_id = $2', [ayer, s.posicionId])).toEqual([])
    expect((await falla(rpc(aux, 'select * from wms.saldos_al($1::date)', [hoy]))).code).toBe('42501')
  })
})
