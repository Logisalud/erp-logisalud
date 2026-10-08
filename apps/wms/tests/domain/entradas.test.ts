import { describe, expect, it } from 'vitest'
import { parsearVencimiento } from '@/domain/fechas'
import {
  CHECKLIST_ORGANOLEPTICO, faltantesParaEnviar, itemsPendientes, mensajesDeCuadre, muestraOrganoleptica, numeroDeActa,
  pasoDeIngreso, porTrasladarVencido, progresoLinea, puedeAtenderAlerta, puedeFirmarComo, puedeGenerarActa, rucValido,
  sugerirConclusion, temperaturaFueraDeRango, textoProgreso, validarDecision, validarEntradaIngreso, validarEntradaLote,
  validarTransportista, situacionLote, diasParaVencer, type Checklist,
} from '@/domain/entradas'

const logissa = { esDuenoAlmacen: true }
const cliente = { esDuenoAlmacen: false }

describe('lotes y cuadre', () => {
  it('(1) compra 6; lotes 4 + 2 cuadra', () => {
    const p = progresoLinea(6, [{ cantidad: 4 }, { cantidad: 2 }])
    expect(p).toMatchObject({ registrado: 6, faltan: 0, estado: 'CUADRA' })
    expect(mensajesDeCuadre([{ id: 'l', descripcion: 'Dapagliflozina', cantidadReferencia: 6 }],
      [{ lineaId: 'l', codigo: 'A', cantidad: 4 }, { lineaId: 'l', codigo: 'B', cantidad: 2 }])).toEqual([])
  })

  it('(2) compra 6; lotes 4 + 3 no cuadra y el mensaje es humano', () => {
    const [m] = mensajesDeCuadre([{ id: 'l', descripcion: 'Dapagliflozina', cantidadReferencia: 6 }],
      [{ lineaId: 'l', codigo: 'A', cantidad: 4 }, { lineaId: 'l', codigo: 'B', cantidad: 3 }])
    expect(m).toBe('Los lotes de Dapagliflozina suman 7 y la referencia es 6: sobran 1; ajusta los lotes para que coincidan.')
  })

  it('el progreso se muestra como "4 de 6"', () => {
    const p = progresoLinea(6, [{ cantidad: 4 }])
    expect(textoProgreso(p)).toBe('4 de 6')
    expect(p).toMatchObject({ faltan: 2, estado: 'FALTAN' })
    expect(progresoLinea(6, []).estado).toBe('VACIA')
    expect(progresoLinea(6, [{ cantidad: 9 }]).estado).toBe('SOBRAN')
  })

  it('vencimiento: fecha completa; solo mes y año → último día del mes', () => {
    const v = (e: Partial<Parameters<typeof validarEntradaLote>[0]>) =>
      validarEntradaLote({ codigo: 'L1', cantidad: 4, vence: '30/06/2028', posicionId: 'p', ...e }, parsearVencimiento)
    expect(v({})).toMatchObject({ ok: true, vence: '2028-06-30', cantidad: 4 })
    expect(v({ vence: '02/2028' })).toMatchObject({ ok: true, vence: '2028-02-29', venceTexto: '02/2028' })
    expect(v({ vence: 'pronto' })).toMatchObject({ ok: false, errores: { vence: expect.stringMatching(/No entiendo/) } })
    expect(v({ cantidad: 0 })).toMatchObject({ ok: false, errores: { cantidad: expect.any(String) } })
    expect(v({ cantidad: '2,5' })).toMatchObject({ ok: false })
    expect(v({ codigo: ' ' })).toMatchObject({ ok: false, errores: { codigo: expect.any(String) } })
    expect(v({ posicionId: '' })).toMatchObject({ ok: false })
  })
})

describe('validación de un ingreso nuevo', () => {
  const lineas = [{ productoId: 'p1', cantidadReferencia: 10 }]
  it('(3) devolución sin factura o boleta de referencia no se registra', () => {
    const r = validarEntradaIngreso({ tipo: 'DEVOLUCION', propietarioId: 'x', guiaNumero: 'G-1', lineas }, cliente)
    expect(r).toMatchObject({ ok: false, errores: { docOriginal: expect.stringMatching(/factura o boleta original/) } })
    expect(validarEntradaIngreso({ tipo: 'DEVOLUCION', propietarioId: 'x', docOriginalTipo: 'BOLETA', docOriginalNumero: 'B001-9', lineas }, cliente)).toEqual({ ok: true })
  })

  it('(4) ingreso de cliente: guía obligatoria y a nombre del cliente', () => {
    expect(validarEntradaIngreso({ tipo: 'INGRESO_CLIENTE', propietarioId: 'x', lineas }, cliente))
      .toMatchObject({ ok: false, errores: { guiaNumero: expect.any(String) } })
    expect(validarEntradaIngreso({ tipo: 'INGRESO_CLIENTE', propietarioId: 'x', guiaNumero: 'G-9', lineas }, logissa))
      .toMatchObject({ ok: false, errores: { propietarioId: expect.stringMatching(/a nombre del cliente/) } })
    expect(validarEntradaIngreso({ tipo: 'INGRESO_CLIENTE', propietarioId: 'x', guiaNumero: 'G-9', lineas }, cliente)).toEqual({ ok: true })
  })

  it('compra local: recepción de Compras y propietario Logissa', () => {
    expect(validarEntradaIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: 'x' }, logissa)).toMatchObject({ ok: false, errores: { compraRecepcionId: expect.any(String) } })
    expect(validarEntradaIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', compraRecepcionId: 'r' }, cliente)).toMatchObject({ ok: false, errores: { propietarioId: expect.any(String) } })
    expect(validarEntradaIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', compraRecepcionId: 'r' }, logissa)).toEqual({ ok: true })
  })

  it('líneas: no vacías, enteras y sin repetir producto', () => {
    const e = (l: { productoId: string; cantidadReferencia: number | string }[]) =>
      validarEntradaIngreso({ tipo: 'DEVOLUCION', propietarioId: 'x', docOriginalTipo: 'FACTURA', docOriginalNumero: 'F-1', lineas: l }, cliente)
    expect(e([])).toMatchObject({ ok: false })
    expect(e([{ productoId: 'a', cantidadReferencia: 1.5 }])).toMatchObject({ ok: false })
    expect(e([{ productoId: 'a', cantidadReferencia: 1 }, { productoId: 'a', cantidadReferencia: 2 }])).toMatchObject({ ok: false })
  })

  it('el RUC es siempre texto de 11 dígitos', () => {
    expect(rucValido('20546207219')).toBe(true)
    expect(rucValido('2054620721')).toBe(false)
    expect(rucValido('2.05E+10')).toBe(false)
    expect(validarEntradaIngreso({ tipo: 'COMPRA_LOCAL', propietarioId: 'x', compraRecepcionId: 'r', contraparteRuc: '123' }, logissa)).toMatchObject({ ok: false })
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

describe('paso de un ingreso', () => {
  const base = { confirmado: false, cuadra: true, tieneTemperatura: true }
  it('avanza: lotes → acta → firmas → confirmar → en Cuarentena', () => {
    expect(pasoDeIngreso({ ...base })).toBe('DATOS_Y_LOTES')
    expect(pasoDeIngreso({ ...base, acta: { estado: 'ANULADA', firmas: 4 } })).toBe('DATOS_Y_LOTES')
    expect(pasoDeIngreso({ ...base, acta: { estado: 'BORRADOR', firmas: 2 } })).toBe('FIRMAS')
    expect(pasoDeIngreso({ ...base, acta: { estado: 'FIRMADA', firmas: 4 } })).toBe('CONFIRMAR')
    expect(pasoDeIngreso({ ...base, confirmado: true, acta: { estado: 'FIRMADA', firmas: 4 } })).toBe('CONFIRMADO')
  })
  it('no se genera el acta si algo falta (con la razón)', () => {
    expect(puedeGenerarActa({ cuadra: true, tieneTemperatura: true, tipo: 'COMPRA_LOCAL', tieneDocOriginal: false })).toBeNull()
    expect(puedeGenerarActa({ cuadra: false, tieneTemperatura: true, tipo: 'COMPRA_LOCAL', tieneDocOriginal: false })).toMatch(/sumar/)
    expect(puedeGenerarActa({ cuadra: true, tieneTemperatura: false, tipo: 'COMPRA_LOCAL', tieneDocOriginal: false })).toMatch(/temperatura/)
    expect(puedeGenerarActa({ cuadra: true, tieneTemperatura: true, tipo: 'DEVOLUCION', tieneDocOriginal: false })).toMatch(/factura o boleta/)
  })
})

describe('alertas', () => {
  it('quién atiende: el destinatario o Dirección Técnica', () => {
    expect(puedeAtenderAlerta(['direccion_tecnica'], 'TEMPERATURA')).toBe(true)
    expect(puedeAtenderAlerta(['jefe_almacen'], 'TEMPERATURA')).toBe(false)
    expect(puedeAtenderAlerta(['jefe_almacen'], 'POR_TRASLADAR_VENCIDO')).toBe(true)
    expect(puedeAtenderAlerta(['auxiliar'], 'DIVERGENCIA_COMPRAS')).toBe(false)
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
