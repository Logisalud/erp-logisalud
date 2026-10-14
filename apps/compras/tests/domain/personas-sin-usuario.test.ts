import { describe, expect, it } from 'vitest'
import { beneficiarioDeSolicitud, leerAsignado, valorAsignado } from '@/domain/gasto'
import { filtrarPersonas, type OpcionPersona } from '@/domain/buscar-persona'
import { validarPersonaSinUsuario } from '@/domain/persona-sin-usuario'
import { valoresDeSolicitud } from '@/domain/valores-solicitud'

/**
 * Anticipos para vendedores, que no tienen usuario (migración 0081). Pedido
 * de Sebas el 2026-10-14: Omar Rubio, Jessica Mendoza, … no aparecían en
 * "Vendedor o persona asignada" porque esa lista era solo de usuarios.
 */

describe('¿para quién es el anticipo? — un solo campo codificado', () => {
  it('usuario y persona sin usuario se leen a columnas distintas', () => {
    expect(leerAsignado('usuario:u-1')).toEqual({ asignadoA: 'u-1', asignadoPersonaId: null })
    expect(leerAsignado('persona:p-1')).toEqual({ asignadoA: null, asignadoPersonaId: 'p-1' })
  })

  it('vacío o basura = para quien lo crea, nunca un id a medias', () => {
    for (const v of ['', null, undefined, 'persona:', 'otro:x', 'u-1']) {
      expect(leerAsignado(v)).toEqual({ asignadoA: null, asignadoPersonaId: null })
    }
  })

  it('ida y vuelta: lo guardado vuelve igual al formulario de edición', () => {
    for (const v of ['usuario:u-1', 'persona:p-1', '']) {
      const { asignadoA, asignadoPersonaId } = leerAsignado(v)
      expect(valorAsignado(asignadoA, asignadoPersonaId)).toBe(v)
    }
  })

  it('al editar, la fila guardada precarga a la persona sin usuario', () => {
    const v = valoresDeSolicitud({
      tipo: 'anticipo', categoria_id: 'c', moneda: 'PEN', descripcion: 'Viáticos', monto_solicitado: 300,
      base_imponible: null, igv: null, destino: 'Piura', fecha_inicio: null, fecha_fin: null,
      fecha_requerida: null, asignado_a: null, asignado_persona_id: 'p-1', quien_autoriza: null,
      fecha_factura: null,
    })
    expect(v.asignado).toBe('persona:p-1')
  })
})

describe('a quién se le paga lo que nace de la solicitud', () => {
  it('anticipo para un vendedor: la deuda es con el vendedor, no con quien la armó', () => {
    expect(beneficiarioDeSolicitud({ solicitante_id: 'contab', asignado_a: null, asignado_persona_id: 'vend' }))
      .toEqual({ beneficiario_persona: null, beneficiario_sin_usuario_id: 'vend' })
  })

  it('para un usuario, igual que antes de la 0081', () => {
    expect(beneficiarioDeSolicitud({ solicitante_id: 'contab', asignado_a: 'u-1', asignado_persona_id: null }))
      .toEqual({ beneficiario_persona: 'u-1', beneficiario_sin_usuario_id: null })
  })

  it('sin asignar: a quien la creó, igual que antes', () => {
    expect(beneficiarioDeSolicitud({ solicitante_id: 'yo', asignado_a: null, asignado_persona_id: null }))
      .toEqual({ beneficiario_persona: 'yo', beneficiario_sin_usuario_id: null })
  })
})

describe('el buscador', () => {
  const opciones: OpcionPersona[] = [
    { valor: 'usuario:1', nombre: 'Sebastian Gonzales', activo: true },
    { valor: 'persona:2', nombre: 'Luis Vargas', activo: true },
    { valor: 'persona:3', nombre: 'Omar Rubio', activo: true },
    { valor: 'persona:4', nombre: 'Omar Quevedo', activo: true },
    { valor: 'persona:5', nombre: 'José Antiguo', activo: false },
  ]
  const nombres = (t: string, elegido?: string) => filtrarPersonas(opciones, t, elegido).map((o) => o.nombre)

  it('por apellido, que es como se recuerda a un vendedor', () => {
    expect(nombres('vargas')).toEqual(['Luis Vargas'])
  })

  it('varias palabras: todas tienen que calzar', () => {
    expect(nombres('omar')).toEqual(['Omar Quevedo', 'Omar Rubio'])
    expect(nombres('omar r')).toEqual(['Omar Rubio'])
  })

  it('sin tildes ni mayúsculas, y sin ofrecer a los desactivados', () => {
    expect(nombres('jose')).toEqual([])
    expect(nombres('JOSÉ', 'persona:5')).toEqual(['José Antiguo'])
  })

  it('sin escribir nada, muestra a todos los activos (usuarios y vendedores juntos)', () => {
    expect(nombres('')).toHaveLength(4)
  })
})

describe('alta de una persona sin usuario', () => {
  it('el DNI es opcional, pero si viene tiene 8 dígitos', () => {
    expect(validarPersonaSinUsuario({ nombre: 'Omar Rubio' })).toEqual([])
    expect(validarPersonaSinUsuario({ nombre: 'Omar Rubio', dni: '12345678' })).toEqual([])
    expect(validarPersonaSinUsuario({ nombre: 'Omar Rubio', dni: '1234' })).toEqual(['El DNI tiene que tener 8 dígitos.'])
  })

  it('sin nombre no', () => {
    expect(validarPersonaSinUsuario({ nombre: '  ' })).toEqual(['Escribe el nombre.'])
  })
})
