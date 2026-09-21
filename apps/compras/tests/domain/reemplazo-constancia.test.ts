import { describe, expect, it } from 'vitest'
import {
  esArchivoReemplazable, etiquetaReemplazo, puedeReemplazarConstancia, validarReemplazo,
} from '@/domain/reemplazo-constancia'
import { puedeEditarseObligacion } from '@/domain/edicion'

describe('quién puede reemplazar una constancia', () => {
  it('solo admin+admin: Sebastián y Andrés', () => {
    expect(puedeReemplazarConstancia({ area: 'admin', rol: 'admin' })).toBe(true)
  })

  it('Tesorería SÍ, desde el 2026-09-21', () => {
    // Hasta esa fecha no podía, para separar a quien paga de quien custodia
    // la evidencia. Pero la que tiene el voucher en la mano es Milagritos —
    // es quien lo sube la primera vez—, así que un voucher ilegible se
    // quedaba ilegible hasta que apareciera un admin. Lo que sostiene el
    // control ahora es el rastro (quién, cuándo, por qué), no el candado.
    expect(puedeReemplazarConstancia({ area: 'tesoreria', rol: 'operativo' })).toBe(true)
    expect(puedeReemplazarConstancia({ area: 'tesoreria', rol: 'admin' })).toBe(true)
  })

  it('Contabilidad tampoco, ni siquiera rol admin', () => {
    expect(puedeReemplazarConstancia({ area: 'contabilidad', rol: 'admin' })).toBe(false)
  })

  it('un admin de área sin rol admin tampoco', () => {
    expect(puedeReemplazarConstancia({ area: 'admin', rol: 'operativo' })).toBe(false)
    expect(puedeReemplazarConstancia(null)).toBe(false)
  })
})

describe('validación del reemplazo', () => {
  const ok = { cual: 'voucher', motivo: 'subí la foto equivocada', storagePathNuevo: '2026/09/C-1/x.jpg' }

  it('acepta un reemplazo completo', () => {
    expect(validarReemplazo(ok)).toEqual([])
  })

  it('el motivo es OBLIGATORIO — es lo que hace útil al rastro', () => {
    expect(validarReemplazo({ ...ok, motivo: '   ' }).map((e) => e.campo)).toContain('motivo')
  })

  it('sin archivo nuevo no hay nada que reemplazar', () => {
    expect(validarReemplazo({ ...ok, storagePathNuevo: null }).map((e) => e.campo)).toContain('archivo')
  })

  it('solo se reemplazan los dos archivos conocidos', () => {
    expect(esArchivoReemplazable('voucher')).toBe(true)
    expect(esArchivoReemplazable('detraccion')).toBe(true)
    expect(esArchivoReemplazable('factura')).toBe(false)
    expect(validarReemplazo({ ...ok, cual: 'factura' }).map((e) => e.campo)).toContain('cual')
  })
})

describe('el rastro visible', () => {
  it('dice QUÉ archivo, quién y por qué', () => {
    const t = etiquetaReemplazo('voucher', 'Sebastián Gonzales', '2026-09-15T14:30:00Z', 'foto equivocada')
    expect(t).toContain('Voucher del pago')
    expect(t).toContain('Sebastián Gonzales')
    expect(t).toContain('foto equivocada')
  })

  it('distingue la detracción del voucher', () => {
    expect(etiquetaReemplazo('detraccion', 'X', '2026-09-15T14:30:00Z', 'm'))
      .toContain('Comprobante de detracción')
  })

  it('sin reemplazo no hay rastro que mostrar', () => {
    expect(etiquetaReemplazo(null, null, null, null)).toBeNull()
  })

  it('no inventa un nombre si no lo tiene', () => {
    expect(etiquetaReemplazo('voucher', null, '2026-09-15T14:30:00Z', 'm'))
      .toContain('alguien del ERP')
  })
})

describe('no confundir con reemplazar el comprobante al EDITAR (2026-09-19)', () => {
  /**
   * Son DOS mecanismos distintos y conviene que este test lo diga, porque el
   * nombre se parece y mezclarlos sería grave en las dos direcciones.
   *
   *  - Reemplazar constancia: el VOUCHER, DESPUÉS de pagado. Solo admin,
   *    motivo obligatorio, rastro propio. Es evidencia de que la plata salió.
   *  - Reemplazar el comprobante al editar: la factura o la cotización, ANTES
   *    de que Contabilidad dé conformidad. CUALQUIERA con sesión, sin motivo.
   *    Nadie decidió nada todavía, así que no hay nada que justificar.
   *
   * Acá solo se fija el gate del primero. El del segundo no es una función:
   * `editarPagoDirecto` solo llama a `exigirUsuario()` y valida el estado con
   * `puedeEditarseObligacion`, sin mirar área ni rol. Si algún día aparece un
   * `puedeReemplazarComprobante`, este bloque es el lugar donde comparar.
   */
  it('reemplazar la constancia es de admin y de Tesorería, no de Contabilidad', () => {
    expect(puedeReemplazarConstancia({ area: 'admin', rol: 'admin' })).toBe(true)
    // Milagritos: es quien sube el voucher, así que es quien lo corrige.
    expect(puedeReemplazarConstancia({ area: 'tesoreria', rol: 'operativo' })).toBe(true)
    // Contabilidad NO, aunque desde 2026-09-19 pueda conformar y rechazar.
    // No es quien maneja el voucher; conformar un documento y cambiar el
    // respaldo de un desembolso ya hecho no son la misma decisión.
    expect(puedeReemplazarConstancia({ area: 'contabilidad', rol: 'admin' })).toBe(false)
    expect(puedeReemplazarConstancia({ area: 'contabilidad', rol: 'operativo' })).toBe(false)
  })

  it('la ventana de edición NO mira el perfil: depende solo del estado', () => {
    // Antes de la conformidad se edita (y por lo tanto se reemplaza el
    // archivo); después, no edita nadie — tampoco un admin.
    expect(puedeEditarseObligacion('pendiente_factura')).toBe(true)
    expect(puedeEditarseObligacion('registrada')).toBe(true)
    expect(puedeEditarseObligacion('conforme')).toBe(false)
    expect(puedeEditarseObligacion('pagada')).toBe(false)
    expect(puedeEditarseObligacion('anulada')).toBe(false)
  })
})
