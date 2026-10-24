// «Conductor en documentos» (D-155): quién figura, el interruptor quitado y las reglas del documento de identidad.
import { describe, expect, it } from 'vitest'
import { detalleUsoConductor, errorDocumentoPersonal, quienFiguraEnDocumentos, textoConductorEnDocumentos } from '@/domain/conductor-documentos'
import { CODIGO_DOCUMENTO_SUNAT } from '@/domain/guia-electronica'
import type { PersonalTransporte } from '@/domain/rutas'

const p = (id: string, nombre: string, extra: Partial<PersonalTransporte> = {}): PersonalTransporte => ({ id, nombre, funcion: 'CONDUCTOR', activo: true, ...extra })
const hans = p('h', 'Hans'); const michele = p('m', 'Michele'); const baja = p('b', 'De baja', { activo: false })
const todos = [hans, michele, baja]

describe('quién figura en los documentos', () => {
  it('con el interruptor puesto, la persona elegida; el real se conserva aparte', () => {
    const q = quienFiguraEnDocumentos(hans, { personaId: 'm' }, todos)
    expect(q).toMatchObject({ figura: michele, real: hans, distinto: true })
    expect(textoConductorEnDocumentos(q)).toBe('Los documentos llevan a Michele. El conductor real de la ruta es Hans y así queda registrado.')
    expect(detalleUsoConductor('Guía T001-1', q)).toBe('Guía T001-1: en el documento Michele · conductor real Hans')
  })
  it('si la elegida es el mismo conductor, no hay diferencia', () => {
    expect(quienFiguraEnDocumentos(michele, { personaId: 'm' }, todos).distinto).toBe(false)
  })
  it('sin elegir a nadie, o con el interruptor ya quitado (sin parámetro), los documentos llevan al conductor real', () => {
    expect(quienFiguraEnDocumentos(hans, { personaId: undefined }, todos)).toMatchObject({ figura: hans, distinto: false })
    expect(quienFiguraEnDocumentos(hans, undefined, todos)).toMatchObject({ figura: hans, real: hans, distinto: false })
  })
  it('nunca nombra a alguien que ya no está disponible, que no es conductor o que ya no existe', () => {
    expect(quienFiguraEnDocumentos(hans, { personaId: 'b' }, todos).figura).toBe(hans)
    expect(quienFiguraEnDocumentos(hans, { personaId: 'zzz' }, todos).figura).toBe(hans)
    expect(quienFiguraEnDocumentos(hans, { personaId: 'a' }, [...todos, { ...michele, id: 'a', funcion: 'AUXILIAR' }]).figura).toBe(hans)
  })
  it('sin conductor en la ruta no hay a quién nombrar', () => {
    expect(quienFiguraEnDocumentos(undefined, { personaId: 'm' }, todos).distinto).toBe(false)
    expect(textoConductorEnDocumentos(quienFiguraEnDocumentos(undefined, undefined, todos))).toBe('Todavía no hay conductor en la ruta.')
  })
})

describe('documento de identidad de quien conduce', () => {
  it('los códigos de SUNAT: DNI 1, carné de extranjería 4, pasaporte 7', () => {
    expect(CODIGO_DOCUMENTO_SUNAT).toEqual({ DNI: '1', CE: '4', PASAPORTE: '7' })
  })
  it('valida el número según el tipo y la licencia; vacío es pendiente', () => {
    expect(errorDocumentoPersonal('DNI', '12345678', 'Q75084250')).toBeNull()
    expect(errorDocumentoPersonal('CE', '004780086', 'Q004780086')).toBeNull()
    expect(errorDocumentoPersonal('PASAPORTE', 'AB12345', '')).toBeNull()
    expect(errorDocumentoPersonal('DNI', '', '')).toBeNull()
    expect(errorDocumentoPersonal('DNI', '123', '')?.errores.dni).toBe('El DNI tiene 8 números.')
    expect(errorDocumentoPersonal('CE', '123', '')?.errores.dni).toMatch(/carné de extranjería/)
    expect(errorDocumentoPersonal('PASAPORTE', '1', '')?.errores.dni).toMatch(/pasaporte/)
    expect(errorDocumentoPersonal('DNI', '12345678', 'abc')?.errores.licencia).toMatch(/9 o 10/)
    expect(errorDocumentoPersonal('XX', '', '')?.errores.documentoTipo).toBeTruthy()
  })
})
