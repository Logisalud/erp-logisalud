import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import { FILTROS_VACIOS, ORDEN_INICIAL, filaDeOrden, filtrarMovimientos, hayFiltros, leerVista, ordenarMovimientos, serializarVista, type FiltrosMovimientos, type OrdenColumna } from '@/domain/movimientos-lista'
import {
  accionesDeOrden, puedeEjecutarMovimiento, buscarDestinos, buscarOrigenes, buscarProductosConStock, contenidoDeUbicacion, ubicacionesDeProducto, validarDestino, validarLineasMovimiento, clasificarReconteo, construirKardex, entraEnKardex, fechaEnLima, parsearCargaInicial, parsearTramos,
  reporteVencimientos, totalesKardex, type LoteConStock, type OrdenMovimiento, type PartidaLedger,
} from '@/domain/inventario'

const p = (id: number, tipo: PartidaLedger['tipo'], delta: number, ts: string, extra: Partial<PartidaLedger> = {}): PartidaLedger => ({
  id, ts, movimientoId: `m${id}`, tipo, posicionId: 'pos', productoId: 'prod', loteId: 'lote', propietarioId: 'prop', estado: 'APROBADO',
  origen: 'COMPRA_LOCAL', procedenciaId: 'proc', delta, ...extra,
})
const nombres = { lote: () => 'L-1', propietario: () => 'LOGISSA', posicion: () => 'A-6', producto: 'DEMO · Producto', propietarioDeLote: () => 'prop' }

describe('Kardex', () => {
  const partidas = [
    p(1, 'INGRESO', 50, '2026-10-01T15:00:00Z', { doc: { tipoIngreso: 'COMPRA_LOCAL', contraparte: 'DIPHASAC', ruc: '20546207219', tipoDoc: 'GUÍA DE REMISIÓN', numeroDoc: 'T001-1', actaNumero: 'I-202610-0001' } }),
    p(2, 'MOVIMIENTO', -10, '2026-10-02T15:00:00Z'), p(3, 'MOVIMIENTO', 10, '2026-10-02T15:00:00Z', { posicionId: 'otra' }),
    p(4, 'CAMBIO_ESTADO', -5, '2026-10-03T15:00:00Z'), p(5, 'CAMBIO_ESTADO', 5, '2026-10-03T15:00:00Z', { estado: 'BAJAS_RECHAZADOS' }),
    p(6, 'AJUSTE', -2, '2026-10-05T15:00:00Z'),
    p(7, 'REVERSA', 2, '2026-10-06T15:00:00Z', { tipoOriginal: 'AJUSTE' }),
    p(8, 'REVERSA', 10, '2026-10-06T15:00:00Z', { tipoOriginal: 'MOVIMIENTO' }),
  ]
  it('solo entradas y salidas: los movimientos internos y cambios de estado no entran', () => {
    const k = construirKardex(partidas, { productoId: 'prod' }, nombres)
    expect(k.map((f) => f.tipoDocumento)).toEqual(['Acta de Recepción', 'Ajuste autorizado', 'Reversa de ajuste'])
    expect(k.map((f) => f.saldo)).toEqual([50, 48, 50])
    expect(k[0]).toMatchObject({ numeroActa: 'I-202610-0001', contraparte: 'DIPHASAC', ruc: '20546207219', entrada: 50, salida: 0, tipoIngreso: 'COMPRA_LOCAL' })
    expect(k[2]).toMatchObject({ esReversa: true, entrada: 2 })
  })
  it('con rango, parte del saldo inicial', () => {
    const k = construirKardex(partidas, { productoId: 'prod', desde: '2026-10-05' }, nombres)
    expect(k[0]).toMatchObject({ esSaldoInicial: true, saldo: 50 })
    expect(totalesKardex(k)).toEqual({ entradas: 2, salidas: 2, saldoInicial: 50, saldoFinal: 50 })
  })
  it('las fechas se cuentan en la hora de Lima', () => {
    expect(fechaEnLima('2026-10-02T03:00:00Z')).toBe('2026-10-01')
    expect(entraEnKardex({ tipo: 'REVERSA', tipoOriginal: 'CAMBIO_ESTADO' })).toBe(false)
  })
})

describe('vencimientos (D-30)', () => {
  const l = (lote: string, vence: string | undefined, cantidad: number, estados: LoteConStock['estados'] = ['APROBADO']): LoteConStock =>
    ({ loteId: lote, productoId: 'p', producto: 'Producto', lote, vence, propietario: 'LOGISSA', cantidad, estados })
  const hoy = '2026-10-08'
  it('separa vencidos, tramos configurables y sin fecha; deja fuera Bajas/Rechazados', () => {
    const r = reporteVencimientos([l('A', '2026-10-01', 5), l('B', '2026-10-20', 10), l('C', '2026-12-01', 7), l('D', '2027-12-01', 3), l('E', undefined, 1), l('F', '2026-10-09', 99, ['BAJAS_RECHAZADOS'])], hoy, [30, 60, 90])
    expect(r.map((t) => [t.clave, t.unidades])).toEqual([['vencido', 5], ['hasta-30', 10], ['hasta-60', 7], ['hasta-90', 0], ['mas', 3], ['sin-fecha', 1]])
    expect(r[1].lotes[0]).toMatchObject({ lote: 'B', dias: 12 })
  })
  it('el vencimiento de hoy todavía no está vencido; los tramos se leen del parámetro', () => {
    expect(reporteVencimientos([l('H', hoy, 1)], hoy)[0].unidades).toBe(0)
    expect(parsearTramos('90, 30,30,x,-5')).toEqual([30, 90])
    expect(parsearTramos('')).toEqual([30, 60, 90, 180])
  })
})

describe('movimientos internos: dos personas, ejecutar → verificar (D-15)', () => {
  const orden = (estado: OrdenMovimiento['estado'], extra: Partial<OrdenMovimiento> = {}): OrdenMovimiento => ({
    id: 'o', numero: 'MI-2026-00001', estado, motivo: 'm', ejecutorId: 'ana', ejecutor: 'Ana', ejecutadoEn: '2026-10-07T15:00:00Z', lineas: [], ...extra,
  })
  const l = (verificacion: 'PENDIENTE' | 'CONFIRMADA' | 'CON_DIFERENCIA'): OrdenMovimiento['lineas'][number] => ({
    id: verificacion, productoId: 'p', producto: 'P', loteId: 'l', lote: 'L', propietario: 'LOGISSA', estado: 'APROBADO', procedenciaId: 'x', desdePosicionId: 'a', desde: 'A-1', haciaPosicionId: 'b', hacia: 'B-1', cantidad: 1, verificacion,
  })
  it('no hay autorización ni paso intermedio: el Jefe solo resuelve diferencias y anula', () => {
    expect(Object.keys(accionesDeOrden(orden('EJECUTADO'), 'x', ['jefe_almacen'])).sort()).toEqual(['anular', 'ejecutorViendo', 'motivoNoVerifica', 'resolver', 'verificar'])
    expect(accionesDeOrden(orden('CON_DIFERENCIA'), 'x', ['jefe_almacen']).resolver).toBe(true)
    expect(accionesDeOrden(orden('CON_DIFERENCIA'), 'x', ['auxiliar']).resolver).toBe(false)
    expect(accionesDeOrden(orden('CON_DIFERENCIA'), 'x', ['reemplazo_jefe']).resolver).toBe(true)
  })
  it('lo anula quien lo ejecutó (o el Jefe), solo mientras nadie verificó ninguna línea', () => {
    const o = orden('EJECUTADO', { lineas: [l('PENDIENTE')] })
    expect(accionesDeOrden(o, 'ana', ['auxiliar']).anular).toBe(true)
    expect(accionesDeOrden(o, 'otra', ['auxiliar']).anular).toBe(false)
    expect(accionesDeOrden(o, 'otra', ['jefe_almacen']).anular).toBe(true)
    expect(accionesDeOrden(orden('EJECUTADO', { lineas: [l('PENDIENTE'), l('CONFIRMADA')] }), 'ana', ['auxiliar']).anular).toBe(false)
    expect(accionesDeOrden(orden('CONFIRMADO', { lineas: [l('CONFIRMADA')] }), 'ana', ['jefe_almacen']).anular).toBe(false)
  })
  it('el EJECUTOR no verifica su propio movimiento; otro auxiliar, el Jefe o su reemplazo sí; Dirección Técnica no', () => {
    const o = orden('EJECUTADO', { lineas: [l('PENDIENTE')] })
    expect(accionesDeOrden(o, 'ana', ['auxiliar'])).toMatchObject({ verificar: false, motivoNoVerifica: expect.stringMatching(/ejecutó/) })
    expect(accionesDeOrden(o, 'ana', ['jefe_almacen']).verificar).toBe(false)            // ni siendo el Jefe: la regla es por persona
    expect(accionesDeOrden(o, 'carla', ['auxiliar']).verificar).toBe(true)
    expect(accionesDeOrden(o, 'carla', ['jefe_almacen']).verificar).toBe(true)
    expect(accionesDeOrden(o, 'carla', ['reemplazo_jefe']).verificar).toBe(true)
    expect(accionesDeOrden(o, 'carla', ['direccion_tecnica']).verificar).toBe(false)
    expect(accionesDeOrden(o, 'carla', ['auditoria_lectura']).verificar).toBe(false)
  })
  it('quienes mueven mercadería registran movimientos; Dirección Técnica y auditoría no', () => {
    expect(['auxiliar', 'jefe_almacen', 'reemplazo_jefe'].every((r) => puedeEjecutarMovimiento([r as never]))).toBe(true)
    expect(puedeEjecutarMovimiento(['direccion_tecnica'])).toBe(false)
    expect(puedeEjecutarMovimiento(['auditoria_lectura'])).toBe(false)
  })
})

describe('conteos y carga inicial', () => {
  it('clasifica el segundo conteo', () => {
    expect(clasificarReconteo(10, 8, 10)).toBe('COINCIDE_EN_RECONTEO')
    expect(clasificarReconteo(10, 8, 8)).toBe('DIFERENCIA_CONFIRMADA')
    expect(clasificarReconteo(10, 8, 9)).toBe('NO_CONCLUYENTE')
  })
  it('lee un CSV con punto y coma, tildes y fechas dd/mm/aaaa', () => {
    const r = parsearCargaInicial('Producto;Lote;Vencimiento;Propietario;Ubicación;Estado;Cantidad\nDEMO-001;L1;31/12/2028;logissa;a-6;aprobado;1.200\nDEMO-002;L2;2029-01-31;LOGISSA;A-7;APROBADO;x')
    expect(r.filas[0]).toEqual({ producto: 'DEMO-001', lote: 'L1', vence: '2028-12-31', propietario: 'LOGISSA', posicion: 'A-6', estado: 'APROBADO', cantidad: '1200' })
    expect(r.errores).toEqual([{ fila: 2, error: expect.stringMatching(/cantidad «x»/) }])
  })
  it('avisa cuando faltan columnas o el archivo está vacío', () => {
    expect(parsearCargaInicial('producto,lote\nA,B').errores[0].error).toMatch(/Faltan las columnas: vence, propietario/)
    expect(parsearCargaInicial('  \n').errores[0].error).toMatch(/vacío/)
  })
})

describe('Mover: buscar el origen y validar el destino', () => {
  const pan = construirPanoramaDemo('2026-10-07')
  const loteVence = pan.lotes.find((l) => l.codigo === 'L-VENCE-PRONTO')!
  const origenId = pan.saldos.find((s) => s.loteId === loteVence.id)!.posicionId
  const lineasOrigen = () => contenidoDeUbicacion(pan, origenId)
  const aValidar = () => lineasOrigen().map((l) => ({ clave: l.clave, posicionId: l.posicionId, propietarioId: l.propietarioId, propietario: l.propietario, estado: l.estado }))

  it('buscar por lote encuentra la ubicación que lo tiene, con todas sus líneas', () => {
    const r = buscarOrigenes(pan, 'L-VENCE')
    expect(r[0]).toMatchObject({ posicionId: origenId })
    expect(r[0].lineas).toBeGreaterThanOrEqual(2)
    expect(r[0].coincidencias.length).toBeGreaterThan(0)
  })
  it('buscar por código de ubicación y sin texto', () => {
    const cod = pan.posiciones.find((x) => x.id === origenId)!.codigo
    expect(buscarOrigenes(pan, cod).map((x) => x.posicionId)).toContain(origenId)
    expect(buscarOrigenes(pan, '  ')).toEqual([])
  })
  it('una ubicación bloqueada se ofrece, pero marcada: no se puede mover desde ahí', () => {
    const r = buscarOrigenes(pan, 'L-VENCE', { [origenId]: 'está en conteo' })
    expect(r[0].bloqueada).toBe('está en conteo')
  })
  it('las unidades reservadas por otro movimiento no están disponibles', () => {
    const l = lineasOrigen()[0]
    const r = contenidoDeUbicacion(pan, origenId, new Map([[l.clave, l.cantidad]]))
    expect(r.find((x) => x.clave === l.clave)!.disponible).toBe(0)
  })
  it('el destino se valida por línea, con un mensaje que se entiende', () => {
    const cuarentena = pan.posiciones.find((x) => x.tipoArea === 'CUARENTENA')!
    const v = validarDestino(pan, cuarentena.id, aValidar())!
    expect(v.ok).toBe(false)
    expect(v.invalidas).toBe(v.porLinea.length)
    expect(v.porLinea[0].mensaje).toMatch(/Ya está aprobado: no vuelve a Cuarentena|no admite unidades en Aprobado/)
  })
  it('no se mueve a la misma ubicación, ni a una inactiva o bloqueada', () => {
    expect(validarDestino(pan, origenId, aValidar())!.porLinea.every((x) => x.mensaje === 'Ya está en esa ubicación.')).toBe(true)
    const otra = pan.posiciones.find((x) => x.id !== origenId && x.tipoArea === 'APROBADOS')!
    expect(validarDestino(pan, otra.id, aValidar(), { [otra.id]: 'está en conteo' })!.general).toMatch(/está en conteo/)
  })
  it('los destinos que sirven para todas las líneas salen primero', () => {
    const r = buscarDestinos(pan, 'A-', aValidar())
    const primerMalo = r.findIndex((x) => x.invalidas > 0)
    expect(primerMalo === -1 || r.slice(primerMalo).every((x) => x.invalidas > 0)).toBe(true)
  })
})

describe('Mover con varios orígenes: buscar por producto y validar cada línea contra su destino', () => {
  const pan = construirPanoramaDemo('2026-10-07')
  const dapa = pan.productos.find((x) => x.codigo === 'DEMO-001')!

  it('buscar por nombre, por código o por lote encuentra el producto con lo disponible', () => {
    const porNombre = buscarProductosConStock(pan, 'dapagliflozina')
    expect(porNombre[0]).toMatchObject({ productoId: dapa.id, codigo: 'DEMO-001' })
    expect(porNombre[0].disponibles).toBeGreaterThan(0)
    expect(buscarProductosConStock(pan, 'DEMO-001')[0].productoId).toBe(dapa.id)
    const loteDeDapa = pan.lotes.find((l) => l.productoId === dapa.id)!
    const r = buscarProductosConStock(pan, loteDeDapa.codigo)
    expect(r.some((x) => x.productoId === dapa.id)).toBe(true)
    expect(r.find((x) => x.productoId === dapa.id)!.coincidencias).toContain(`lote ${loteDeDapa.codigo}`)
    expect(buscarProductosConStock(pan, '  ')).toEqual([])
  })

  it('lo disponible descuenta lo reservado por movimientos abiertos', () => {
    const celda = pan.saldos.find((s) => s.productoId === dapa.id && s.estado === 'APROBADO')!
    const clave = `${celda.posicionId}|${celda.loteId}|${celda.estado}|${celda.procedenciaId}`
    const libre = buscarProductosConStock(pan, 'DEMO-001')[0].disponibles
    const reservado = buscarProductosConStock(pan, 'DEMO-001', new Map([[clave, 5]]))[0].disponibles
    expect(libre - reservado).toBe(5)
  })

  it('«dónde está» lista todas las celdas del producto, lo que vence antes primero, con posición, área y bloqueo', () => {
    const celdas = ubicacionesDeProducto(pan, dapa.id)
    expect(celdas.length).toBeGreaterThan(0)
    expect(celdas.every((c) => c.productoId === dapa.id && c.posicion && c.area)).toBe(true)
    const vences = celdas.map((c) => c.vence ?? '9999')
    expect([...vences].sort()).toEqual(vences)
    const bloq = ubicacionesDeProducto(pan, dapa.id, new Map(), { [celdas[0].posicionId]: 'está en conteo CT-1' })
    expect(bloq.find((c) => c.posicionId === celdas[0].posicionId)).toBeUndefined() // una ubicación en conteo no se ofrece como origen
  })

  it('cada línea se valida contra SU destino: el de la cabecera o uno propio', () => {
    const celdas = ubicacionesDeProducto(pan, dapa.id)
    const cuarentena = pan.posiciones.find((x) => x.tipoArea === 'CUARENTENA')!
    const libre = pan.posiciones.find((x) => x.tipoArea === 'APROBADOS' && x.id !== celdas[0].posicionId && !pan.saldos.some((s) => s.posicionId === x.id))!
    const base = celdas.slice(0, 2).map((c) => ({ clave: c.clave, posicionId: c.posicionId, propietarioId: c.propietarioId, propietario: c.propietario, estado: c.estado }))
    const r = validarLineasMovimiento(pan, [{ ...base[0], haciaPosicionId: libre.id }, { ...base[1], haciaPosicionId: cuarentena.id }])
    expect(r[1]).toMatchObject({ ok: false })
    expect(r[1].mensaje).toMatch(/Ya está aprobado|no admite unidades en Aprobado|es de|no tiene una asignación/)
    expect(r[0].clave).toBe(base[0].clave)
  })

  it('una línea sin destino se marca «falta elegir el destino»; un origen en conteo no se mueve', () => {
    const c = ubicacionesDeProducto(pan, dapa.id)[0]
    const min = { clave: c.clave, posicionId: c.posicionId, propietarioId: c.propietarioId, propietario: c.propietario, estado: c.estado }
    expect(validarLineasMovimiento(pan, [min])[0]).toMatchObject({ ok: false, sinDestino: true, mensaje: 'Falta elegir el destino.' })
    const otro = pan.posiciones.find((x) => x.id !== c.posicionId && x.tipoArea === 'APROBADOS')!
    const r = validarLineasMovimiento(pan, [{ ...min, haciaPosicionId: otro.id }], { [c.posicionId]: 'está en conteo CT-1' })
    expect(r[0].mensaje).toMatch(/está en conteo CT-1: no se mueve desde ahí/)
  })
})

describe('lista de movimientos: filas, filtros, orden y vistas guardadas', () => {
  const linea = (id: string, desde: string, hacia: string, propietario: string, cantidad: number, producto = 'DEMO-001 · Dapagliflozina'): OrdenMovimiento['lineas'][number] => ({
    id, productoId: 'p', producto, loteId: 'l', lote: 'L2401', propietario, estado: 'APROBADO', procedenciaId: 'x', desdePosicionId: desde, desde, haciaPosicionId: hacia, hacia, cantidad, verificacion: 'PENDIENTE',
  })
  const orden = (id: string, numero: string, ejecutadoEn: string, lineas: OrdenMovimiento['lineas'], extra: Partial<OrdenMovimiento> = {}): OrdenMovimiento => ({
    id, numero, estado: 'EJECUTADO', motivo: 'Acomodo', ejecutorId: 'u1', ejecutor: 'Milka', ejecutadoEn, lineas, ...extra,
  })
  const filas = [
    filaDeOrden(orden('1', 'MI-2026-00001', '2026-10-05T15:00:00Z', [linea('a', 'A-10.2', 'B-2', 'Logissa', 5)])),
    filaDeOrden(orden('2', 'MI-2026-00002', '2026-10-06T15:00:00Z', [linea('b', 'A-10.2', 'B-2', 'Logissa', 4), linea('c', 'A-12.1', 'B-3', 'Diphasac', 6, 'DEMO-003 · Losartán')], { ejecutor: 'Jose Carlos', ejecutorId: 'u2', estado: 'CON_DIFERENCIA', verificador: 'Charlie' })),
    filaDeOrden(orden('3', 'MI-2026-00010', '2026-10-07T15:00:00Z', [linea('d', 'A-9', 'A-21.1', 'Diphasac', 20)], { estado: 'CONFIRMADO', verificador: 'Milka', ejecutor: 'Alberto', ejecutorId: 'u3' })),
  ]

  it('una fila por movimiento: «Varios» cuando hay más de un origen, destino o propietario; líneas y unidades', () => {
    expect(filas[0]).toMatchObject({ desde: 'A-10.2', hacia: 'B-2', propietario: 'Logissa', lineas: 1, unidades: 5, dia: '2026-10-05' })
    expect(filas[1]).toMatchObject({ desde: 'Varios', hacia: 'Varios', propietario: 'Varios', lineas: 2, unidades: 10, ejecutor: 'Jose Carlos', verificador: 'Charlie' })
    expect(filas[1].propietarios.sort()).toEqual(['Diphasac', 'Logissa'])
  })
  it('busca por referencia, producto, lote, ubicación o persona; los filtros se combinan', () => {
    const f = (c: Partial<FiltrosMovimientos>) => filtrarMovimientos(filas, { ...FILTROS_VACIOS, ...c }).map((x) => x.numero)
    expect(f({ q: 'losartan' })).toEqual(['MI-2026-00002'])
    expect(f({ q: 'mi-2026-00010' })).toEqual(['MI-2026-00010'])
    expect(f({ q: 'l2401' })).toHaveLength(3)
    expect(f({ q: 'jose' })).toEqual(['MI-2026-00002'])
    expect(f({ estado: 'CONFIRMADO' })).toEqual(['MI-2026-00010'])
    expect(f({ propietario: 'Diphasac' })).toEqual(['MI-2026-00002', 'MI-2026-00010'])
    expect(f({ ejecutor: 'Milka' })).toEqual(['MI-2026-00001'])
    expect(f({ ubicacion: 'a-12' })).toEqual(['MI-2026-00002'])
    expect(f({ desde: '2026-10-06', hasta: '2026-10-06' })).toEqual(['MI-2026-00002'])
    expect(f({ propietario: 'Logissa', estado: 'CON_DIFERENCIA' })).toEqual(['MI-2026-00002'])
    expect(filtrarMovimientos(filas, { ...FILTROS_VACIOS, mios: true }, new Set(['3'])).map((x) => x.id)).toEqual(['3'])
  })
  it('ordena por columna: números como números, códigos en orden natural, fecha por defecto la más reciente', () => {
    const o = (col: OrdenColumna['col'], dir: OrdenColumna['dir']) => ordenarMovimientos(filas, { col, dir }).map((x) => x.numero)
    expect(o('fecha', 'desc')).toEqual(['MI-2026-00010', 'MI-2026-00002', 'MI-2026-00001'])
    expect(o('unidades', 'desc')).toEqual(['MI-2026-00010', 'MI-2026-00002', 'MI-2026-00001'])
    expect(o('lineas', 'asc')[2]).toBe('MI-2026-00002')
    expect(o('desde', 'asc')).toEqual(['MI-2026-00010', 'MI-2026-00001', 'MI-2026-00002'])   // A-9 < A-10.2 < Varios
    expect(o('numero', 'asc')).toEqual(['MI-2026-00001', 'MI-2026-00002', 'MI-2026-00010'])
  })
  it('una vista guardada recupera exactamente los filtros y el orden; lo inválido vuelve a lo básico', () => {
    const f: FiltrosMovimientos = { ...FILTROS_VACIOS, estado: 'CON_DIFERENCIA', propietario: 'Diphasac', mios: true }
    const v = serializarVista(f, { col: 'unidades', dir: 'asc' })
    expect(v).toEqual({ orden: 'unidades:asc', estado: 'CON_DIFERENCIA', propietario: 'Diphasac', mios: '1' })
    expect(leerVista(v)).toEqual({ filtros: f, orden: { col: 'unidades', dir: 'asc' } })
    expect(leerVista({ orden: 'x:y', estado: 'OTRO' })).toEqual({ filtros: FILTROS_VACIOS, orden: ORDEN_INICIAL })
    expect(hayFiltros(FILTROS_VACIOS)).toBe(false)
  })
})
