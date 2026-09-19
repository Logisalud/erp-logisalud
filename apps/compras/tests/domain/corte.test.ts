import { describe, expect, it } from 'vitest'
import {
  admiteCorte, avisoMotivoSinRastro, CORTE_POR_TIPO, esAccionCorte, filasDeSeccion,
  guardaElMotivo, seccionDe, validarMotivo,
} from '@/domain/corte'
import { ETIQUETA_TIPO_PENDIENTE, type TipoPendiente } from '@/domain/pendientes-aprobar'

const fila = (tipo: TipoPendiente, codigo = 'C-0001') => ({ tipo, codigo })

describe('esAccionCorte', () => {
  it('solo acepta las dos acciones reales', () => {
    expect(esAccionCorte('rechazar')).toBe(true)
    expect(esAccionCorte('anular')).toBe(true)
    expect(esAccionCorte('aprobar')).toBe(false)
    expect(esAccionCorte('borrar')).toBe(false)
    expect(esAccionCorte(null)).toBe(false)
    expect(esAccionCorte('')).toBe(false)
  })
})

describe('CORTE_POR_TIPO', () => {
  it('cubre TODOS los tipos de la bandeja: un tipo nuevo no puede olvidarse', () => {
    const tipos = Object.keys(ETIQUETA_TIPO_PENDIENTE) as TipoPendiente[]
    for (const tipo of tipos) {
      expect(CORTE_POR_TIPO[tipo], `falta ${tipo}`).toBeDefined()
      expect(CORTE_POR_TIPO[tipo].rechazar).toBeDefined()
      expect(CORTE_POR_TIPO[tipo].anular).toBeDefined()
    }
  })

  it('un tipo que no admite la acción tampoco puede decir que guarda el motivo', () => {
    const tipos = Object.keys(ETIQUETA_TIPO_PENDIENTE) as TipoPendiente[]
    for (const tipo of tipos) {
      for (const accion of ['rechazar', 'anular'] as const) {
        if (!admiteCorte(tipo, accion)) expect(guardaElMotivo(tipo, accion)).toBe(false)
      }
    }
  })

  it('refleja lo que las funciones de servicio aceptan hoy, no lo deseable', () => {
    // Con motivo: rechazarPagoDirecto(id, motivo), rechazarPorContabilidad(id, motivo).
    expect(guardaElMotivo('pago_directo', 'rechazar')).toBe(true)
    expect(guardaElMotivo('anticipo', 'anular')).toBe(true)
    // Sin motivo: rechazarOS(id), rechazarPropuesta(id), las dos de caja chica.
    expect(guardaElMotivo('os', 'rechazar')).toBe(false)
    expect(guardaElMotivo('propuesta', 'rechazar')).toBe(false)
    expect(guardaElMotivo('caja_chica', 'rechazar')).toBe(false)
  })

  it('los tres huecos de cobertura quedaron tapados (migración 0069)', () => {
    // Un impuesto confirmado no tenía NINGUNA vuelta atrás: era el peor.
    expect(admiteCorte('impuesto', 'rechazar')).toBe(true)
    expect(admiteCorte('impuesto', 'anular')).toBe(true)
    // Caja Chica se rechazaba pero no se anulaba.
    expect(admiteCorte('caja_chica', 'anular')).toBe(true)
    // Planilla se anulaba pero no se rechazaba.
    expect(admiteCorte('planilla', 'rechazar')).toBe(true)
    // Y los cuatro guardan su motivo: nacieron con la columna.
    expect(guardaElMotivo('impuesto', 'rechazar')).toBe(true)
    expect(guardaElMotivo('impuesto', 'anular')).toBe(true)
    expect(guardaElMotivo('caja_chica', 'anular')).toBe(true)
    expect(guardaElMotivo('planilla', 'rechazar')).toBe(true)
  })

  it('un LOTE no se anula: antes se descarta, después se rechaza', () => {
    expect(admiteCorte('propuesta', 'rechazar')).toBe(true)
    expect(admiteCorte('propuesta', 'anular')).toBe(false)
  })
})

describe('validarMotivo', () => {
  it('vacío no pasa, y el mensaje nombra la acción', () => {
    expect(validarMotivo('', 'anular')).toMatch(/anulación/)
    expect(validarMotivo('   ', 'rechazar')).toMatch(/rechazo/)
  })

  it('un motivo de relleno tampoco pasa: viaja por correo a quien lo registró', () => {
    expect(validarMotivo('ok', 'rechazar')).toMatch(/demasiado corto/)
    expect(validarMotivo('.', 'rechazar')).toMatch(/demasiado corto/)
  })

  it('un motivo real pasa', () => {
    expect(validarMotivo('Factura ilegible', 'rechazar')).toBeNull()
  })

  it('los espacios no cuentan como motivo', () => {
    expect(validarMotivo('        ', 'anular')).not.toBeNull()
  })
})

describe('avisoMotivoSinRastro', () => {
  it('avisa justo en los tipos cuya función individual no recibe motivo', () => {
    expect(avisoMotivoSinRastro('os', 'rechazar')).toMatch(/no queda guardado/)
    expect(avisoMotivoSinRastro('propuesta', 'rechazar')).toMatch(/no queda guardado/)
    expect(avisoMotivoSinRastro('caja_chica', 'rechazar')).toMatch(/no queda guardado/)
  })

  it('no avisa donde el motivo SÍ se guarda', () => {
    expect(avisoMotivoSinRastro('pago_directo', 'rechazar')).toBeNull()
    expect(avisoMotivoSinRastro('anticipo', 'anular')).toBeNull()
  })

  it('tampoco avisa donde la acción ni siquiera existe: eso se dice de otra forma', () => {
    expect(avisoMotivoSinRastro('propuesta', 'anular')).toBeNull()
  })
})

describe('las dos secciones de la bandeja', () => {
  it('las propuestas van solas a "Lotes de pago"; todo lo demás es un documento', () => {
    expect(seccionDe('propuesta')).toBe('lote')
    for (const tipo of Object.keys(ETIQUETA_TIPO_PENDIENTE) as TipoPendiente[]) {
      if (tipo !== 'propuesta') expect(seccionDe(tipo), tipo).toBe('documento')
    }
  })

  it('un Gasto (anticipo/reembolso) es un documento como cualquier otro', () => {
    // Se testea explícito porque es el que más se discutió: ocurre sobre la
    // SOLICITUD, antes de que exista la obligación, pero es el mismo paso B.
    expect(seccionDe('anticipo')).toBe('documento')
    expect(seccionDe('reembolso')).toBe('documento')
  })

  it('filasDeSeccion parte la bandeja sin perder ni duplicar ninguna fila', () => {
    const filas = [
      fila('pago_directo', 'C-1'), fila('propuesta', 'PP-1'),
      fila('caja_chica', 'R-1'), fila('propuesta', 'PP-2'),
    ]
    const documentos = filasDeSeccion(filas, 'documento')
    const lotes = filasDeSeccion(filas, 'lote')
    expect(documentos.map((f) => f.codigo)).toEqual(['C-1', 'R-1'])
    expect(lotes.map((f) => f.codigo)).toEqual(['PP-1', 'PP-2'])
    expect(documentos.length + lotes.length).toBe(filas.length)
  })
})
