import { describe, expect, it } from 'vitest'
import {
  diasEsperando, esAdmin, esContabilidadDecisora, esContabilidadQueApruebaLotes, etiquetaEspera,
  fuentesQueMeTocan, meTocaEstaOS, meTocaEstaReposicion,
  ordenarPorAntiguedad, quienDecideCajaChica,
  ESTADOS_QUE_ESPERAN_DECISION, FUENTES_APROBACION,
  type FilaPendiente,
} from '@/domain/pendientes-aprobar'

const mariela = { area: 'contabilidad', rol: 'admin' }      // decide por Contabilidad
const beatriz = { area: 'contabilidad', rol: 'operativo' }  // NO decide (Fase 1.7)
const admin = { area: 'admin', rol: 'admin' }
const vendedor = { area: 'ventas', rol: 'operativo' }

describe('quién decide', () => {
  it('decide TODA el área de Contabilidad, no solo el rol admin (2026-09-19)', () => {
    expect(esContabilidadDecisora(mariela)).toBe(true)
    expect(esContabilidadDecisora(beatriz)).toBe(true)
  })

  it('pero aprobar un LOTE sigue siendo de rol admin: es soltar la plata', () => {
    expect(esContabilidadQueApruebaLotes(mariela)).toBe(true)
    expect(esContabilidadQueApruebaLotes(beatriz)).toBe(false)
    expect(esContabilidadQueApruebaLotes(admin)).toBe(true)
    expect(esContabilidadQueApruebaLotes(null)).toBe(false)
  })

  it('admin decide siempre, y un perfil nulo nunca', () => {
    expect(esAdmin(admin)).toBe(true)
    expect(esContabilidadDecisora(admin)).toBe(true)
    expect(esContabilidadDecisora(null)).toBe(false)
    expect(esAdmin(null)).toBe(false)
  })
})

describe('fuentesQueMeTocan', () => {
  it('Contabilidad ve las suyas —propuestas, planilla e impuestos incluidos— pero NO las OS', () => {
    expect(fuentesQueMeTocan(mariela, []).sort()).toEqual([
      'caja_chica', 'gasto', 'impuesto', 'pago_directo', 'planilla', 'propuesta',
    ])
  })

  it('un lote de pago espera en pendiente_aprobacion, y solo ahí', () => {
    expect(ESTADOS_QUE_ESPERAN_DECISION.propuesta).toEqual(['pendiente_aprobacion'])
  })

  it('un jefe de área que no es Contabilidad NO ve las propuestas', () => {
    expect(fuentesQueMeTocan(vendedor, ['ventas'])).not.toContain('propuesta')
  })

  it('un jefe de área que no es Contabilidad ve solo OS y Caja Chica', () => {
    expect(fuentesQueMeTocan(vendedor, ['ventas']).sort()).toEqual(['caja_chica', 'os'])
  })

  it('quien no decide nada no dispara ninguna consulta', () => {
    expect(fuentesQueMeTocan(vendedor, [])).toEqual([])
    expect(fuentesQueMeTocan(null, [])).toEqual([])
  })

  it('Beatriz ve lo que decide, MENOS las propuestas que no puede firmar', () => {
    const suyas = fuentesQueMeTocan(beatriz, []).sort()
    expect(suyas).toEqual(['caja_chica', 'gasto', 'impuesto', 'pago_directo', 'planilla'])
    // Lo importante del caso: si la bandeja le mostrara lotes, se toparía
    // con una fila sin botón. Mejor no mostrarla.
    expect(suyas).not.toContain('propuesta')
  })

  it('un jefe de área que además es Contabilidad ve las siete', () => {
    expect(fuentesQueMeTocan(mariela, ['contabilidad']).sort()).toEqual([
      'caja_chica', 'gasto', 'impuesto', 'os', 'pago_directo', 'planilla', 'propuesta',
    ])
  })

  it('admin ve las siete aunque no sea jefe de ninguna área', () => {
    expect(fuentesQueMeTocan(admin, []).sort()).toEqual([
      'caja_chica', 'gasto', 'impuesto', 'os', 'pago_directo', 'planilla', 'propuesta',
    ])
  })
})

describe('Planilla e Impuestos en la bandeja (el bug de 2026-09-16)', () => {
  const milagritos = { area: 'tesoreria', rol: 'operativo' }

  it('los dos están declarados como fuente: ese era el bug', () => {
    // Nacieron después de esta pantalla y nunca se agregaron, así que sus
    // cargas esperaban conformidad sin que ninguna bandeja las mostrara.
    expect(FUENTES_APROBACION).toContain('planilla')
    expect(FUENTES_APROBACION).toContain('impuesto')
  })

  it('los dos esperan en pendiente_contabilidad, y solo ahí', () => {
    expect(ESTADOS_QUE_ESPERAN_DECISION.planilla).toEqual(['pendiente_contabilidad'])
    expect(ESTADOS_QUE_ESPERAN_DECISION.impuesto).toEqual(['pendiente_contabilidad'])
  })

  it('Tesorería ve Planilla — su gate es MÁS ANCHO que el de Contabilidad', () => {
    // Es la única fuente que Milagritos ve sin ser jefa de ningún área.
    expect(fuentesQueMeTocan(milagritos, [])).toEqual(['planilla'])
  })

  it('pero Tesorería NO ve Impuestos: esos los confirma Contabilidad', () => {
    expect(fuentesQueMeTocan(milagritos, [])).not.toContain('impuesto')
  })

  it('Beatriz sí ve planilla e impuestos: son decisiones de Contabilidad', () => {
    const suyas = fuentesQueMeTocan(beatriz, [])
    expect(suyas).toContain('planilla')
    expect(suyas).toContain('impuesto')
  })

  it('un vendedor no ve ninguno de los dos', () => {
    const suyas = fuentesQueMeTocan(vendedor, ['ventas'])
    expect(suyas).not.toContain('planilla')
    expect(suyas).not.toContain('impuesto')
  })
})

describe('filtro por fila de Caja Chica', () => {
  it('en pendiente_jefe decide el jefe del área DEL FONDO, no cualquiera', () => {
    expect(meTocaEstaReposicion('pendiente_jefe', 'almacen', vendedor, ['almacen'])).toBe(true)
    expect(meTocaEstaReposicion('pendiente_jefe', 'almacen', vendedor, ['ventas'])).toBe(false)
  })

  it('en pendiente_jefe Contabilidad no decide — todavía no es su turno', () => {
    expect(meTocaEstaReposicion('pendiente_jefe', 'almacen', mariela, [])).toBe(false)
  })

  it('en pendiente_contabilidad decide Contabilidad y ya no el jefe', () => {
    expect(meTocaEstaReposicion('pendiente_contabilidad', 'almacen', mariela, [])).toBe(true)
    expect(meTocaEstaReposicion('pendiente_contabilidad', 'almacen', vendedor, ['almacen'])).toBe(false)
  })

  it('un estado que no espera a nadie no le toca a nadie', () => {
    expect(meTocaEstaReposicion('pagada', 'almacen', admin, [])).toBe(false)
    expect(quienDecideCajaChica('pagada')).toBeNull()
  })

  it('un fondo sin área no se le asigna a un jefe por descarte', () => {
    expect(meTocaEstaReposicion('pendiente_jefe', null, vendedor, ['ventas'])).toBe(false)
  })
})

describe('filtro por fila de OS', () => {
  it('la aprueba el jefe del área solicitante', () => {
    expect(meTocaEstaOS('pendiente_jefe', 'ventas', vendedor, ['ventas'])).toBe(true)
    expect(meTocaEstaOS('pendiente_jefe', 'legal', vendedor, ['ventas'])).toBe(false)
  })

  it('una OS ya aprobada no vuelve a la bandeja', () => {
    expect(meTocaEstaOS('aprobada', 'ventas', vendedor, ['ventas'])).toBe(false)
  })

  it('admin ve todas', () => {
    expect(meTocaEstaOS('pendiente_jefe', 'legal', admin, [])).toBe(true)
  })
})

describe('estados que esperan decisión', () => {
  it('pendiente_factura NO entra: sin factura no hay nada que conformar', () => {
    expect(ESTADOS_QUE_ESPERAN_DECISION.pago_directo).not.toContain('pendiente_factura')
    expect(ESTADOS_QUE_ESPERAN_DECISION.pago_directo).toContain('registrada')
    expect(ESTADOS_QUE_ESPERAN_DECISION.pago_directo).toContain('observada')
  })

  it('el paso vestigial del jefe en Gastos tampoco entra', () => {
    expect(ESTADOS_QUE_ESPERAN_DECISION.gasto).toEqual(['pendiente_contabilidad'])
  })
})

describe('tiempo esperando', () => {
  it('cuenta días enteros', () => {
    expect(diasEsperando('2026-09-01T10:00:00Z', '2026-09-10T10:00:00Z')).toBe(9)
    expect(diasEsperando('2026-09-10T08:00:00Z', '2026-09-10T20:00:00Z')).toBe(0)
  })

  it('nunca es negativo aunque la fecha venga del futuro', () => {
    expect(diasEsperando('2026-09-20T00:00:00Z', '2026-09-10T00:00:00Z')).toBe(0)
  })

  it('una fecha ilegible no rompe la tabla', () => {
    expect(diasEsperando('', '2026-09-10T00:00:00Z')).toBe(0)
  })

  it('la etiqueta usa singular y plural', () => {
    expect(etiquetaEspera(0)).toBe('Hoy')
    expect(etiquetaEspera(1)).toBe('1 día')
    expect(etiquetaEspera(12)).toBe('12 días')
  })
})

describe('orden', () => {
  it('lo que más tiempo lleva esperando va primero', () => {
    const fila = (codigo: string, esperandoDesde: string): FilaPendiente => ({
      id: codigo, tipo: 'os', estado: 'pendiente_jefe', codigo, quienLoCreo: null, esperandoDesde,
      diasEsperando: 0, monto: 1, moneda: 'PEN', totalPorMoneda: [{ moneda: 'PEN', monto: 1 }],
      quienDecide: 'x', fechaRequerida: null, concepto: null, href: '/',
    })
    const orden = ordenarPorAntiguedad([
      fila('nueva', '2026-09-09T00:00:00Z'),
      fila('vieja', '2026-08-01T00:00:00Z'),
      fila('media', '2026-09-01T00:00:00Z'),
    ]).map((f) => f.codigo)
    expect(orden).toEqual(['vieja', 'media', 'nueva'])
  })
})
