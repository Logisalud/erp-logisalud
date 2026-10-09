import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import {
  accionesDeOrden, buscarDestinos, buscarOrigenes, contenidoDeUbicacion, validarDestino, clasificarReconteo, construirKardex, entraEnKardex, fechaEnLima, parsearCargaInicial, parsearTramos,
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

describe('movimientos internos (D-15)', () => {
  const orden = (estado: OrdenMovimiento['estado'], extra: Partial<OrdenMovimiento> = {}): OrdenMovimiento => ({
    id: 'o', numero: 'MI-2026-00001', estado, motivo: 'm', preparadorId: 'ana', preparador: 'Ana', preparadoEn: '', lineas: [], ...extra,
  })
  it('cada paso lo hace quien corresponde', () => {
    expect(accionesDeOrden(orden('PREPARADO'), 'x', ['jefe_almacen']).autorizar).toBe(true)
    expect(accionesDeOrden(orden('PREPARADO'), 'x', ['auxiliar']).autorizar).toBe(false)
    expect(accionesDeOrden(orden('AUTORIZADO'), 'x', ['auxiliar']).ejecutar).toBe(true)
    expect(accionesDeOrden(orden('AUTORIZADO'), 'x', ['auditoria_lectura']).ejecutar).toBe(false)
    expect(accionesDeOrden(orden('PREPARADO'), 'ana', ['auxiliar']).anular).toBe(true)
    expect(accionesDeOrden(orden('PREPARADO'), 'otra', ['auxiliar']).anular).toBe(false)
    expect(accionesDeOrden(orden('CON_DIFERENCIA'), 'x', ['jefe_almacen']).resolver).toBe(true)
  })
  it('el verificador no es quien preparó ni quien ejecutó', () => {
    const o = orden('EJECUTADO', { ejecutorId: 'beto' })
    expect(accionesDeOrden(o, 'ana', ['auxiliar'])).toMatchObject({ verificar: false, motivoNoVerifica: expect.stringMatching(/preparó/) })
    expect(accionesDeOrden(o, 'beto', ['auxiliar'])).toMatchObject({ verificar: false, motivoNoVerifica: expect.stringMatching(/ejecutó/) })
    expect(accionesDeOrden(o, 'carla', ['auxiliar']).verificar).toBe(true)
    expect(accionesDeOrden(o, 'carla', ['direccion_tecnica']).verificar).toBe(false)
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
    expect(v.porLinea[0].mensaje).toMatch(/no admite unidades en Aprobado/)
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
