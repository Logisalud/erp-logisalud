import { describe, expect, it } from 'vitest'
import {
  admiteCorte, CORTE_POR_TIPO, esAccionCorte, etiquetaBotonCorte, filasQueNoAdmiten,
  filasSinRastroDelMotivo, guardaElMotivo, resumirCorte, validarMotivo,
} from '@/domain/corte-en-lote'
import { ETIQUETA_TIPO_PENDIENTE, type TipoPendiente } from '@/domain/pendientes-aprobar'
import { type ResultadoFila } from '@/domain/aprobacion-en-lote'

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
    // Sin salida: un impuesto confirmado no tiene vuelta atrás.
    expect(admiteCorte('impuesto', 'rechazar')).toBe(false)
    expect(admiteCorte('impuesto', 'anular')).toBe(false)
    // Una reposición se rechaza, no se anula.
    expect(admiteCorte('caja_chica', 'anular')).toBe(false)
    // Una planilla se anula, no se rechaza.
    expect(admiteCorte('planilla', 'rechazar')).toBe(false)
    expect(admiteCorte('planilla', 'anular')).toBe(true)
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

describe('filasQueNoAdmiten', () => {
  it('separa las que van a quedar afuera, para poder nombrarlas antes', () => {
    const filas = [fila('pago_directo', 'C-1'), fila('impuesto', 'I-1'), fila('caja_chica', 'R-1')]
    expect(filasQueNoAdmiten(filas, 'anular').map((f) => f.codigo)).toEqual(['I-1', 'R-1'])
    expect(filasQueNoAdmiten(filas, 'rechazar').map((f) => f.codigo)).toEqual(['I-1'])
  })
})

describe('filasSinRastroDelMotivo', () => {
  it('son las que SÍ se cortan pero donde el motivo se pierde', () => {
    const filas = [fila('pago_directo', 'C-1'), fila('os', 'OS-1'), fila('impuesto', 'I-1')]
    const sinRastro = filasSinRastroDelMotivo(filas, 'rechazar')
    expect(sinRastro.map((f) => f.codigo)).toEqual(['OS-1'])
    // La que no admite la acción NO cuenta acá: ya se nombra por otro lado, y
    // contarla dos veces haría creer que se va a cortar.
    expect(sinRastro.map((f) => f.codigo)).not.toContain('I-1')
  })
})

describe('etiquetaBotonCorte', () => {
  it('con un solo tipo lo nombra en plural de verdad', () => {
    const filas = [fila('pago_directo'), fila('pago_directo'), fila('pago_directo')]
    expect(etiquetaBotonCorte(filas, 'rechazar')).toBe('Rechazar 3 Pagos Directos')
  })

  it('con uno solo va en singular', () => {
    expect(etiquetaBotonCorte([fila('os')], 'anular')).toBe('Anular 1 Orden de Servicio')
  })

  it('con tipos mezclados no inventa un nombre: cuenta registros', () => {
    expect(etiquetaBotonCorte([fila('pago_directo'), fila('os')], 'anular')).toBe('Anular 2 registros')
  })

  it('sin selección no dice un número', () => {
    expect(etiquetaBotonCorte([], 'rechazar')).toBe('Rechazar seleccionados')
  })
})

describe('resumirCorte', () => {
  const ok = (codigo: string, tipo: TipoPendiente): ResultadoFila => ({ codigo, tipo, ok: true })
  const mal = (codigo: string, tipo: TipoPendiente, motivo: string): ResultadoFila =>
    ({ codigo, tipo, ok: false, motivo })

  it('todo bien, en plural', () => {
    expect(resumirCorte([ok('C-1', 'pago_directo'), ok('C-2', 'pago_directo')], 'rechazar'))
      .toBe('Se rechazaron los 2 registros.')
  })

  it('todo bien, uno solo: conjuga en singular y en pasado', () => {
    expect(resumirCorte([ok('C-1', 'pago_directo')], 'anular')).toBe('Se anuló 1 registro.')
  })

  it('parcial: nunca dice "listo" a secas, y nombra las que fallaron', () => {
    const r = resumirCorte(
      [ok('C-1', 'pago_directo'), mal('OS-9', 'os', 'ya no está esperando tu decisión')],
      'rechazar'
    )
    expect(r).toContain('Se rechazó 1 de 2')
    expect(r).toContain('Orden de Servicio OS-9')
    expect(r).toContain('ya no está esperando tu decisión')
  })

  it('ninguna entró', () => {
    expect(resumirCorte([mal('C-1', 'pago_directo', 'sin permiso')], 'anular'))
      .toContain('No se pudo aplicar la anulación a ninguno')
  })

  it('con dos fallidas usa "ni con" y no una coma final', () => {
    const r = resumirCorte(
      [mal('C-1', 'pago_directo', 'a'), mal('C-2', 'pago_directo', 'b')],
      'rechazar'
    )
    expect(r).toContain('ni con')
  })
})
