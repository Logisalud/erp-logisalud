import { describe, expect, it } from 'vitest'
import { parsearVencimiento } from '@/domain/fechas'
import {
  AREA_DESTINO, CHECKLIST_ORGANOLEPTICO, ESTADO_INICIAL, estadoRegistroCompras, faltantesParaEnviar, itemsPendientes, muestraOrganoleptica,
  numeroDeActa, pasoDeSolicitud, porTrasladarVencido, puedeAtenderAlerta, puedeFirmarComo, puedeGenerarActa, puedePrepararSolicitud, rucValido,
  sugerirConclusion, temperaturaFueraDeRango, textoDiferencia, validarDecision, validarEntradaSolicitud, validarLineaSolicitud,
  validarTransportista, situacionLote, diasParaVencer, DESTINATARIO_ALERTA, type Checklist,
} from '@/domain/entradas'

const logissa = { esDuenoAlmacen: true }
const cliente = { esDuenoAlmacen: false }
const linea = { lote: 'L1', vence: '30/06/2028', cantidad: 4 }

describe('líneas de la solicitud', () => {
  it('vencimiento: fecha completa; solo mes y año → último día del mes', () => {
    const v = (e: Partial<Parameters<typeof validarLineaSolicitud>[0]>) =>
      validarLineaSolicitud({ productoId: 'p', ...linea, ...e }, 'DEVOLUCION', parsearVencimiento)
    expect(v({})).toMatchObject({ ok: true, vence: '2028-06-30', cantidad: 4 })
    expect(v({ vence: '02/2028' })).toMatchObject({ ok: true, vence: '2028-02-29', venceTexto: '02/2028' })
    expect(v({ vence: 'pronto' })).toMatchObject({ ok: false, errores: { vence: expect.stringMatching(/No entiendo/) } })
    expect(v({ cantidad: 0 })).toMatchObject({ ok: false, errores: { cantidad: expect.any(String) } })
    expect(v({ cantidad: '2,5' })).toMatchObject({ ok: false })
    expect(v({ lote: ' ' })).toMatchObject({ ok: false, errores: { lote: expect.any(String) } })
  })

  it('una compra se arma desde la línea de la OC; lo demás, desde el producto', () => {
    expect(validarLineaSolicitud({ ...linea }, 'COMPRA_LOCAL', parsearVencimiento)).toMatchObject({ ok: false, errores: { producto: expect.any(String) } })
    expect(validarLineaSolicitud({ ...linea, ocItemId: 'oi' }, 'COMPRA_LOCAL', parsearVencimiento)).toMatchObject({ ok: true })
    expect(validarLineaSolicitud({ ...linea }, 'INGRESO_CLIENTE', parsearVencimiento)).toMatchObject({ ok: false })
  })
})

describe('validación de una solicitud nueva', () => {
  const lineas = [{ productoId: 'p1', ...linea }]
  it('(3) devolución sin factura o boleta de referencia no se registra', () => {
    const r = validarEntradaSolicitud({ tipo: 'DEVOLUCION', propietarioId: 'x', guiaNumero: 'G-1', lineas }, cliente)
    expect(r).toMatchObject({ ok: false, errores: { docOriginal: expect.stringMatching(/factura o boleta original/) } })
    expect(validarEntradaSolicitud({ tipo: 'DEVOLUCION', propietarioId: 'x', docOriginalTipo: 'BOLETA', docOriginalNumero: 'B001-9', lineas }, cliente)).toEqual({ ok: true })
  })

  it('(4) ingreso de cliente: guía obligatoria y a nombre del cliente', () => {
    expect(validarEntradaSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: 'x', lineas }, cliente))
      .toMatchObject({ ok: false, errores: { guiaNumero: expect.any(String) } })
    expect(validarEntradaSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: 'x', guiaNumero: 'G-9', lineas }, logissa))
      .toMatchObject({ ok: false, errores: { propietarioId: expect.stringMatching(/a nombre del cliente/) } })
    expect(validarEntradaSolicitud({ tipo: 'INGRESO_CLIENTE', propietarioId: 'x', guiaNumero: 'G-9', lineas }, cliente)).toEqual({ ok: true })
  })

  it('compra local: orden de compra y propietario Logissa', () => {
    expect(validarEntradaSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', lineas }, logissa)).toMatchObject({ ok: false, errores: { ocId: expect.any(String) } })
    expect(validarEntradaSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', ocId: 'oc', lineas }, cliente)).toMatchObject({ ok: false, errores: { propietarioId: expect.any(String) } })
    expect(validarEntradaSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', ocId: 'oc', lineas }, logissa)).toEqual({ ok: true })
  })

  it('sin líneas no hay solicitud', () => {
    expect(validarEntradaSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', ocId: 'oc', lineas: [] }, logissa)).toMatchObject({ ok: false, errores: { lineas: expect.any(String) } })
  })

  it('el RUC es siempre texto de 11 dígitos', () => {
    expect(rucValido('20546207219')).toBe(true)
    expect(rucValido('2054620721')).toBe(false)
    expect(rucValido('2.05E+10')).toBe(false)
    expect(validarEntradaSolicitud({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', ocId: 'r', contraparteRuc: '123', lineas }, logissa)).toMatchObject({ ok: false })
  })

  it('(D-32) solo Sandra y Katia preparan solicitudes', () => {
    expect(puedePrepararSolicitud(['asistente_dt'])).toBe(true)
    expect(puedePrepararSolicitud(['direccion_tecnica'])).toBe(true)
    expect(puedePrepararSolicitud(['jefe_almacen'])).toBe(false)
    expect(puedePrepararSolicitud(['auxiliar'])).toBe(false)
  })
})

describe('dónde nace el inventario (D-31)', () => {
  it('la devolución nace en Devoluciones, nunca en Cuarentena; compras y clientes, en Cuarentena', () => {
    expect(ESTADO_INICIAL).toEqual({ COMPRA_LOCAL: 'CUARENTENA', INGRESO_CLIENTE: 'CUARENTENA', DEVOLUCION: 'DEVOLUCIONES' })
    expect(AREA_DESTINO.DEVOLUCION).toBe('DEVOLUCIONES')
    expect(AREA_DESTINO.COMPRA_LOCAL).toBe('CUARENTENA')
  })
})

describe('cantidades y conciliación con Compras', () => {
  it('el texto de una diferencia dice qué cambia y que queda registrado', () => {
    expect(textoDiferencia(50, 45)).toBe('Actualizaremos la Solicitud de 50 → 45. El cambio quedará registrado.')
  })
  it('lo registrado en Compras: OK, falta o no coincide', () => {
    // Compras mostraba 0; llegaron 45 físicamente.
    expect(estadoRegistroCompras(0, 45, 45)).toBe('OK')
    expect(estadoRegistroCompras(0, 45, 0)).toBe('FALTA')
    expect(estadoRegistroCompras(0, 45, 50)).toBe('NO_COINCIDE')
    // Una segunda entrega de la misma línea: lo esperado suma las dos.
    expect(estadoRegistroCompras(0, 10, 6)).toBe('NO_COINCIDE')
    expect(estadoRegistroCompras(20, 10, 30)).toBe('OK')
    expect(estadoRegistroCompras(20, 10, 20)).toBe('FALTA')
  })
})

describe('temperatura', () => {
  it('15–25 °C es el rango; fuera se alerta, pero se recibe', () => {
    expect([14.9, 15, 20, 25, 25.1].map((t) => temperaturaFueraDeRango(t))).toEqual([true, false, false, false, true])
    expect(temperaturaFueraDeRango(null)).toBe(false)
    expect(temperaturaFueraDeRango(30, 15, 32)).toBe(false)
  })
})

describe('firmas del Acta de Recepción', () => {
  it('cada parte firma con su rol', () => {
    expect(puedeFirmarComo(['jefe_almacen'], 'JEFE_ALMACEN')).toBe(true)
    expect(puedeFirmarComo(['reemplazo_jefe'], 'JEFE_ALMACEN')).toBe(true)
    expect(puedeFirmarComo(['auxiliar'], 'JEFE_ALMACEN')).toBe(false)
    expect(puedeFirmarComo(['direccion_tecnica'], 'DIRECCION_TECNICA')).toBe(true)
    expect(puedeFirmarComo(['jefe_almacen'], 'DIRECCION_TECNICA')).toBe(false)
    expect(puedeFirmarComo(['auxiliar'], 'RESPONSABLE_CONTEO')).toBe(true)
    expect(puedeFirmarComo(['auditoria_lectura'], 'TRANSPORTISTA')).toBe(false)
  })

  it('el transportista: nombre, DNI de 8 dígitos, placa y firma dibujada', () => {
    const ok = { nombre: 'Pedro Quispe', dni: '45678912', placa: 'ABC-123', imagen: 'data:image/png;base64,' + 'A'.repeat(200) }
    expect(validarTransportista(ok)).toEqual({ ok: true })
    expect(validarTransportista({ ...ok, dni: '1234' })).toMatchObject({ ok: false, errores: { dni: expect.any(String) } })
    expect(validarTransportista({ ...ok, placa: '' })).toMatchObject({ ok: false })
    expect(validarTransportista({ ...ok, imagen: '' })).toMatchObject({ ok: false, errores: { imagen: expect.any(String) } })
    expect(validarTransportista({ ...ok, nombre: ' ' })).toMatchObject({ ok: false })
  })
})

describe('numeración', () => {
  it('I-AAAAMM-correlativo y O-AAAAMM-correlativo', () => {
    expect(numeroDeActa('I', '2026-10-08T12:00:00Z', 7)).toBe('I-202610-0007')
    expect(numeroDeActa('O', new Date(Date.UTC(2027, 0, 3)), 1234)).toBe('O-202701-1234')
  })
})

describe('muestra organoléptica', () => {
  it('(6) techo(√unidades) + 1', () => {
    expect([1, 4, 5, 9, 10, 100, 101, 480].map((n) => muestraOrganoleptica(n))).toEqual([2, 3, 4, 4, 5, 11, 12, 23])
    expect(muestraOrganoleptica(0)).toBe(1)
    expect(muestraOrganoleptica(100, 2)).toBe(12)
  })
})

describe('checklist organoléptico', () => {
  const marcarTodo = (r: 'C' | 'NC' | 'NA', excepto: string[] = []): Checklist => {
    const c: Checklist = {}
    for (const g of CHECKLIST_ORGANOLEPTICO) if (!g.opcional || g.id === 'plastico') for (const i of g.items) c[i.id] = excepto.includes(i.id) ? 'NC' : r
    return c
  }

  it('completo cuando todo lo obligatorio está respondido y hay un material', () => {
    expect(itemsPendientes({})).toContain('material')
    expect(itemsPendientes(marcarTodo('C'))).toEqual([])
    const sinMaterial = marcarTodo('C')
    for (const i of CHECKLIST_ORGANOLEPTICO.find((g) => g.id === 'plastico')!.items) delete sinMaterial[i.id]
    expect(itemsPendientes(sinMaterial)).toEqual(['material'])
  })

  it('un grupo de material a medias exige terminarlo', () => {
    const c = marcarTodo('C')
    delete c.pla_cierre
    expect(itemsPendientes(c)).toEqual(['pla_cierre'])
  })

  it('un solo "no conforme" sugiere NO CONFORME', () => {
    expect(sugerirConclusion(marcarTodo('C'))).toBe('CONFORME')
    expect(sugerirConclusion(marcarTodo('C', ['emb_limpio']))).toBe('NO_CONFORME')
    expect(sugerirConclusion(marcarTodo('NA'))).toBe('CONFORME')
  })

  it('lo que falta para enviar a Dirección Técnica se dice claro', () => {
    const f = faltantesParaEnviar({ certAnalisis: null, checklist: {}, destinoSugerido: null, conclusion: null })
    expect(f).toHaveLength(5)
    expect(f.join(' ')).toMatch(/certificado[\s\S]*material[\s\S]*puntos[\s\S]*destino[\s\S]*conclusión/)
    expect(faltantesParaEnviar({ certAnalisis: true, checklist: marcarTodo('C'), destinoSugerido: 'APROBADO', conclusion: 'CONFORME' })).toEqual([])
  })
})

describe('decisión de Dirección Técnica', () => {
  it('(7) con el registro sanitario vencido no se aprueba; sí se puede rechazar', () => {
    const r = validarDecision('APROBADO', 'CONFORME', '2026-09-01', '2026-10-08')
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/registro sanitario está vencido/) })
    expect(validarDecision('BAJAS_RECHAZADOS', 'CONFORME', '2026-09-01', '2026-10-08')).toEqual({ ok: true })
    expect(validarDecision('APROBADO', 'CONFORME', '2026-10-08', '2026-10-08')).toEqual({ ok: true })
  })
  it('no se aprueba lo no conforme', () => {
    expect(validarDecision('APROBADO', 'NO_CONFORME', undefined, '2026-10-08')).toMatchObject({ ok: false })
  })
})

describe('paso de una solicitud', () => {
  it('avanza: por autorizar → por llegar → verificando → acta → firmas → confirmar → cerrada', () => {
    expect(pasoDeSolicitud({ estado: 'BORRADOR', lineasPendientes: 2 })).toBe('POR_AUTORIZAR')
    expect(pasoDeSolicitud({ estado: 'PROGRAMADA', lineasPendientes: 2 })).toBe('POR_LLEGAR')
    expect(pasoDeSolicitud({ estado: 'EN_RECEPCION', lineasPendientes: 1 })).toBe('VERIFICANDO')
    expect(pasoDeSolicitud({ estado: 'EN_RECEPCION', lineasPendientes: 0 })).toBe('ACTA')
    expect(pasoDeSolicitud({ estado: 'EN_RECEPCION', lineasPendientes: 0, acta: { estado: 'ANULADA', firmas: 4 } })).toBe('ACTA')
    expect(pasoDeSolicitud({ estado: 'EN_RECEPCION', lineasPendientes: 0, acta: { estado: 'BORRADOR', firmas: 2 } })).toBe('FIRMAS')
    expect(pasoDeSolicitud({ estado: 'EN_RECEPCION', lineasPendientes: 0, acta: { estado: 'FIRMADA', firmas: 4 } })).toBe('CONFIRMAR')
    expect(pasoDeSolicitud({ estado: 'CERRADA', lineasPendientes: 0 })).toBe('CERRADA')
    expect(pasoDeSolicitud({ estado: 'ANULADA', lineasPendientes: 0 })).toBe('ANULADA')
  })
  it('no se genera el acta si algo falta (con la razón)', () => {
    const l = (verificacion: 'PENDIENTE' | 'COINCIDE' | 'AJUSTADA' | null, tienePosicion = true) => ({ descripcion: 'Dapagliflozina', lote: 'L1', verificacion, tienePosicion })
    const ok = { tipo: 'COMPRA_LOCAL' as const, tieneDocOriginal: false, tieneTemperatura: true, lineas: [l('COINCIDE')] }
    expect(puedeGenerarActa(ok)).toBeNull()
    expect(puedeGenerarActa({ ...ok, lineas: [l('AJUSTADA')] })).toBeNull()
    expect(puedeGenerarActa({ ...ok, lineas: [l('PENDIENTE')] })).toMatch(/Falta verificar Dapagliflozina \(lote L1\)/)
    expect(puedeGenerarActa({ ...ok, lineas: [l('COINCIDE', false)] })).toMatch(/Elige dónde se deja/)
    expect(puedeGenerarActa({ ...ok, tieneTemperatura: false })).toMatch(/temperatura/)
    expect(puedeGenerarActa({ ...ok, tipo: 'DEVOLUCION' })).toMatch(/factura o boleta/)
    expect(puedeGenerarActa({ ...ok, lineas: [] })).toMatch(/nada que recibir/)
  })
})

describe('alertas', () => {
  it('quién atiende: el destinatario o Dirección Técnica', () => {
    expect(puedeAtenderAlerta(['direccion_tecnica'], DESTINATARIO_ALERTA.TEMPERATURA)).toBe(true)
    expect(puedeAtenderAlerta(['jefe_almacen'], DESTINATARIO_ALERTA.TEMPERATURA)).toBe(false)
    expect(puedeAtenderAlerta(['jefe_almacen'], DESTINATARIO_ALERTA.POR_TRASLADAR_VENCIDO)).toBe(true)
    expect(puedeAtenderAlerta(['auxiliar'], DESTINATARIO_ALERTA.POR_REGISTRAR_EN_COMPRAS)).toBe(false)
    expect(puedeAtenderAlerta(['asistente_dt'], DESTINATARIO_ALERTA.SOLICITUD_AJUSTADA)).toBe(true)
  })
  it('(D-33, D-34) a quién llega cada aviso nuevo', () => {
    expect(DESTINATARIO_ALERTA).toMatchObject({ SOLICITUD_AJUSTADA: 'asistente_dt', EXCEDE_OC: 'direccion_tecnica', POR_REGISTRAR_EN_COMPRAS: 'jefe_almacen', NO_COINCIDE_CON_COMPRAS: 'jefe_almacen' })
  })
  it('(D-28) "por trasladar" vence pasado el plazo configurable (24 h por defecto)', () => {
    const desde = '2026-10-07T10:00:00Z'
    expect(porTrasladarVencido(desde, '2026-10-08T09:59:00Z')).toBe(false)
    expect(porTrasladarVencido(desde, '2026-10-08T10:01:00Z')).toBe(true)
    expect(porTrasladarVencido(desde, '2026-10-07T13:00:00Z', 2)).toBe(true)
  })
})

describe('vencimiento de lotes (D-30)', () => {
  it('vencido solo cuando su fecha ya pasó; por vencer dentro del umbral (90 días por defecto)', () => {
    const hoy = '2026-10-08'
    expect(situacionLote('2026-10-07', hoy)).toBe('VENCIDO')
    expect(situacionLote('2026-10-08', hoy)).toBe('POR_VENCER')
    expect(situacionLote('2027-01-06', hoy)).toBe('POR_VENCER')
    expect(situacionLote('2027-01-07', hoy)).toBe('VIGENTE')
    expect(situacionLote(undefined, hoy)).toBe('SIN_FECHA')
    expect(situacionLote('2027-01-07', hoy, 120)).toBe('POR_VENCER')
    expect(diasParaVencer('2026-10-18', hoy)).toBe(10)
    expect(diasParaVencer('2026-10-03', hoy)).toBe(-5)
  })
})
