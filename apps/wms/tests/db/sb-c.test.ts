// SB-C (migración 0033): dictamen del DT del cliente con una sola persona, Orden de Baja (código oficial y Visto Bueno), producto/proveedor nuevo = sin recepciones históricas
// y temperatura en ruta (límite 24.9, lecturas del data logger, cruce con el cierre y alerta).
import { createHash, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type BaseDePrueba, SQL, crearBaseDePrueba, falla, idPosicion, idPropietario, sembrarStock } from './helpers'
import { ayudasDeIngreso } from './ingreso-ayudas'

let base: BaseDePrueba
let a: ReturnType<typeof ayudasDeIngreso>
let jt: string
let ajr: string
let n = 0
const q = (sql: string, args: unknown[] = []) => base.admin.query(sql, args).then((r) => r.rows)
const uno = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0]
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

beforeAll(async () => {
  base = await crearBaseDePrueba(); a = ayudasDeIngreso(base)
  jt = await a.persona('jefe_transporte')
  ajr = await idPropietario(base.admin, 'AJR_LABS')
  await base.admin.query(`insert into wms.asignaciones_posicion (posicion_id, propietario_id, desde) values ($1, $2, current_date)`, [await idPosicion(base.admin, 'A-7'), ajr])
}, 120_000)
afterAll(async () => { await base?.cerrar() })

const sandra = () => base.personas.sandra.id
const katia = () => base.personas.katia.id
const param = async (k: string) => (await uno('select valor, nota from wms.parametros where clave = $1', [k])) as { valor: string; nota: string }

// ── 1. Dictamen ───────────────────────────────────────────────────────────────────────────────────────────────────────

describe('dictamen del DT del cliente: una sola persona, sin segunda firma (D-169)', () => {
  const registrar = (quien: string, acta: string, lib: number) =>
    base.como(quien, async (c) => (await c.query(`select wms.registrar_dictamen_cliente($1, $2, 0, '2026-10-15'::date, 'Correo del DT', 'ajr/d.pdf', 'd.pdf', $3, 'application/pdf') id`, [acta, lib, sha('d' + acta + lib)])).rows[0].id as string)
  const deCliente = async (cantidad: number, lote: string) => {
    const x = await a.ingresoDirecto({ tipo: 'INGRESO_CLIENTE', propietario: ajr, producto: await a.productoNuevo(), lote, cantidad, posicion: 'A-7' })
    await a.llenar(x.org)
    return x
  }

  it('el parámetro queda en «no» y se dice que es definitivo', async () => {
    const p = await param('dictamen_cliente_dos_personas')
    expect(p.valor).toBe('no')
    expect(p.nota).toMatch(/DEFINITIVO/)
  })

  it('quien registra el dictamen lo confirma él mismo, aunque alguien ponga el parámetro en «si»: la base ya no lo consulta', async () => {
    await base.admin.query(`update wms.parametros set valor = 'si' where clave = 'dictamen_cliente_dos_personas'`)
    try {
      for (const [quien, lote] of [[sandra(), 'SB-1'], [katia(), 'SB-2']] as const) {
        const x = await deCliente(40, lote)
        const d = await registrar(quien, x.org, 40)
        await base.como(quien, (c) => c.query('select wms.confirmar_dictamen_cliente($1)', [d]))
        expect((await uno('select estado from wms.dictamenes_cliente where id = $1', [d])).estado).toBe('CONFIRMADO')
        expect((await a.saldosDe(x.ing)).map((s) => [s.estado, s.cantidad])).toEqual([['APROBADO', 40]])
      }
    } finally { await base.admin.query(`update wms.parametros set valor = 'no' where clave = 'dictamen_cliente_dos_personas'`) }
  })

  it('el recordatorio de confirmar es para quien lo registró, no para «la otra persona»', async () => {
    const x = await deCliente(40, 'SB-3')
    const d = await registrar(sandra(), x.org, 40)
    expect(await uno(`select destinatario_rol, mensaje from wms.alertas where clave = $1`, ['dictamen:' + d])).toMatchObject({ destinatario_rol: 'asistente_dt', mensaje: expect.stringMatching(/^Registraste el dictamen/) })
    const y = await deCliente(40, 'SB-4')
    const d2 = await registrar(katia(), y.org, 40)
    expect((await uno(`select destinatario_rol from wms.alertas where clave = $1`, ['dictamen:' + d2])).destinatario_rol).toBe('direccion_tecnica')
  })

  it('los demás siguen sin poder registrar ni confirmar', async () => {
    const x = await deCliente(40, 'SB-5')
    expect((await falla(registrar(base.personas.charlie.id, x.org, 10))).message).toMatch(/Solo Sandra o Dirección Técnica registran/)
    const d = await registrar(sandra(), x.org, 10)
    expect((await falla(base.como(base.personas.aux.id, (c) => c.query('select wms.confirmar_dictamen_cliente($1)', [d])))).message).toMatch(/Solo Sandra o Dirección Técnica confirman/)
  })
})

// ── 2. Orden de Baja ──────────────────────────────────────────────────────────────────────────────────────────────────

describe('Orden de Baja: código oficial LS-FR.56.01 y Visto Bueno de Katia Zapata (D-170)', () => {
  it('el contenido que se congela al emitir lleva el código oficial y el Visto Bueno', async () => {
    expect((await param('baja_codigo_formato')).valor).toBe('LS-FR.56.01')
    expect((await param('baja_codigo_formato')).nota).toMatch(/OFICIAL/)
    const j = (await uno(`select wms._contenido_orden_baja($1, 'BJ-2026-00001', current_date, null) c`, [randomUUID()])).c
    expect(j.formato).toBe('LS-FR.56.01')
    expect(j.visto_bueno).toEqual({ nombre: 'Katia Zapata', cargo: 'Dirección Técnica' })
    expect(j.solicitante.nombre).toBe('Katia Zapata')
  })

  it('el nombre y el cargo del Visto Bueno son parámetros: si cambian, la próxima Orden los lleva', async () => {
    await base.admin.query(`update wms.parametros set valor = 'Otra Persona' where clave = 'baja_vb_nombre'`)
    try { expect((await uno(`select wms._contenido_orden_baja($1, 'BJ-2026-00002', current_date, null) c`, [randomUUID()])).c.visto_bueno.nombre).toBe('Otra Persona') }
    finally { await base.admin.query(`update wms.parametros set valor = 'Katia Zapata' where clave = 'baja_vb_nombre'`) }
  })
})

// ── 3. Producto y proveedor nuevo ─────────────────────────────────────────────────────────────────────────────────────

describe('producto nuevo y proveedor nuevo = sin recepciones históricas (D-171, D-172)', () => {
  const esProducto = async (prod: string, ing: string | null = null) => (await uno('select wms.es_producto_nuevo($1, $2) v', [prod, ing])).v as boolean
  const esProveedor = async (ing: string) => (await uno('select wms.es_proveedor_nuevo($1) v', [ing])).v as boolean
  const ocConRecibido = async (prod: string, ruc: string, recibida: number) => {
    const prov = (await uno(`insert into compras.proveedores (ruc, razon_social) values ($1, 'Proveedor SB-C') on conflict (ruc) do update set razon_social = excluded.razon_social returning id`, [ruc])).id
    const oc = (await uno(`insert into compras.ordenes_compra (codigo, proveedor_id, estado) values ($1, $2, 'parcialmente_recibida') returning id`, ['OC-SBC-' + randomUUID().slice(0, 6), prov])).id
    const item = (await uno(`insert into compras.ordenes_compra_items (oc_id, producto_id, cantidad_pedida, cantidad_recibida) values ($1, $2, 5000, $3) returning id`, [oc, prod, recibida])).id
    return { oc, item }
  }
  const regimen = async (ing: string) => (await uno('select p.regimen from wms.ingreso_lotes il, lateral wms.plan_muestreo(il.id) p where il.ingreso_id = $1 limit 1', [ing])).regimen as string

  it('un producto que nadie recibió es nuevo', async () => {
    expect(await esProducto(await a.productoNuevo())).toBe(true)
  })

  it('el stock inicial de Odoo (carga inicial) cuenta como historia: un producto con stock inicial NO es nuevo', async () => {
    const prod = await a.productoNuevo()
    await sembrarStock(base, { posicion: 'F-1.1', producto: prod, lote: 'ODOO-1', propietario: 'LOGISSA', cantidad: 25 })
    expect(await esProducto(prod)).toBe(false)
  })

  it('una recepción previa de Compras (cantidad_recibida > 0) cuenta; una línea de OC sin nada recibido no', async () => {
    const sinRecibir = await a.productoNuevo(); await ocConRecibido(sinRecibir, '20111111111', 0)
    expect(await esProducto(sinRecibir)).toBe(true)
    const recibido = await a.productoNuevo(); await ocConRecibido(recibido, '20111111112', 120)
    expect(await esProducto(recibido)).toBe(false)
  })

  it('una recepción física de almacén (almacen.recepciones_items) también cuenta', async () => {
    const prod = await a.productoNuevo()
    const { oc, item } = await ocConRecibido(prod, '20111111113', 0)
    const rec = (await uno(`insert into almacen.recepciones (oc_id) values ($1) returning id`, [oc])).id
    expect(await esProducto(prod)).toBe(true)
    await base.admin.query(`insert into almacen.recepciones_items (recepcion_id, oc_item_id, cantidad_fisica) values ($1, $2, 60)`, [rec, item])
    expect(await esProducto(prod)).toBe(false)
  })

  it('la propia recepción no es su historia: aunque Compras ya la haya registrado, el producto sigue siendo nuevo para esa recepción', async () => {
    const prod = await a.productoNuevo()
    const x = await a.compra({ producto: prod, cantidad: 480, lote: 'NV-1', ruc: '20222222221' })
    await base.admin.query(`update compras.ordenes_compra_items set cantidad_recibida = 480 where producto_id = $1`, [prod]) // Compras registró esta misma recepción
    expect(await esProducto(prod, x.ing)).toBe(true)
    expect(await esProducto(prod)).toBe(false) // sin decir de qué recepción: ya hay una
    expect((await uno('select p.regimen from wms.ingreso_lotes il, lateral wms.plan_muestreo(il.id) p where il.ingreso_id = $1', [x.ing])).regimen).toBe('NORMAL')
  })

  it('un producto que Compras ya recibió antes (sin lotes en el WMS) se evalúa con la tabla simplificada, no como nuevo', async () => {
    const prod = await a.productoNuevo()
    await ocConRecibido(prod, '20333333331', 900) // otra OC, otro proveedor, ya recibida
    const x = await a.compra({ producto: prod, cantidad: 300, lote: 'NV-2', ruc: '20333333332' })
    // el proveedor sí es nuevo (compra local confirmada por primera vez): régimen normal por proveedor, no por producto
    expect(await esProducto(prod, x.ing)).toBe(false)
    expect(await esProveedor(x.ing)).toBe(true)
    expect(await regimen(x.ing)).toBe('NORMAL')
    const y = await a.compra({ producto: prod, cantidad: 300, lote: 'NV-3', ruc: '20333333332' })
    expect(await esProveedor(y.ing)).toBe(false)
    expect(await regimen(y.ing)).toBe('SIMPLIFICADA')
  })

  it('proveedor nuevo: una recepción previa en Compras a ese mismo proveedor (por RUC) lo vuelve conocido', async () => {
    const otro = await a.productoNuevo(); await ocConRecibido(otro, '20444444441', 50)
    const x = await a.compra({ producto: await a.productoNuevo(), cantidad: 300, lote: 'PV-A', ruc: '20444444441' })
    expect(await esProveedor(x.ing)).toBe(false)
    const y = await a.compra({ producto: await a.productoNuevo(), cantidad: 300, lote: 'PV-B', ruc: '20444444442' })
    expect(await esProveedor(y.ing)).toBe(true)
  })

  it('«proveedor nuevo» solo se aplica a una compra local', async () => {
    const x = await a.ingresoDirecto({ tipo: 'DEVOLUCION', propietario: await idPropietario(base.admin, 'LOGISSA'), producto: await a.productoNuevo(), lote: 'DV-SB', cantidad: 50, posicion: 'E-8.1.1' })
    expect(await esProveedor(x.ing)).toBe(false)
  })

  it('no hay «mismo producto con otro laboratorio»: cada producto del catálogo se evalúa por sí solo', async () => {
    const lab1 = await a.productoNuevo(); const lab2 = await a.productoNuevo()
    await ocConRecibido(lab1, '20555555551', 400)
    expect(await esProducto(lab1)).toBe(false)
    expect(await esProducto(lab2)).toBe(true)
  })

  it('las funciones de apoyo no están abiertas a la aplicación', async () => {
    for (const f of ['wms.es_producto_nuevo(uuid, uuid)', 'wms.es_proveedor_nuevo(uuid)', 'wms._compras_con_historia(uuid, text, text, uuid)']) {
      expect((await uno(`select has_function_privilege('authenticated', $1::regprocedure, 'execute') v`, [f])).v, f).toBe(false)
    }
  })
})

// ── 4. Temperatura en ruta y data logger ──────────────────────────────────────────────────────────────────────────────

async function ruta(estado: string, fecha = '2026-10-19') {
  n += 1
  const r = (await uno(`insert into wms.rutas (numero, fecha, estado, creada_por) values ($1, $2, $3, $4) returning id`, [`RUT-SBC-${n}-${randomUUID().slice(0, 4)}`, fecha, estado, jt])).id as string
  await base.admin.query(`insert into wms.registros_ls_fr_43_03 (ruta_id, codigo, version_formato, creado_por) values ($1, 'LS-FR.43.03', '01', $2)`, [r, jt])
  return r
}
/** Lecturas cada 5 minutos desde las 09:24:34 con las temperaturas dadas. */
const lecturas = (temps: number[], dia = '2026-10-19') =>
  temps.map((c, i) => { const m = 24 * 60 + 34 / 60 + i * 5; const hh = String(Math.floor(m / 60) % 24).padStart(2, '0'); const mm = String(Math.floor(m % 60)).padStart(2, '0'); return { t: `${dia}T${hh}:${mm}:34`, c, h: null } })
const importar = (quien: string, r: string, ls: unknown[], nombre = 'logger.pdf', formato = 'PDF', hash = sha(randomUUID())) =>
  base.como(quien, async (c) => (await c.query('select wms.registrar_lecturas_logger($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb) id', [r, nombre, hash, formato, 'RC-61', 'EFG204104487', 5, 24.5, 15.5, JSON.stringify(ls)])).rows[0].id as string)
const cerrar = (r: string, min: number, max: number) => {
  const hash = sha(randomUUID())
  return base.como(jt, (c) => c.query('select wms.cerrar_ruta($1, $2, $3, $4, $5, $6, 2048, $7, null)', [r, min, max, `data_logger/${hash.slice(0, 16)}-logger.pdf`, 'logger.pdf', hash, 'application/pdf']))
}
const alertas = (r: string) => q(`select destinatario_rol, mensaje, estado from wms.alertas where clave like $1 order by destinatario_rol`, [`temp-ruta:${r}:%`])

describe('temperatura en ruta: límite de 24.9 °C (D-173, D-174)', () => {
  it('el límite es un parámetro y lo que falta decidir queda como pendiente de Katia', async () => {
    expect((await param('temperatura_ruta_max_c')).valor).toBe('24.9')
    expect((await param('ls_fr_43_03_temperatura_fuera_de_rango')).valor).toBe('PENDIENTE')
    expect((await param('ls_fr_43_03_temperatura_fuera_de_rango')).nota).toMatch(/qué se hace con la mercadería/)
    expect((await param('temperatura_recepcion_limite_rige')).valor).toBe('PENDIENTE')
    expect((await param('ls_fr_43_03_logger_formato')).valor).toBe('RC-61 (PDF o CSV)')
  })

  it('cerrar la ruta con una máxima de 24.9 no alerta; de 25.0 sí (a Dirección Técnica y al Jefe de Transporte) y no bloquea el cierre', async () => {
    const ok = await ruta('EN_RUTA'); await cerrar(ok, 18, 24.9)
    expect(await alertas(ok)).toEqual([])
    const mal = await ruta('EN_RUTA'); await cerrar(mal, 18, 25)
    expect((await uno('select estado from wms.rutas where id = $1', [mal])).estado).toBe('CERRADA')
    const al = await alertas(mal)
    expect(al.map((x) => x.destinatario_rol)).toEqual(['direccion_tecnica', 'jefe_transporte'])
    expect(al[0].mensaje).toMatch(/máxima de 25 °C, sobre el límite de 24,9 °C/)
    expect(al[0].mensaje).toMatch(/Dirección Técnica decide qué se hace con la mercadería/)
  })

  it('si cambia el parámetro, el límite cambia sin tocar código', async () => {
    await base.admin.query(`update wms.parametros set valor = '26' where clave = 'temperatura_ruta_max_c'`)
    try { const r = await ruta('EN_RUTA'); await cerrar(r, 18, 25.5); expect(await alertas(r)).toEqual([]) }
    finally { await base.admin.query(`update wms.parametros set valor = '24.9' where clave = 'temperatura_ruta_max_c'`) }
  })
})

describe('importar las lecturas del data logger (D-175, D-176)', () => {
  it('solo el Jefe de Transporte importa, y solo desde que la unidad salió', async () => {
    const r = await ruta('EN_RUTA')
    for (const quien of [base.personas.aux.id, base.personas.charlie.id, katia(), sandra(), base.personas.admin.id, base.personas.sinRol.id]) {
      expect((await falla(importar(quien, r, lecturas([22, 23])))).code, quien).toBe('42501')
    }
    for (const e of ['BORRADOR', 'PLANIFICADA', 'LISTA_PARA_CARGA', 'LIBERADA', 'CANCELADA']) {
      expect((await falla(importar(jt, await ruta(e), lecturas([22])))).message, e).toMatch(/todavía no salió/)
    }
    await importar(jt, r, lecturas([22, 23]))
  })

  it('la base recalcula mínima, máxima, promedio y minutos sobre el límite desde las lecturas', async () => {
    const r = await ruta('EN_RUTA')
    const id = await importar(jt, r, lecturas([22.0, 23.1, 24.9, 25.3, 25.0, 24.0]))
    const i = await uno('select * from wms.ruta_logger_importes where id = $1', [id])
    expect(Number(i.temp_min)).toBe(22); expect(Number(i.temp_max)).toBe(25.3); expect(Number(i.temp_prom)).toBe(24.1)
    expect(i).toMatchObject({ puntos: 6, excede: true, lecturas_sobre_limite: 2, minutos_sobre_limite: 10, coincide_con_cierre: null, dentro_de_fecha_ruta: true, formato: 'PDF', vigente: true })
    expect(Number(i.limite_c)).toBe(24.9)
    expect((await uno('select count(*)::int n from wms.ruta_logger_lecturas where importe_id = $1', [id])).n).toBe(6)
    expect((await alertas(r)).map((x) => x.destinatario_rol)).toEqual(['direccion_tecnica', 'jefe_transporte'])
  })

  it('con todas las lecturas hasta 24.9 no hay alerta (el equipo avisa desde 24.5, pero nuestro límite es 24.9)', async () => {
    const r = await ruta('EN_RUTA')
    const id = await importar(jt, r, lecturas([22.0, 24.6, 24.9, 24.7]))
    expect(await uno('select excede, lecturas_sobre_limite from wms.ruta_logger_importes where id = $1', [id])).toEqual({ excede: false, lecturas_sobre_limite: 0 })
    expect(await alertas(r)).toEqual([])
  })

  it('cruce con el cierre: coincide si la mínima y la máxima son las mismas (0,1 °C de tolerancia); si no, queda marcado', async () => {
    const r = await ruta('EN_RUTA'); await cerrar(r, 22, 24)
    const bien = await importar(jt, r, lecturas([22.0, 23.1, 24.0]))
    expect(await uno('select coincide_con_cierre c, cierre_min::float m, cierre_max::float x from wms.ruta_logger_importes where id = $1', [bien])).toEqual({ c: true, m: 22, x: 24 })
    const mal = await importar(jt, r, lecturas([20.0, 23.1, 24.0]))
    expect((await uno('select coincide_con_cierre c from wms.ruta_logger_importes where id = $1', [mal])).c).toBe(false)
    // la importación nueva reemplaza a la vigente y la anterior queda
    expect(await q('select vigente from wms.ruta_logger_importes where ruta_id = $1 order by importado_en', [r])).toEqual([{ vigente: false }, { vigente: true }])
  })

  it('las lecturas de otro día quedan marcadas (no son del viaje de la ruta)', async () => {
    const r = await ruta('EN_RUTA', '2026-10-25')
    const id = await importar(jt, r, lecturas([22, 23], '2026-10-19'))
    expect((await uno('select dentro_de_fecha_ruta d from wms.ruta_logger_importes where id = $1', [id])).d).toBe(false)
  })

  it('rechaza archivos sin lecturas, con temperaturas imposibles, horas repetidas, formato o huella inválidos', async () => {
    const r = await ruta('EN_RUTA')
    expect((await falla(importar(jt, r, []))).message).toMatch(/No encontramos lecturas/)
    expect((await falla(importar(jt, r, lecturas([22, 95])))).message).toMatch(/temperatura imposible/)
    expect((await falla(importar(jt, r, [...lecturas([22]), ...lecturas([23])]))).message).toMatch(/repite horas/)
    expect((await falla(importar(jt, r, lecturas([22]), 'x.txt', 'TXT'))).message).toMatch(/PDF o un CSV/)
    expect((await falla(importar(jt, r, lecturas([22]), 'x.pdf', 'PDF', 'no-es-hash'))).message).toMatch(/Falta el archivo/)
  })

  it('las lecturas y las importaciones no se editan ni se borran; la aplicación no las escribe directo', async () => {
    const r = await ruta('EN_RUTA')
    const id = await importar(jt, r, lecturas([22, 23]))
    expect((await falla(base.admin.query(`update wms.ruta_logger_lecturas set temperatura = 10 where importe_id = $1`, [id]))).message).toMatch(/no se editan ni se borran/)
    expect((await falla(base.admin.query(`delete from wms.ruta_logger_lecturas where importe_id = $1`, [id]))).message).toMatch(/no se editan ni se borran/)
    expect((await falla(base.admin.query(`update wms.ruta_logger_importes set temp_max = 1 where id = $1`, [id]))).message).toMatch(/no se edita/)
    expect((await falla(base.admin.query(`delete from wms.ruta_logger_importes where id = $1`, [id]))).message).toMatch(/no se borra/)
    for (const sql of [`insert into wms.ruta_logger_lecturas (importe_id, momento, temperatura) values ('${id}', now(), 20)`, `update wms.ruta_logger_importes set vigente = true`]) {
      expect((await falla(base.como(jt, (c) => c.query(sql)))).message, sql).toMatch(/permission denied/)
    }
  })

  it('solo el personal del WMS lee las lecturas', async () => {
    const r = await ruta('EN_RUTA'); await importar(jt, r, lecturas([22, 23]))
    expect((await base.como(base.personas.charlie.id, (c) => c.query('select count(*)::int n from wms.ruta_logger_importes'))).rows[0].n).toBeGreaterThan(0)
    expect((await base.como(base.personas.sinRol.id, (c) => c.query('select count(*)::int n from wms.ruta_logger_importes'))).rows[0].n).toBe(0)
  })
})

describe('la migración 0033', () => {
  it('se puede volver a aplicar sola sin romper nada ni perder lo cargado', async () => {
    const antes = (await uno('select count(*)::int n from wms.ruta_logger_importes')).n
    await base.admin.query(SQL.m0033())
    await base.admin.query(SQL.m0033())
    expect((await uno('select count(*)::int n from wms.ruta_logger_importes')).n).toBe(antes)
    expect((await param('baja_codigo_formato')).valor).toBe('LS-FR.56.01')
    expect((await uno(`select has_function_privilege('authenticated', 'wms.registrar_lecturas_logger(uuid, text, text, text, text, text, integer, numeric, numeric, jsonb, text)'::regprocedure, 'execute') v`)).v).toBe(true)
    expect((await uno(`select has_function_privilege('public', 'wms.registrar_lecturas_logger(uuid, text, text, text, text, text, integer, numeric, numeric, jsonb, text)'::regprocedure, 'execute') v`)).v).toBe(false)
  })
})
