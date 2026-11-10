import { describe, expect, it } from 'vitest'
import {
  CASOS_ANULACION, MENSAJE_CASO_1_2_DESPUES_DE_SALIR, MENSAJE_CASO_3_ANTES_DE_SALIR, errorCodigoMotivo, errorDescripcionOtros, bajaSunatDefinida, construirPayloadNubefact, faltantesDeGuia, mensajeHumanoSunat, motivoNoPuedeAnular, observacionDeGuia, puedeAnularGuia, puedeEmitirGuia,
  type DatosGuia, type TrasladoGuia,
} from '@/domain/guia-electronica'

const datos = (o: Partial<DatosGuia> = {}): DatosGuia => ({
  salidaId: 's1', salidaNumero: 'OS-2026-00001', tipo: 'DISTRIBUCION', conforme: true, pedidoNumero: 'PED-101',
  destinatario: { nombre: 'Botica Salud Total SAC', ruc: '20512345671', direccion: 'Av. Giraldez 480, Huancayo', ubigeo: '120101' },
  lineas: [{ productoCodigo: 'P-1', producto: 'Paracetamol 500 mg', lote: 'L2515', vence: '2028-06-30', cantidad: 20 }, { productoCodigo: 'P-2', producto: 'Ibuprofeno 400 mg', lote: 'L77', vence: null, cantidad: 6 }],
  bultos: 2, ruta: { id: 'r1', numero: 'RUT-2026-00001', fecha: '2026-10-20', placa: 'BKW-757', conductor: 'Luis Quispe', conductorDni: '40123456', conductorLicencia: 'Q40123456' },
  partida: { ubigeo: '150119', direccion: 'Almacén Lurín' }, motivoTraslado: 'VENTA', modalidad: 'TRANSPORTE PRIVADO', serie: 'TTT1',
  reglasBaja: { plazoHoras: 'PENDIENTE', trasInicioTraslado: 'PENDIENTE', soportadaPorApi: 'PENDIENTE' }, ...o,
})
const traslado: TrasladoGuia = { fechaInicio: '2026-10-20', pesoKg: 12 }

describe('qué falta para emitir la guía', () => {
  it('con todo completo no falta nada; sin licencia (ni guardada ni escrita) no se puede emitir', () => {
    expect(faltantesDeGuia(datos(), traslado, 'SIMULADOR')).toEqual([])
    expect(faltantesDeGuia(datos({ ruta: { ...datos().ruta!, conductorLicencia: undefined } }), traslado, 'PRUEBA')).toEqual(['Falta la licencia de conducir del conductor (9 o 10 letras y números)'])
    expect(faltantesDeGuia(datos({ correlativoConfirmado: true }), { ...traslado, licenciaConductor: 'Q40123456' }, 'PRODUCCION')).toEqual([])
  })

  it('dice en palabras lo que falta: conformidad, ruta, vehículo, conductor, datos del cliente y punto de partida', () => {
    const f = faltantesDeGuia(datos({ conforme: false, ruta: undefined, destinatario: {}, partida: { ubigeo: '150119', direccion: 'PENDIENTE' } }), traslado, 'SIMULADOR')
    expect(f).toEqual(expect.arrayContaining([
      'Falta la conformidad de toda la Orden de Salida',
      'Asigna el pedido a una ruta: la guía toma el vehículo, el conductor y la fecha de la ruta',
      'Falta el nombre del cliente', 'Falta el RUC del cliente', 'Falta la dirección de entrega',
      'Falta el ubigeo de la dirección de entrega: lo trae el pedido', 'Falta la dirección del almacén de Lurín (punto de partida): la confirma Charlie o Katia',
    ]))
    expect(faltantesDeGuia(datos({ ruta: { id: 'r', numero: 'R', fecha: '2026-10-20' } }), traslado, 'SIMULADOR')).toEqual(expect.arrayContaining(['La ruta no tiene vehículo', 'La ruta no tiene conductor']))
  })

  it('valida la fecha de inicio y el peso', () => {
    expect(faltantesDeGuia(datos(), { fechaInicio: '', pesoKg: 12 }, 'SIMULADOR')).toEqual(['Indica la fecha de inicio del traslado'])
    expect(faltantesDeGuia(datos(), { fechaInicio: '2026-10-20', pesoKg: 0 }, 'SIMULADOR')).toEqual(['El peso bruto tiene que ser mayor que cero'])
    expect(faltantesDeGuia(datos(), { fechaInicio: '2026-10-20', pesoKg: Number.NaN }, 'SIMULADOR')).toEqual(['El peso bruto tiene que ser mayor que cero'])
  })

  it('el tipo B no tiene guía del WMS: la trae el cliente', () => {
    expect(faltantesDeGuia(datos({ tipo: 'CLIENTE' }), traslado, 'SIMULADOR')).toEqual(['La guía de una orden de un cliente de almacenamiento la trae el cliente: el WMS no la emite'])
  })
})

describe('el mensaje a Nubefact', () => {
  it('se arma con lo del WMS: destinatario, línea por lote, partida Lurín, motivo venta, transporte privado, bultos, vehículo y conductor', () => {
    const p = construirPayloadNubefact(datos(), { ...traslado, pesoKg: 12.5, licenciaConductor: 'q99887766' }, '2026-10-19', 57)
    expect(p).toMatchObject({
      operacion: 'generar_guia', tipo_de_comprobante: 7, serie: 'TTT1', numero: 57, peso_bruto_unidad_de_medida: 'KGM', cliente_numero_de_documento: '20512345671', cliente_denominacion: 'Botica Salud Total SAC',
      fecha_de_emision: '19-10-2026', fecha_de_inicio_de_traslado: '20-10-2026', motivo_de_traslado: '01', tipo_de_transporte: '02', peso_bruto_total: '12.50', numero_de_bultos: '2',
      transportista_placa_numero: 'BKW757', conductor_documento_numero: '40123456', conductor_nombre: 'Luis', conductor_apellidos: 'Quispe', conductor_numero_licencia: 'Q99887766', punto_de_partida_ubigeo: '150119', punto_de_llegada_ubigeo: '120101',
    })
    expect(p.items).toHaveLength(2)
    expect(p.items[0]).toEqual({ unidad_de_medida: 'NIU', codigo: 'P-1', descripcion: 'Paracetamol 500 mg · lote L2515', cantidad: '20' })
  })

  it('la observación de almacenamiento trae el pedido, la Orden de Salida y los lotes con su vencimiento, y no pasa de 500 caracteres', () => {
    const o = observacionDeGuia(datos())
    expect(o).toContain('Pedido PED-101'); expect(o).toContain('Orden de Salida OS-2026-00001'); expect(o).toContain('lote L2515 vence 06-2028')
    expect(observacionDeGuia(datos({ lineas: Array.from({ length: 80 }, (_, i) => ({ productoCodigo: `P-${i}`, producto: 'X', lote: `LOTE-LARGO-${i}`, vence: '2028-01-31', cantidad: 1 })) })).length).toBeLessThanOrEqual(500)
  })

  it('los errores de SUNAT se dicen para quien emite, con la causa y qué hacer', () => {
    expect(mensajeHumanoSunat('2325', 'x')).toMatch(/RUC del cliente/)
    expect(mensajeHumanoSunat(2338, 'x')).toMatch(/licencia/)
    expect(mensajeHumanoSunat('9999', 'texto original')).toMatch(/texto original.*Corrige/)
  })
})

describe('anular la guía por casos', () => {
  const ok = { salidaAbierta: true, guiaVigente: true, motivo: 'Error' }
  it('hay tres casos y el 3 (después de la salida) deja el stock quieto y explica el retorno como devolución', () => {
    expect(CASOS_ANULACION.map((c) => c.caso)).toEqual([1, 2, 3])
    expect(CASOS_ANULACION[1].sigue).toMatch(/stock regresa de Despacho/)
    expect(CASOS_ANULACION[2].sigue).toMatch(/stock NO se toca.*guía nueva.*devolución/)
  })
  it('solo el Jefe de Transporte; con caso y motivo; el caso 3 o una salida confirmada no se anulan desde el WMS', () => {
    expect(puedeAnularGuia(['jefe_transporte'])).toBe(true)
    expect(puedeAnularGuia(['asistente_dt'])).toBe(false)
    expect(puedeEmitirGuia(['asistente_dt'])).toBe(true)
    expect(motivoNoPuedeAnular(['asistente_dt'], 1, ok)).toBe('Solo el Jefe de Transporte puede anular una guía')
    expect(motivoNoPuedeAnular(['jefe_transporte'], null, ok)).toMatch(/Elige qué se equivocó/)
    expect(motivoNoPuedeAnular(['jefe_transporte'], 1, { ...ok, motivo: ' ' })).toBe('Cuenta por qué se anula la guía')
    expect(motivoNoPuedeAnular(['jefe_transporte'], 3, ok)).toBe(MENSAJE_CASO_3_ANTES_DE_SALIR)
    // SB-D (D-191): después de la salida la baja NO se bloquea (caso 3); los casos 1 y 2 ya no valen
    expect(motivoNoPuedeAnular(['jefe_transporte'], 3, { ...ok, salidaAbierta: false, salidaConfirmada: true })).toBeNull()
    expect(motivoNoPuedeAnular(['jefe_transporte'], 3, { ...ok, salidaAbierta: false, salidaConfirmada: true, motivo: '' })).toBe('Cuenta por qué se anula la guía')
    expect(motivoNoPuedeAnular(['jefe_transporte'], 2, { ...ok, salidaAbierta: false, salidaConfirmada: true })).toBe(MENSAJE_CASO_1_2_DESPUES_DE_SALIR)
    expect(motivoNoPuedeAnular(['jefe_transporte'], 1, { ...ok, salidaAbierta: false, salidaConfirmada: false })).toMatch(/cancelada/)
    expect(errorDescripcionOtros('x'.repeat(70))).toBeNull(); expect(errorDescripcionOtros('x'.repeat(71))).toMatch(/entre 1 y 70/); expect(errorDescripcionOtros('  ')).toMatch(/entre 1 y 70/)
    expect(errorCodigoMotivo('06')).toBeNull(); expect(errorCodigoMotivo('6')).toMatch(/2 números/)
    expect(motivoNoPuedeAnular(['jefe_transporte'], 1, { ...ok, guiaVigente: false })).toBe('Esa guía ya está anulada')
    expect(motivoNoPuedeAnular(['jefe_transporte'], 2, ok)).toBeNull()
  })
  it('las reglas de baja de SUNAT están pendientes: no se inventan', () => {
    expect(bajaSunatDefinida({ plazoHoras: 'PENDIENTE', trasInicioTraslado: 'PENDIENTE', soportadaPorApi: 'PENDIENTE' })).toBe(false)
    expect(bajaSunatDefinida({ plazoHoras: '72', trasInicioTraslado: 'NO', soportadaPorApi: 'SI' })).toBe(true)
  })
})

describe('piloto: guía emitida en el panel (0036)', () => {
  const ok = { numero: 'TTT1-00000012', fechaEmision: '2026-11-03', estado: 'ACEPTADA' as const }
  it('el modo es PANEL solo si el parámetro lo dice; sin parámetro, WMS (comportamiento de siempre)', async () => {
    const { normalizarGuiaModo } = await import('@/domain/guia-electronica')
    expect(normalizarGuiaModo('PANEL')).toBe('PANEL')
    expect(normalizarGuiaModo(' panel ')).toBe('PANEL')
    for (const v of [undefined, null, '', 'WMS', 'otro']) expect(normalizarGuiaModo(v)).toBe('WMS')
  })
  it('acepta serie-número válidos, fecha de hoy o anterior, estado conocido y enlace https opcional', async () => {
    const { validarRegistroGuiaPanel } = await import('@/domain/guia-electronica')
    expect(validarRegistroGuiaPanel(ok, '2026-11-03')).toEqual({})
    expect(validarRegistroGuiaPanel({ ...ok, numero: ' t001-1234 ', enlace: 'https://panel.nubefact.com/g.pdf' }, '2026-11-04')).toEqual({})
    expect(validarRegistroGuiaPanel({ ...ok, enlace: '' }, '2026-11-03')).toEqual({})
  })
  it('dice qué falla, campo por campo, en lenguaje llano', async () => {
    const { validarRegistroGuiaPanel } = await import('@/domain/guia-electronica')
    expect(validarRegistroGuiaPanel({ ...ok, numero: '1234' }, '2026-11-03').numero).toMatch(/serie, guion y número/)
    expect(validarRegistroGuiaPanel({ ...ok, fechaEmision: '' }, '2026-11-03').fechaEmision).toMatch(/fecha/)
    expect(validarRegistroGuiaPanel({ ...ok, fechaEmision: '2026-11-05' }, '2026-11-03').fechaEmision).toMatch(/mañana/)
    expect(validarRegistroGuiaPanel({ ...ok, estado: 'RECHAZADA' as never }, '2026-11-03').estado).toMatch(/aceptada o sin respuesta/)
    expect(validarRegistroGuiaPanel({ ...ok, enlace: 'panel.nubefact.com/g' }, '2026-11-03').enlace).toMatch(/https:\/\//)
  })
  it('el origen PANEL tiene su etiqueta', async () => {
    const { ETIQUETA_ORIGEN } = await import('@/domain/guia-electronica')
    expect(ETIQUETA_ORIGEN.PANEL).toMatch(/panel/)
  })
})
