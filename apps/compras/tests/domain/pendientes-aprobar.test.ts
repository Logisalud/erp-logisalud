import { describe, expect, it } from 'vitest'
import {
  diasEsperando, esAdmin, esContabilidadDecisora, etiquetaEspera,
  fuentesQueMeTocan, meTocaEstaOS, meTocaEstaReposicion,
  ordenarPorAntiguedad, quienDecideCajaChica,
  ESTADOS_QUE_ESPERAN_DECISION,
  type FilaPendiente,
} from '@/domain/pendientes-aprobar'

const mariela = { area: 'contabilidad', rol: 'admin' }      // decide por Contabilidad
const beatriz = { area: 'contabilidad', rol: 'operativo' }  // NO decide (Fase 1.7)
const admin = { area: 'admin', rol: 'admin' }
const vendedor = { area: 'ventas', rol: 'operativo' }

describe('quién decide', () => {
  it('Contabilidad decide solo con rol admin', () => {
    expect(esContabilidadDecisora(mariela)).toBe(true)
    expect(esContabilidadDecisora(beatriz)).toBe(false)
  })

  it('admin decide siempre, y un perfil nulo nunca', () => {
    expect(esAdmin(admin)).toBe(true)
    expect(esContabilidadDecisora(admin)).toBe(true)
    expect(esContabilidadDecisora(null)).toBe(false)
    expect(esAdmin(null)).toBe(false)
  })
})

describe('fuentesQueMeTocan', () => {
  it('Contabilidad ve las tres suyas, pero NO las OS (las aprueba el área usuaria)', () => {
    expect(fuentesQueMeTocan(mariela, []).sort()).toEqual(['caja_chica', 'gasto', 'pago_directo'])
  })

  it('un jefe de área que no es Contabilidad ve solo OS y Caja Chica', () => {
    expect(fuentesQueMeTocan(vendedor, ['ventas']).sort()).toEqual(['caja_chica', 'os'])
  })

  it('quien no decide nada no dispara ninguna consulta', () => {
    expect(fuentesQueMeTocan(beatriz, [])).toEqual([])
    expect(fuentesQueMeTocan(vendedor, [])).toEqual([])
    expect(fuentesQueMeTocan(null, [])).toEqual([])
  })

  it('un jefe de área que además es Contabilidad ve las cuatro', () => {
    expect(fuentesQueMeTocan(mariela, ['contabilidad']).sort()).toEqual([
      'caja_chica', 'gasto', 'os', 'pago_directo',
    ])
  })

  it('admin ve las cuatro aunque no sea jefe de ninguna área', () => {
    expect(fuentesQueMeTocan(admin, []).sort()).toEqual(['caja_chica', 'gasto', 'os', 'pago_directo'])
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
      id: codigo, tipo: 'os', codigo, quienLoCreo: null, esperandoDesde,
      diasEsperando: 0, monto: 1, moneda: 'PEN', quienDecide: 'x', fechaRequerida: null, href: '/',
    })
    const orden = ordenarPorAntiguedad([
      fila('nueva', '2026-09-09T00:00:00Z'),
      fila('vieja', '2026-08-01T00:00:00Z'),
      fila('media', '2026-09-01T00:00:00Z'),
    ]).map((f) => f.codigo)
    expect(orden).toEqual(['vieja', 'media', 'nueva'])
  })
})
