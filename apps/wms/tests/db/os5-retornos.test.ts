// OS-5 (migración 0025): los retornos vuelven como una recepción tipo devolución, originada desde la Orden de Salida.
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, crearBaseDePrueba, falla, idPosicion, idPropietario } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'

let base: BaseDePrueba
let a: ReturnType<typeof ayudasDeIngreso>
let logissa: string
let roberto: string // jefe_transporte
let n = 0

beforeAll(async () => { base = await crearBaseDePrueba(); a = ayudasDeIngreso(base); logissa = await idPropietario(base.admin, 'LOGISSA'); roberto = await a.persona('jefe_transporte') }, 120_000)
afterAll(async () => { await base?.cerrar() })

/** Una Orden de Salida ya despachada (CONFIRMADA) con dos lotes consumidos: 40 del lote A y 10 del lote B. Se arma directo: el flujo de salidas ya lo prueban sus propias suites. */
async function salidaDespachada(opciones: { estado?: string; conGuia?: boolean; propietario?: string } = {}) {
  n += 1
  const prod = await a.productoNuevo()
  const dueno = opciones.propietario ?? logissa
  const pos = await idPosicion(base.admin, 'F-1.1')
  const lote = async (codigo: string, vence: string) => (await a.uno(`insert into wms.lotes (producto_id, codigo, vence, propietario_id) values ($1, $2, $3, $4) returning id`, [prod, codigo, vence, dueno])).id as string
  const la = await lote(`RA${n}`, '2028-05-31'); const lb = await lote(`RB${n}`, '2028-08-31')
  const s = (await a.uno(`insert into wms.salidas (numero, tipo, motivo, propietario_id, estado, creada_por) values ($1, $2, $3, $4, $5, $6) returning id, numero`,
    [`SAL-2026-9${String(n).padStart(4, '0')}`, dueno === logissa ? 'DISTRIBUCION' : 'CLIENTE', 'VENTA', dueno, opciones.estado ?? 'CONFIRMADA', roberto]))
  const linea = (await a.uno(`insert into wms.salida_lineas (salida_id, producto_id, cantidad, estado) values ($1, $2, 50, 'CONFIRMADA') returning id`, [s.id, prod])).id
  for (const [l, c] of [[la, 40], [lb, 10]] as const) {
    await base.admin.query(`insert into wms.reservas (linea_id, posicion_id, posicion_origen_id, producto_id, lote_id, propietario_id, procedencia_id, cantidad, estado)
                            values ($1, $2, $2, $3, $4, $5, $6, $7, 'CONSUMIDA')`, [linea, pos, prod, l, dueno, randomUUID(), c])
  }
  if (opciones.conGuia !== false) {
    await base.admin.query(`insert into wms.guias_remision (salida_id, numero, lineas, registrada_por) values ($1, $2, '[]'::jsonb, $3)`, [s.id, `T001-0000${n}`, roberto])
  }
  return { salida: s.id as string, numero: s.numero as string, prod, la, lb }
}

const DOC = { doc_original_tipo: 'FACTURA', doc_original_numero: 'F001-5501' }
const retorno = (quien: string, salida: string, motivo: string, lineas: unknown[], datos: object = DOC, autorizar = false) =>
  base.como(quien, async (c) => (await c.query('select wms.crear_retorno($1, $2, $3::jsonb, $4::jsonb, $5) id', [salida, motivo, a.j(datos), a.j(lineas), autorizar])).rows[0].id as string)
const solicitud = (id: string) => a.uno(`select s.*, (select sum(cantidad)::int from wms.solicitud_ingreso_lineas where solicitud_id = s.id) as unidades from wms.solicitudes_ingreso s where s.id = $1`, [id])

describe('originar el retorno desde la Orden de Salida', () => {
  it('Roberto lo registra: nace como solicitud DEVOLUCIÓN «por autorizar», con la salida, el motivo y la guía; avisa a Sandra', async () => {
    const x = await salidaDespachada()
    const id = await retorno(roberto, x.salida, 'RECHAZADO_CLIENTE', [{ lote_id: x.la, cantidad: 15 }])
    const s = await solicitud(id)
    expect(s).toMatchObject({ tipo: 'DEVOLUCION', estado: 'ENVIADA', salida_id: x.salida, retorno_motivo: 'RECHAZADO_CLIENTE', propietario_id: logissa, unidades: 15,
      doc_original_tipo: 'FACTURA', doc_original_numero: 'F001-5501', origen_creacion: 'INTERNO' })
    expect(s.guia_numero).toMatch(/^T001-0000\d+$/)
    expect(s.motivo).toContain(x.numero)
    const al = (await a.q(`select tipo, destinatario_rol, estado from wms.alertas where clave = $1`, ['retorno:' + id]))
    expect(al).toEqual([{ tipo: 'RETORNO_POR_AUTORIZAR', destinatario_rol: 'asistente_dt', estado: 'ABIERTA' }])
    // la línea sale del lote que salió, con su vencimiento
    const l = await a.uno('select lote, vence::text v, cantidad from wms.solicitud_ingreso_lineas where solicitud_id = $1', [id])
    expect(l).toMatchObject({ lote: `RA${n}`, v: '2028-05-31', cantidad: 15 })
  })

  it('Roberto no autoriza: la autoriza Sandra (o Katia), y queda «por llegar»', async () => {
    const x = await salidaDespachada()
    const id = await retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: x.lb, cantidad: 10 }])
    expect((await falla(base.como(roberto, (c) => c.query('select wms.autorizar_solicitud($1)', [id])))).message).toMatch(/Solo Sandra/)
    await base.como(base.personas.sandra.id, (c) => c.query('select wms.autorizar_solicitud($1)', [id]))
    expect((await solicitud(id)).estado).toBe('PROGRAMADA')
  })

  it('si lo registra Sandra y lo pide, queda autorizada de una vez; si lo pide Roberto, no', async () => {
    const x = await salidaDespachada()
    const s1 = await retorno(base.personas.sandra.id, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 5 }], DOC, true)
    expect((await solicitud(s1)).estado).toBe('PROGRAMADA')
    expect(await a.q(`select 1 from wms.alertas where clave = $1`, ['retorno:' + s1])).toHaveLength(0)
    const s2 = await retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 5 }], DOC, true)
    expect((await solicitud(s2)).estado).toBe('ENVIADA')
  })

  it('lo originan Sandra, Katia y los dos jefes; el auxiliar, la auditoría y quien no tiene rol, no', async () => {
    const x = await salidaDespachada()
    for (const quien of [base.personas.sandra.id, base.personas.katia.id, base.personas.charlie.id, roberto]) {
      await retorno(quien, x.salida, 'NO_ENTREGADO', [{ lote_id: x.lb, cantidad: 1 }])
    }
    for (const quien of [base.personas.aux.id, base.personas.auditor.id, base.personas.sinRol.id]) {
      expect((await falla(retorno(quien, x.salida, 'NO_ENTREGADO', [{ lote_id: x.lb, cantidad: 1 }]))).message).toMatch(/No tienes permiso para registrar el retorno/)
    }
  })

  it('solo lo que ya salió puede volver (Orden de Salida CONFIRMADA)', async () => {
    const x = await salidaDespachada({ estado: 'ABIERTA' })
    expect((await falla(retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 1 }]))).message).toMatch(/todavía no salió/)
    expect((await falla(retorno(roberto, randomUUID(), 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 1 }]))).message).toMatch(/No encontramos esa Orden de Salida/)
  })

  it('pide motivo, factura o boleta original y al menos un lote con unidades', async () => {
    const x = await salidaDespachada()
    expect((await falla(retorno(roberto, x.salida, 'OTRO', [{ lote_id: x.la, cantidad: 1 }]))).message).toMatch(/Elige por qué vuelve/)
    expect((await falla(retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 1 }], { guia_numero: 'T001-1' }))).message).toMatch(/factura o boleta original/)
    expect((await falla(retorno(roberto, x.salida, 'NO_ENTREGADO', []))).message).toMatch(/al menos un lote/)
    expect((await falla(retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 0 }]))).message).toMatch(/mayor que cero/)
  })

  it('la guía de la salida se toma sola; si se escribe otra (orden de cliente), se respeta', async () => {
    const sinGuia = await salidaDespachada({ conGuia: false })
    expect((await solicitud(await retorno(roberto, sinGuia.salida, 'NO_ENTREGADO', [{ lote_id: sinGuia.la, cantidad: 1 }]))).guia_numero).toBeNull()
    expect((await solicitud(await retorno(roberto, sinGuia.salida, 'NO_ENTREGADO', [{ lote_id: sinGuia.la, cantidad: 1 }], { ...DOC, guia_numero: 'EG07-00002031' }))).guia_numero).toBe('EG07-00002031')
  })
})

describe('lo que vuelve nunca supera lo que salió (en la base de datos)', () => {
  it('por lote: nada de lo que no salió y nada más que lo despachado, sumando los retornos anteriores', async () => {
    const x = await salidaDespachada()
    const otro = await salidaDespachada()
    expect((await falla(retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: otro.la, cantidad: 1 }]))).message).toMatch(/no salió en esa Orden de Salida/)
    expect((await falla(retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 41 }]))).message).toMatch(/No puede volver más de lo que salió: del lote RA\d+ salieron 40/)
    const primero = await retorno(roberto, x.salida, 'RECHAZADO_CLIENTE', [{ lote_id: x.la, cantidad: 30 }])
    expect((await falla(retorno(roberto, x.salida, 'RECHAZADO_CLIENTE', [{ lote_id: x.la, cantidad: 11 }]))).message).toMatch(/ya se anunció el retorno de 30/)
    await retorno(roberto, x.salida, 'RECHAZADO_CLIENTE', [{ lote_id: x.la, cantidad: 10 }])   // 30 + 10 = 40: justo
    const lr = await base.como(roberto, async (c) => (await c.query('select lote, despachado, ya_retornado, retornable from wms.lotes_retornables($1)', [x.salida])).rows)
    expect(lr).toEqual([{ lote: `RA${n - 1}`, despachado: 40, ya_retornado: 40, retornable: 0 }, { lote: `RB${n - 1}`, despachado: 10, ya_retornado: 0, retornable: 10 }])
    // una solicitud anulada libera lo que había anunciado
    await base.como(base.personas.sandra.id, (c) => c.query('select wms.anular_solicitud($1, $2)', [primero, 'Se anunció por error']))
    expect((await retorno(roberto, x.salida, 'RECHAZADO_CLIENTE', [{ lote_id: x.la, cantidad: 30 }]))).toBeTruthy()
  })

  it('también al ajustar la solicitud o la recepción: no se sube lo que vuelve por encima de lo que salió', async () => {
    const x = await salidaDespachada()
    const id = await retorno(base.personas.sandra.id, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 30 }], DOC, true)
    const linea = (await a.uno('select id from wms.solicitud_ingreso_lineas where solicitud_id = $1', [id])).id
    const e = await falla(base.como(base.personas.sandra.id, (c) => c.query(`select wms.ajustar_solicitud($1, $2::jsonb, 'El cliente devuelve más')`, [id, a.j([{ op: 'LINEA', linea_id: linea, campo: 'cantidad', valor: '41' }])])))
    expect(e.message).toMatch(/No puede volver más de lo que salió/)
    await base.como(base.personas.sandra.id, (c) => c.query(`select wms.ajustar_solicitud($1, $2::jsonb, 'Llegaron menos')`, [id, a.j([{ op: 'LINEA', linea_id: linea, campo: 'cantidad', valor: '25' }])]))
    expect((await solicitud(id)).unidades).toBe(25)
  })

  it('la solicitud con Orden de Salida solo puede ser una devolución y el motivo va con la salida', async () => {
    const x = await salidaDespachada()
    const ins = (tipo: string, salida: string | null, motivo: string | null) =>
      base.admin.query(`insert into wms.solicitudes_ingreso (numero, tipo, propietario_id, guia_numero, doc_original_tipo, doc_original_numero, salida_id, retorno_motivo)
                        values ($1, $2, $3, 'G-1', 'FACTURA', 'F-1', $4, $5)`, ['SI-X-' + randomUUID().slice(0, 6), tipo, logissa, salida, motivo])
    expect((await falla(ins('INGRESO_CLIENTE', x.salida, 'NO_ENTREGADO'))).message).toMatch(/solicitudes_retorno_check/)
    expect((await falla(ins('DEVOLUCION', x.salida, null))).message).toMatch(/solicitudes_retorno_check/)
    expect((await falla(ins('DEVOLUCION', null, 'NO_ENTREGADO'))).message).toMatch(/solicitudes_retorno_check/)
    expect((await falla(ins('DEVOLUCION', x.salida, 'OTRO'))).message).toMatch(/solicitudes_retorno_check/)
  })
})

describe('el retorno entra como una recepción tipo devolución, al 100 %', () => {
  it('recepción → acta al 100 % → nace en Devoluciones → acta organoléptica al 100 % → Aprobado o Bajas', async () => {
    const x = await salidaDespachada()
    const id = await retorno(roberto, x.salida, 'RECHAZADO_CLIENTE', [{ lote_id: x.la, cantidad: 12 }, { lote_id: x.lb, cantidad: 4 }])
    await base.como(base.personas.katia.id, (c) => c.query('select wms.autorizar_solicitud($1)', [id]))
    const r = await a.recepcionCompleta(id, 'E-8.1.1')
    // La recepción de una devolución se cuenta al 100 % aunque alguien intente otra cosa
    expect((await a.uno('select tipo, tipo_conteo from wms.ingresos where id = $1', [r.ing]))).toEqual({ tipo: 'DEVOLUCION', tipo_conteo: 'TOTAL' })
    await base.admin.query(`update wms.ingresos set tipo_conteo = 'MUESTREO' where id = $1`, [r.ing])
    expect((await a.uno('select tipo_conteo from wms.ingresos where id = $1', [r.ing])).tipo_conteo).toBe('TOTAL')
    // Nace en Devoluciones, nunca en Cuarentena
    expect((await a.saldosDe(r.ing)).map((s) => [s.estado, s.cantidad])).toEqual([['DEVOLUCIONES', 12], ['DEVOLUCIONES', 4]])
    // Una acta organoléptica por lote, al 100 %
    expect(r.orgs).toHaveLength(2)
    for (const o of r.orgs) expect(await a.acta(o)).toMatchObject({ regimen_muestreo: 'DEVOLUCION', tabla_muestreo: 'LS-TB.02.02' })
    const ac = await a.q('select cantidad_lote, cantidad_muestra from wms.actas_organolepticas where ingreso_id = $1 order by cantidad_lote desc', [r.ing])
    expect(ac).toEqual([{ cantidad_lote: 12, cantidad_muestra: 12 }, { cantidad_lote: 4, cantidad_muestra: 4 }])
    // Katia decide: uno a Aprobado, otro a Bajas
    const pendientes = await a.q(`select id, cantidad_lote from wms.actas_organolepticas where ingreso_id = $1 order by cantidad_lote desc`, [r.ing])
    await a.llenar(pendientes[0].id); await a.llenar(pendientes[1].id, 'NO_CONFORME')
    await a.decidir(pendientes[0].id, 'APROBADO'); await a.decidir(pendientes[1].id, 'BAJAS_RECHAZADOS')
    expect((await a.saldosDe(r.ing)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 12], ['BAJAS_RECHAZADOS', 4]])
    // Y el ledger sigue cuadrado
    expect((await base.admin.query('select * from wms.verificar_saldos()')).rows).toHaveLength(0)
  })

  it('el retorno de la orden de un cliente de almacenamiento lo libera el DT del cliente (no Katia)', async () => {
    const ajr = await idPropietario(base.admin, 'AJR_LABS')
    const x = await salidaDespachada({ propietario: ajr })
    const id = await retorno(roberto, x.salida, 'NO_ENTREGADO', [{ lote_id: x.la, cantidad: 8 }])
    await base.como(base.personas.sandra.id, (c) => c.query('select wms.autorizar_solicitud($1)', [id]))
    expect((await solicitud(id)).propietario_id).toBe(ajr)
    const r = await a.recepcionCompleta(id, 'A-11.1') // Devoluciones asignada a AJR
    expect((await a.saldosDe(r.ing)).map((s) => s.estado)).toEqual(['DEVOLUCIONES'])
    await a.llenar(r.org)
    expect((await falla(a.decidir(r.org, 'APROBADO'))).message).toMatch(/lo libera el DT del cliente/)
  })
})
