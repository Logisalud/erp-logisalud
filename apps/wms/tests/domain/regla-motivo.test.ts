// Piloto · errores de la demo (E-1 y E-2) en el dominio y la pantalla: el destino es del mismo propietario del lote y «Salida de Cuarentena»
// limita el origen (Cuarentena) y el destino (Aprobados). La base y la demo aplican lo mismo (tests/db y tests/services).
import { describe, expect, it } from 'vitest'
import { construirPanoramaDemo } from '@/services/demo/datos'
import { buscarDestinos, ubicacionesDeProducto, validarDestino, validarLineasMovimiento, type CeldaDeProducto, type LineaParaChequear } from '@/domain/inventario'
import { evaluarLinea, opcionesDestinoLinea } from '@/domain/movimiento-tabla'
import { celdasParaMotivo, esSalidaDeCuarentena, razonDestinoPorMotivo, razonOrigenPorMotivo } from '@/domain/regla-motivo'
import { AREAS_COMPARTIDAS, propietarioVigente } from '@/domain/zonas'

const p = construirPanoramaDemo('2026-10-09')
const celdas: CeldaDeProducto[] = p.productos.flatMap((x) => ubicacionesDeProducto(p, x.id)).filter((c) => c.estado === 'APROBADO')
const comoLinea = (c: CeldaDeProducto, extra: Partial<LineaParaChequear> = {}): LineaParaChequear => ({ clave: 'x', posicionId: c.posicionId, propietarioId: c.propietarioId, propietario: c.propietario, estado: c.estado, ...extra })

describe('E-1 · el destino ofrecido es del mismo propietario del lote', () => {
  it('ninguna opción es un rack de otro propietario ni uno sin asignación; solo del propietario y áreas compartidas', () => {
    expect(celdas.length).toBeGreaterThan(10)
    for (const c of celdas.slice(0, 40)) {
      const ops = opcionesDestinoLinea(p, '', comoLinea(c), {}, 500)
      for (const o of ops) {
        const pos = p.posiciones.find((x) => x.id === o.posicionId)!
        if (AREAS_COMPARTIDAS.has(pos.tipoArea)) continue
        expect(propietarioVigente(pos.id, p.asignaciones, p.hoy), `${pos.codigo} para ${c.propietario}`).toBe(c.propietarioId)
      }
    }
  })

  it('al buscar por código tampoco aparece un rack de otro propietario', () => {
    const c = celdas.find((x) => x.propietario === 'DIPHASAC') ?? celdas[0]
    const ajeno = p.posiciones.find((x) => !AREAS_COMPARTIDAS.has(x.tipoArea) && propietarioVigente(x.id, p.asignaciones, p.hoy) && propietarioVigente(x.id, p.asignaciones, p.hoy) !== c.propietarioId)!
    expect(opcionesDestinoLinea(p, ajeno.codigo, comoLinea(c), {}, 500).map((o) => o.posicionId)).not.toContain(ajeno.id)
    expect(buscarDestinos(p, ajeno.codigo, [comoLinea(c)]).map((o) => o.posicionId)).not.toContain(ajeno.id)
  })

  it('aunque se fuerce, el dominio lo rechaza con el nombre del dueño', () => {
    const c = celdas.find((x) => x.propietario === 'DIPHASAC') ?? celdas[0]
    const ajeno = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && propietarioVigente(x.id, p.asignaciones, p.hoy) && propietarioVigente(x.id, p.asignaciones, p.hoy) !== c.propietarioId)!
    const v = validarDestino(p, ajeno.id, [comoLinea(c)])!
    expect(v.ok).toBe(false)
    expect(v.porLinea[0].mensaje).toMatch(/no recibe stock de/)
  })
})

describe('E-2 · motivo «Salida de Cuarentena»', () => {
  const enCuarentena = (() => {
    const q = p.posiciones.find((x) => x.tipoArea === 'CUARENTENA')!
    const base = celdas[0]
    return { ...base, posicionId: q.id, posicion: q.codigo, tipoArea: 'CUARENTENA' as const, area: 'Cuarentena' }
  })()
  const enRack = celdas.find((c) => c.tipoArea === 'APROBADOS')!

  it('reconoce el motivo sin importar mayúsculas, tildes ni espacios de más', () => {
    for (const t of ['Salida de Cuarentena', ' salida  DE cuarentena ', 'SALIDA DE CUARENTENA']) expect(esSalidaDeCuarentena(t)).toBe(true)
    for (const t of ['Reorganización', 'Salida', '', undefined]) expect(esSalidaDeCuarentena(t)).toBe(false)
  })

  it('el origen que ofrece la pantalla es solo de Cuarentena; con otro motivo se ofrece todo', () => {
    const todas = [enCuarentena, enRack]
    expect(celdasParaMotivo(todas, 'Salida de Cuarentena')).toEqual([enCuarentena])
    expect(celdasParaMotivo(todas, 'Reorganización')).toEqual(todas)
    expect(razonOrigenPorMotivo('Salida de Cuarentena', 'APROBADOS')).toMatch(/solo se mueve lo que está en una ubicación de Cuarentena/)
    expect(razonOrigenPorMotivo('Salida de Cuarentena', 'CUARENTENA')).toBeNull()
  })

  it('el destino ofrecido es solo Aprobados del mismo propietario; lo demás sale deshabilitado con su razón', () => {
    const ops = opcionesDestinoLinea(p, '', comoLinea(enCuarentena, { motivo: 'Salida de Cuarentena' }), {}, 500)
    const sirven = ops.filter((o) => !o.motivo)
    expect(sirven.length).toBeGreaterThan(0)
    for (const o of sirven) {
      const pos = p.posiciones.find((x) => x.id === o.posicionId)!
      expect(pos.tipoArea).toBe('APROBADOS')
      expect(propietarioVigente(pos.id, p.asignaciones, p.hoy)).toBe(enCuarentena.propietarioId)
    }
    expect(razonDestinoPorMotivo('Salida de Cuarentena', 'CUARENTENA')).toMatch(/el destino es una ubicación de Aprobados/)
  })

  it('el dominio rechaza un origen que no es de Cuarentena (aunque ya tenga destino) y el mensaje dice qué hacer', () => {
    const destino = p.posiciones.find((x) => x.tipoArea === 'APROBADOS' && propietarioVigente(x.id, p.asignaciones, p.hoy) === enRack.propietarioId && x.id !== enRack.posicionId)!
    const r = validarLineasMovimiento(p, [comoLinea(enRack, { motivo: 'Salida de Cuarentena', haciaPosicionId: destino.id })])[0]
    expect(r).toMatchObject({ ok: false, lado: 'origen' })
    expect(r.mensaje).toMatch(/solo se mueve lo que está en una ubicación de Cuarentena/)
    // sin destino todavía, igual avisa del origen
    expect(validarLineasMovimiento(p, [comoLinea(enRack, { motivo: 'Salida de Cuarentena' })])[0]).toMatchObject({ ok: false, lado: 'origen' })
    // con otro motivo, el mismo movimiento sirve
    expect(validarLineasMovimiento(p, [comoLinea(enRack, { motivo: 'Reorganización', haciaPosicionId: destino.id })])[0].ok).toBe(true)
  })

  it('un destino que no es Aprobados se rechaza con este motivo', () => {
    const otraCuarentena = p.posiciones.find((x) => x.tipoArea === 'CUARENTENA' && x.id !== enCuarentena.posicionId)!
    const r = validarLineasMovimiento(p, [comoLinea(enCuarentena, { motivo: 'Salida de Cuarentena', haciaPosicionId: otraCuarentena.id })])[0]
    expect(r.ok).toBe(false)
    expect(r.mensaje).toMatch(/el destino es una ubicación de Aprobados/)
  })

  it('el mensaje bajo la línea explica el origen y qué hacer', () => {
    const m = evaluarLinea({ tieneProducto: true, origen: 'F-3.1', disponible: 10, destino: 'B-2', cantidad: '1', razonOrigen: razonOrigenPorMotivo('Salida de Cuarentena', 'APROBADOS') })
    expect(m).toMatchObject({ tipo: 'error' })
    expect(m!.texto).toMatch(/Cuarentena.*Elige otro origen o cambia el motivo\.$/)
  })
})
