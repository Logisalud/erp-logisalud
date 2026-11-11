// 1d (reunión del equipo): la etiqueta del bulto lleva la dirección de destino.
import { describe, expect, it } from 'vitest'
import { textoDestinoEtiqueta } from '@/domain/embalaje'

describe('destino en la etiqueta del bulto', () => {
  it('lleva la dirección tal cual, sin espacios de más', () => {
    expect(textoDestinoEtiqueta('  Av. Arequipa 123,   Lince ')).toBe('Av. Arequipa 123, Lince')
  })
  it('agrega el distrito solo si la dirección todavía no lo dice', () => {
    expect(textoDestinoEtiqueta('Av. Arequipa 123', 'Lince')).toBe('Av. Arequipa 123 · Lince')
    expect(textoDestinoEtiqueta('Av. Arequipa 123, Lince', 'lince')).toBe('Av. Arequipa 123, Lince')
  })
  it('sin dirección lo dice claro en vez de dejarlo en blanco', () => {
    expect(textoDestinoEtiqueta('', null)).toBe('SIN DIRECCIÓN DE DESTINO')
    expect(textoDestinoEtiqueta(undefined, 'Ate')).toBe('Distrito: Ate (sin dirección registrada)')
  })
})

describe('destino de la etiqueta de provincia (hoja LOGISALUD)', () => {
  it('el ubigeo da el departamento y la línea «DEPARTAMENTO - PROVINCIA - DISTRITO - dirección»', async () => {
    const { destinoDeEtiqueta } = await import('@/domain/embalaje')
    expect(destinoDeEtiqueta('120101', 'Prolongación Cuzco Nro. 200.', 'Huancayo')).toEqual({ departamento: 'JUNIN', entrega: 'JUNIN - HUANCAYO - HUANCAYO - Prolongación Cuzco Nro. 200.' })
    expect(destinoDeEtiqueta('150101')).toEqual({ departamento: 'LIMA', entrega: 'LIMA - LIMA - LIMA' })
  })
  it('sin ubigeo (o que no existe) cae a la dirección con su distrito, sin departamento', async () => {
    const { destinoDeEtiqueta } = await import('@/domain/embalaje')
    expect(destinoDeEtiqueta(undefined, 'Av. Arequipa 123', 'Lince')).toEqual({ entrega: 'Av. Arequipa 123 · Lince' })
    expect(destinoDeEtiqueta('999999', 'Av. 1')).toEqual({ entrega: 'Av. 1' })
  })
  it('el catálogo trae los 1.884 distritos del INEI', async () => {
    const { nombresDeUbigeo } = await import('@/domain/ubigeos-peru')
    expect(nombresDeUbigeo('070101')).toMatchObject({ departamento: 'CALLAO' }); expect(nombresDeUbigeo('abc')).toBeUndefined()
  })
})
