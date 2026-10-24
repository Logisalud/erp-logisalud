// SB-B: devolución al proveedor (aviso, no bloqueo; correo), muestra a un trabajador (DNI), código del motivo de traslado, numeración de las guías (errores de Nubefact,
// correlativo inicial) y la guía con DNI.
import { describe, expect, it } from 'vitest'
import { avisoDevolucionCercana, loteApto } from '@/domain/salidas'
import { validarDestinatarioC, validarLineaSalidaCliente, validarOrdenManual, mensajeAvisoSinMotivo, type LoteParaSalida } from '@/domain/salida-manual'
import { correoAlProveedor } from '@/domain/devolucion-proveedor'
import { clasificarCausaNubefact, numeroEsperadoPorNubefact, puedeAdministrarNumeracion, validarCorrelativoInicial, numeroConSerie } from '@/domain/numeracion-guias'
import { descripcionOtrosDeGuia, codigoMotivoDeGuia, construirPayloadNubefact, faltantesDeGuia, type DatosGuia } from '@/domain/guia-electronica'

const HOY = '2026-10-23'
const lote = (vence: string | null): LoteParaSalida => ({ loteId: 'l1', codigo: 'L-1', productoId: 'p1', propietarioId: 'logissa', propietario: 'Logissa', vence, disponibleAprobado: 100, enBajas: 0, enReserva: false })
const linea = (vence: string | null, diasAvisoDevolucion?: number) => validarLineaSalidaCliente({ tipo: 'PROVEEDOR', motivo: 'DEVOLUCION_PROVEEDOR', propietarioId: 'logissa', productoId: 'p1', loteCodigo: 'L-1', cantidad: 5, hoy: HOY, lotes: [lote(vence)], diasAvisoDevolucion })

describe('devolución al proveedor: menos de 90 días avisa, no bloquea', () => {
  it('con 89 días hay aviso; con 90 o más, no; vencido o sin fecha no es aviso (es bloqueo)', () => {
    expect(avisoDevolucionCercana('2027-01-20', HOY)).toBe('Al lote le faltan 89 días para vencer y el proveedor pide al menos 90 días (3 meses). Puedes continuar si escribes el motivo.')
    expect(avisoDevolucionCercana('2027-01-21', HOY)).toBeNull()
    expect(avisoDevolucionCercana('2026-10-22', HOY)).toBeNull()
    expect(avisoDevolucionCercana(null, HOY)).toBeNull()
    expect(avisoDevolucionCercana('2027-01-20', HOY, 60)).toBeNull()
  })
  it('la línea es válida con aviso (no se bloquea); un lote vencido sigue bloqueando', () => {
    expect(linea('2026-12-01')).toMatchObject({ ok: true, aviso: expect.stringContaining('le faltan 39 días') })
    expect(linea('2027-06-30')).toEqual({ ok: true, lote: expect.anything(), vence: '2027-06-30' })
    expect(linea('2026-10-22')).toMatchObject({ ok: false, campo: 'lote', mensaje: expect.stringContaining('no se devuelve vencido a nadie') })
    expect(linea('2026-12-01', 30)).not.toHaveProperty('aviso')
  })
  it('la política de canje mínima sigue bloqueando (es un parámetro aparte)', () => {
    expect(loteApto('2026-12-01', 'PROVEEDOR', 'DEVOLUCION_PROVEEDOR', HOY, 0, { diasMinimos: 60, diasMaximos: null })).toMatchObject({ apto: false })
  })
  it('el mensaje cuando falta el motivo cuenta las líneas', () => {
    expect(mensajeAvisoSinMotivo(1, 90)).toBe('Una línea tiene menos de 90 días para vencer: escribe el motivo para continuar con la devolución')
    expect(mensajeAvisoSinMotivo(3, 90)).toBe('3 líneas tienen menos de 90 días para vencer: escribe el motivo para continuar con la devolución')
  })
  it('el correo al proveedor lleva producto, lote, vencimiento y cantidad, y la guía si ya existe; sin líneas queda vacío', () => {
    const c = correoAlProveedor({ ordenNumero: 'OS-2026-00012', proveedor: 'Biosana SAC', lineas: [{ producto: 'Paracetamol 500 mg', productoCodigo: 'P-1001', lote: 'L-24A', vence: '2026-12-31', cantidad: 120 }, { producto: 'Ibuprofeno', productoCodigo: 'P-2', lote: 'X', vence: null, cantidad: 1 }], guiaNumero: 'TTT1-00002888' })
    expect(c.asunto).toBe('Devolución de producto · Orden OS-2026-00012 · LOGISALUD')
    expect(c.cuerpo).toContain('Estimados Biosana SAC:')
    expect(c.cuerpo).toContain('• Paracetamol 500 mg (P-1001) · lote L-24A · vence 31/12/2026 · 120 unidades')
    expect(c.cuerpo).toContain('• Ibuprofeno (P-2) · lote X · vence sin fecha · 1 unidad')
    expect(c.cuerpo).toContain('guía de remisión TTT1-00002888')
    expect(c.texto.startsWith('Asunto: Devolución')).toBe(true)
    expect(correoAlProveedor({ ordenNumero: 'x', proveedor: 'y', lineas: [] }).texto).toBe('')
  })
})

describe('muestra a nombre de un trabajador (DNI)', () => {
  const base = { razonSocial: 'Pedro Quispe', direccion: 'Jr. Pinos 12', ubigeo: '150101' }
  it('una muestra acepta DNI de 8 números; sin tipo o con otro motivo sigue pidiendo RUC', () => {
    expect(validarDestinatarioC({ ...base, ruc: '40123456', tipoDocumento: 'DNI' }, 'MUESTRA')).toEqual({})
    expect(validarDestinatarioC({ ...base, ruc: '4012345', tipoDocumento: 'DNI' }, 'MUESTRA')).toEqual({ ruc: 'El DNI tiene 8 números' })
    expect(validarDestinatarioC({ ...base, ruc: '40123456' }, 'MUESTRA')).toEqual({ ruc: 'El RUC tiene 11 números' })
    expect(validarDestinatarioC({ ...base, ruc: '40123456', tipoDocumento: 'DNI' }, 'DEVOLUCION_PROVEEDOR')).toEqual({ ruc: 'El RUC tiene 11 números' })
  })
  it('la orden completa de muestra con DNI valida', () => {
    expect(validarOrdenManual({ clase: 'C', motivo: 'MUESTRA', cliente: { ...base, ruc: '40123456', tipoDocumento: 'DNI' }, lineas: [{ productoId: 'p', cantidad: 2 }] })).toEqual({})
  })
})

const datos: DatosGuia = {
  salidaId: 's1', salidaNumero: 'OS-2026-00001', tipo: 'MUESTRA', conforme: true,
  destinatario: { nombre: 'Pedro Quispe', ruc: '40123456', tipoDocumento: 'DNI', direccion: 'Jr. Pinos 12', ubigeo: '150101' },
  lineas: [{ productoCodigo: 'P-1', producto: 'Paracetamol', lote: 'L1', vence: '2028-06-30', cantidad: 2 }], bultos: 1,
  ruta: { id: 'r', numero: 'RUT-1', fecha: '2026-10-24', placa: 'BKW-757', conductor: 'Luis Quispe', conductorDni: '40123456', conductorLicencia: 'Q40123456' },
  partida: { ubigeo: '150119', direccion: 'Lurín' }, motivoTraslado: 'OTROS', modalidad: 'TRANSPORTE PRIVADO', serie: 'TTT1',
  reglasBaja: { plazoHoras: 'PENDIENTE', trasInicioTraslado: 'PENDIENTE', soportadaPorApi: 'PENDIENTE' },
}
const traslado = { fechaInicio: '2026-10-24', pesoKg: 5 }

describe('la guía de una muestra a un trabajador', () => {
  it('va con tipo de documento 1 (DNI), el motivo del parámetro y la observación de muestra sin valor comercial', () => {
    const p = construirPayloadNubefact(datos, traslado, HOY, 7)
    expect(p).toMatchObject({ cliente_tipo_de_documento: 1, cliente_numero_de_documento: '40123456', motivo_de_traslado: '13' })
    expect(p.observaciones).toContain('Muestra sin valor comercial.')
    expect(p.motivo_de_traslado_otros_descripcion).toBe('MUESTRA SIN VALOR COMERCIAL')
    expect(construirPayloadNubefact({ ...datos, motivoCodigo: '04' }, traslado, HOY, 7).motivo_de_traslado).toBe('04')
    expect(codigoMotivoDeGuia({ tipo: 'PROVEEDOR', motivoCodigo: undefined })).toBe('06')
    expect(codigoMotivoDeGuia({ tipo: 'MUESTRA', motivoCodigo: 'ab' })).toBe('13')       // un parámetro mal escrito no llega a Nubefact
    expect(construirPayloadNubefact({ ...datos, destinatario: { ...datos.destinatario, tipoDocumento: undefined, ruc: '20512345671' } }, traslado, HOY, 7).cliente_tipo_de_documento).toBe(6)
  })
  it('sin DNI dice DNI; una guía real no se emite sin el correlativo confirmado, pero el simulador y las pruebas sí', () => {
    expect(faltantesDeGuia({ ...datos, destinatario: { ...datos.destinatario, ruc: '' } }, traslado, 'SIMULADOR')).toContain('Falta el DNI de quien recibe')
    expect(faltantesDeGuia(datos, traslado, 'PRODUCCION')[0]).toMatch(/falta confirmar con qué número empieza la serie TTT1/)
    expect(faltantesDeGuia({ ...datos, correlativoConfirmado: true }, traslado, 'PRODUCCION')).toEqual([])
    expect(faltantesDeGuia(datos, traslado, 'PRUEBA')).toEqual([])
    expect(faltantesDeGuia(datos, traslado, 'SIMULADOR')).toEqual([])
  })
})

describe('motivo de traslado: 06 devolución; 13 otros con descripción de máximo 70 caracteres', () => {
  it('la devolución lleva 06 y no lleva descripción; la muestra y el retorno de rechazo llevan 13 con su descripción; todo sale de parámetros', () => {
    const dev = construirPayloadNubefact({ ...datos, tipo: 'PROVEEDOR' }, traslado, HOY, 3)
    expect(dev.motivo_de_traslado).toBe('06')
    expect(dev).not.toHaveProperty('motivo_de_traslado_otros_descripcion')
    expect(descripcionOtrosDeGuia({ tipo: 'DISTRIBUCION', motivoCodigo: undefined, motivoOtrosDescripcion: 'x' })).toBeUndefined()
    expect(descripcionOtrosDeGuia({ tipo: 'CLIENTE', motivoCodigo: '13', motivoOtrosDescripcion: undefined })).toBe('RETORNO DE RECHAZO')
    expect(descripcionOtrosDeGuia({ tipo: 'MUESTRA', motivoCodigo: '13', motivoOtrosDescripcion: ' Muestra médica a trabajador ' })).toBe('Muestra médica a trabajador')
    expect(descripcionOtrosDeGuia({ tipo: 'MUESTRA', motivoCodigo: undefined, motivoOtrosDescripcion: 'x'.repeat(100) })).toHaveLength(70)
    expect(construirPayloadNubefact({ ...datos, motivoCodigo: '06' }, traslado, HOY, 3)).not.toHaveProperty('motivo_de_traslado_otros_descripcion')
  })
})

describe('numeración de las guías', () => {
  it('reconoce «ya existe», «salto» y «no existe» por el texto de Nubefact, y no confunde unos con otros', () => {
    expect(clasificarCausaNubefact(23, 'Este documento ya existe en NubeFacT')).toBe('NUMERO_EXISTE')
    expect(clasificarCausaNubefact('1033', 'El comprobante ya fue registrado')).toBe('NUMERO_EXISTE')
    expect(clasificarCausaNubefact(undefined, 'El número no es correlativo: el siguiente debe ser 2890')).toBe('NUMERO_SALTO')
    expect(clasificarCausaNubefact(undefined, 'Salto de numeración')).toBe('NUMERO_SALTO')
    expect(clasificarCausaNubefact(21, 'Este documento no existe en NubeFacT')).toBe('NO_ENCONTRADA')
    expect(clasificarCausaNubefact(10, 'Serie no existe')).toBe('NO_ENCONTRADA')
    expect(clasificarCausaNubefact(2325, 'RUC inválido')).toBeNull()
  })
  it('lee el número que Nubefact esperaba', () => {
    expect(numeroEsperadoPorNubefact('El número no es correlativo: el siguiente debe ser 2890')).toBe(2890)
    expect(numeroEsperadoPorNubefact('Se esperaba el número 12')).toBe(12)
    expect(numeroEsperadoPorNubefact('error cualquiera')).toBeUndefined()
  })
  it('el correlativo inicial es un entero de 1 a 99 999 999; lo confirman el Jefe de Transporte y la administración', () => {
    for (const v of ['', 'abc', '0', '-3', '1.5', '100000000']) expect(validarCorrelativoInicial(v), v).toMatch(/entero de 1 a 99 999 999/)
    expect(validarCorrelativoInicial('2888')).toBeNull()
    expect(validarCorrelativoInicial(1)).toBeNull()
    expect(puedeAdministrarNumeracion(['jefe_transporte'])).toBe(true)
    expect(puedeAdministrarNumeracion(['admin_wms'])).toBe(true)
    for (const r of ['auxiliar', 'jefe_almacen', 'direccion_tecnica', 'autoriza_salidas_sin_venta'] as const) expect(puedeAdministrarNumeracion([r]), r).toBe(false)
    expect(numeroConSerie('TTT1', 2888)).toBe('TTT1-00002888')
  })
})

describe('D-210: nombres del modo de Nubefact en pantalla', () => {
  it('cada modo tiene un nombre claro y ninguna etiqueta lleva ruta ni token', async () => {
    const { NOMBRE_MODO, ETIQUETA_MODO } = await import('@/domain/guia-electronica')
    expect(NOMBRE_MODO).toEqual({ SIMULADOR: 'Simulador', PRUEBA: 'Nubefact (modo prueba)', PRODUCCION: 'Nubefact (producción)' })
    for (const m of ['SIMULADOR', 'PRUEBA', 'PRODUCCION'] as const) { expect(ETIQUETA_MODO[m].startsWith(NOMBRE_MODO[m])).toBe(true); expect(ETIQUETA_MODO[m]).not.toMatch(/https?:|token/i) }
  })
})
