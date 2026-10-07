import { describe, expect, it } from 'vitest'
import { DOCUMENTOS_CONFIG, generarPosiciones, PROPIETARIOS_CONFIG } from '@/config/topologia'
import { areaAdmite, AREAS_COMPARTIDAS } from '@/domain/zonas'
import { celdasDelMapa } from '@/domain/mapa'
import type { Posicion } from '@/domain/tipos'

const pos = generarPosiciones()
const por = (c: string) => pos.find((p) => p.codigo === c)

describe('topología cargada desde datos', () => {
  it('no repite códigos', () => {
    expect(new Set(pos.map((p) => p.codigo)).size).toBe(pos.length)
  })

  it('el rack A llega hasta A-27 (resuelto por el usuario)', () => {
    expect(por('A-27.4')).toBeDefined()
    expect(por('A-10.1')?.tipoArea).toBe('DEVOLUCIONES')
    expect(por('A-28.1')).toBeUndefined()
  })

  it('las áreas compartidas no tienen propietario fijo', () => {
    for (const p of pos.filter((x) => AREAS_COMPARTIDAS.has(x.tipoArea))) expect(p.propietario).toBeNull()
    expect(por('A-1')?.tipoArea).toBe('RECEPCION')
    expect(por('A-M1')?.tipoArea).toBe('RECEPCION')
    expect(['A-6', 'A-7', 'A-8', 'A-9'].every((c) => por(c)?.tipoArea === 'CUARENTENA')).toBe(true)
  })

  it('cada posición exclusiva con propietario tiene su documento de sustento', () => {
    for (const p of pos.filter((x) => x.propietario)) expect(p.documento).not.toBeNull()
  })

  it('AJR Labs sale de la adenda: G-7..G-10 (4 niveles), J-13.1, J-13.3 y A-11.1', () => {
    const ajr = pos.filter((p) => p.propietario === 'AJR_LABS').map((p) => p.codigo).sort()
    const esperado = [
      ...['G-7', 'G-8', 'G-9', 'G-10'].flatMap((g) => [1, 2, 3, 4].map((n) => `${g}.${n}`)),
      'J-13.1', 'J-13.3', 'A-11.1',
    ].sort()
    expect(ajr).toEqual(esperado)
    expect(pos.filter((p) => p.propietario === 'AJR_LABS').every((p) => p.documento === 'ADENDA_AJR')).toBe(true)
    expect(DOCUMENTOS_CONFIG.find((d) => d.codigo === 'ADENDA_AJR')?.estadoConfirmacion).toBe('POR_CONFIRMAR')
  })

  it('las posiciones por propietario coinciden con topologia.md', () => {
    expect(por('E-8.1.1')).toMatchObject({ tipoArea: 'DEVOLUCIONES', propietario: 'LOGISSA', forma: 'SUBRACK' })
    expect(por('E-8.1.2')).toMatchObject({ tipoArea: 'BAJAS_RECHAZADOS', propietario: 'LOGISSA' })
    expect(por('E-8.1.3')).toMatchObject({ tipoArea: 'CONTRAMUESTRA', propietario: 'LOGISSA' })
    expect(por('E-8.1.4')).toMatchObject({ tipoArea: 'APROBADOS', propietario: 'LOGISSA' })
    expect(por('I-1.1.4')).toMatchObject({ tipoArea: 'APROBADOS', propietario: 'TRIAMED' })
    expect(por('I-1.2')?.propietario).toBe('MEDIC_PHARMA_LAB')
    expect(por('I-9.1')?.propietario).toBe('LOGISSA')
    expect(por('J-11.1')).toMatchObject({ tipoArea: 'CONTRAMUESTRA', propietario: 'MEDIC_PHARMA_LAB' })
    expect(por('J-11.3')).toMatchObject({ tipoArea: 'BAJAS_RECHAZADOS', propietario: 'MEDIC_PHARMA_LAB' })
    expect(por('A-13.1')).toMatchObject({ tipoArea: 'DEVOLUCIONES', propietario: 'MEDIC_PHARMA_LAB' })
    expect(por('J-13.4')).toMatchObject({ tipoArea: 'CONTRAMUESTRA', propietario: 'DIPHASAC' })
    expect(por('J-12.3')).toMatchObject({ tipoArea: 'CONTRAMUESTRA', propietario: 'DIPHASAC' })
    expect(por('B-1')).toMatchObject({ forma: 'PISO', propietario: 'LOGISSA' })
  })

  it('las posiciones sin propietario quedan libres y marcadas por verificar (D-07)', () => {
    for (const c of ['I-8.1', 'I-8.4', 'J-12.4']) {
      expect(por(c)?.propietario).toBeNull()
      expect(por(c)?.porVerificar).toBeTruthy()
    }
  })

  it('E-9.1 y E-10.1 se cargan de Logissa y por verificar', () => {
    expect(por('E-9.1')).toMatchObject({ propietario: 'LOGISSA' })
    expect(por('E-9.1')?.porVerificar).toBeTruthy()
    expect(por('E-10.1')?.porVerificar).toBeTruthy()
  })

  it('las posiciones de estado "Aprobado" admiten Aprobado y las de bajas, Bajas', () => {
    for (const p of pos) {
      if (p.tipoArea === 'APROBADOS') expect(areaAdmite(p.tipoArea, 'APROBADO', 'CARGA_INICIAL')).toBe(true)
      if (p.tipoArea === 'BAJAS_RECHAZADOS') expect(areaAdmite(p.tipoArea, 'BAJAS_RECHAZADOS', 'AJUSTE')).toBe(true)
    }
  })

  it('hay 5 propietarios, uno solo dueño del almacén', () => {
    expect(PROPIETARIOS_CONFIG).toHaveLength(5)
    expect(PROPIETARIOS_CONFIG.filter((p) => p.esDuenoAlmacen).map((p) => p.codigo)).toEqual(['LOGISSA'])
  })
})

describe('mapa aproximado', () => {
  const posiciones: Posicion[] = pos.map((p, i) => ({
    id: `p${i}`, codigo: p.codigo, rack: p.rack, posicion: p.posicion, nivel: p.nivel, subnivel: p.subnivel,
    forma: p.forma, tipoArea: p.tipoArea, activa: true, porVerificar: !!p.porVerificar,
  }))
  const celdas = celdasDelMapa(posiciones)

  it('agrupa los niveles en una celda por posición de rack', () => {
    expect(celdas.find((c) => c.clave === 'A-10')).toBeDefined()
    expect(posiciones.filter((p) => p.rack === 'A' && p.posicion === 10)).toHaveLength(4)
  })

  it('ninguna celda se superpone con otra', () => {
    const vistas = new Set<string>()
    for (const c of celdas) {
      const k = `${c.x}|${c.y}`
      expect(vistas.has(k), `celdas superpuestas en ${k} (${c.clave})`).toBe(false)
      vistas.add(k)
    }
  })

  it('el rack A va de A-27 (izquierda) a A-10 y luego Cuarentena y Recepción', () => {
    const x = (c: string) => celdas.find((k) => k.clave === c)!.x
    expect(x('A-27')).toBeLessThan(x('A-10'))
    expect(x('A-10')).toBeLessThan(x('A-9'))
    expect(x('A-6')).toBeLessThan(x('A-5'))
    expect(x('A-1')).toBeLessThan(x('A-M1'))
  })
})
