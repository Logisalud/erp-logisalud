// Fase 4 · P4: reglas puras de «Mis rutas» (espejo de wms.registrar_evento_parada, migración 0043).
import { describe, expect, it } from 'vitest'
import { construirMenu } from '@/domain/menu'
import { datosParaLsFr, estadoDeParada, eventosPosibles, motivoNoSePuede, puedeVerMisRutas, soloMisRutas, todasResueltas, validarEventoParada, validarFoto, type EventoParadaVista } from '@/domain/mis-rutas'
import { puede } from '@/domain/permisos'

const ev = (evento: EventoParadaVista['evento'], extra: Partial<EventoParadaVista> = {}): EventoParadaVista => ({ id: evento, evento, hora: '2026-11-05T15:30:00Z', ...extra })

describe('permisos y menú', () => {
  it('solo el conductor y el auxiliar de transporte tienen «Mis rutas»; lo suyo no incluye leer el inventario', () => {
    expect(puedeVerMisRutas(['conductor'])).toBe(true); expect(puedeVerMisRutas(['auxiliar_transporte'])).toBe(true)
    for (const r of ['auxiliar', 'jefe_transporte', 'jefe_almacen', 'admin_wms', 'direccion_tecnica', 'usuario_cliente'] as const) expect(puedeVerMisRutas([r]), r).toBe(false)
    expect(puede(['conductor'], 'ver')).toBe(false)
    expect(soloMisRutas(['conductor'])).toBe(true); expect(soloMisRutas(['conductor', 'jefe_transporte'])).toBe(false)
  })
  it('su menú es Inicio y Mis rutas; el de los demás no la trae', () => {
    expect(construirMenu(['conductor']).flatMap((s) => s.items.map((i) => i.href))).toEqual(['/', '/mis-rutas'])
    expect(construirMenu(['auxiliar_transporte']).flatMap((s) => s.items.map((i) => i.href))).toContain('/mis-rutas')
    expect(construirMenu(['jefe_transporte']).flatMap((s) => s.items.map((i) => i.href))).not.toContain('/mis-rutas')
  })
})

describe('estado de la parada y qué se puede marcar', () => {
  it('sale de los eventos: el resultado manda; si no, llegué; si no, por visitar', () => {
    expect(estadoDeParada([])).toBe('PENDIENTE')
    expect(estadoDeParada([ev('LLEGUE')])).toBe('LLEGUE')
    expect(estadoDeParada([ev('LLEGUE'), ev('INCIDENCIA', { motivo: 'tráfico' })])).toBe('LLEGUE')
    expect(estadoDeParada([ev('LLEGUE'), ev('ENTREGADO')])).toBe('ENTREGADO')
    expect(estadoDeParada([ev('NO_ENTREGADO', { motivo: 'cerrado' })])).toBe('NO_ENTREGADO')
  })
  it('botones: sin llegar no hay «Entregado» ni «Rechazado»; con resultado solo incidencia; con la ruta sin salir, ninguno', () => {
    expect(eventosPosibles('PENDIENTE', true)).toEqual(['LLEGUE', 'NO_ENTREGADO', 'INCIDENCIA'])
    expect(eventosPosibles('LLEGUE', true)).toEqual(['ENTREGADO', 'RECHAZADO', 'NO_ENTREGADO', 'INCIDENCIA'])
    expect(eventosPosibles('ENTREGADO', true)).toEqual(['INCIDENCIA'])
    expect(eventosPosibles('PENDIENTE', false)).toEqual([])
  })
  it('por qué no se puede, con los mismos textos que la base', () => {
    expect(motivoNoSePuede('ENTREGADO', 'PENDIENTE', true)).toMatch(/Primero marca «Llegué»/)
    expect(motivoNoSePuede('RECHAZADO', 'PENDIENTE', true)).toMatch(/Primero marca «Llegué»/)
    expect(motivoNoSePuede('LLEGUE', 'LLEGUE', true)).toMatch(/Ya marcaste/)
    expect(motivoNoSePuede('NO_ENTREGADO', 'ENTREGADO', true)).toMatch(/ya tiene su resultado/)
    expect(motivoNoSePuede('INCIDENCIA', 'ENTREGADO', true)).toBeNull()
    expect(motivoNoSePuede('LLEGUE', 'PENDIENTE', false)).toMatch(/todavía no salió/)
    expect(motivoNoSePuede('LLEGUE', 'PENDIENTE', true)).toBeNull()
  })
  it('todasResueltas: la ruta queda pendiente de cierre cuando cada parada tiene su resultado', () => {
    expect(todasResueltas([])).toBe(false)
    expect(todasResueltas([{ estado: 'ENTREGADO' }, { estado: 'LLEGUE' }])).toBe(false)
    expect(todasResueltas([{ estado: 'ENTREGADO' }, { estado: 'RECHAZADO' }, { estado: 'NO_ENTREGADO' }])).toBe(true)
  })
})

describe('validaciones', () => {
  it('entregado pide nombre, DNI de 8 números y foto; los demás, el motivo', () => {
    expect(validarEventoParada('ENTREGADO', {})).toMatchObject({ recibioNombre: expect.any(String), recibioDocumento: expect.any(String), foto: expect.any(String) })
    expect(validarEventoParada('ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '1234567', tieneFoto: true })).toEqual({ recibioDocumento: 'El DNI de quien recibió tiene 8 números' })
    expect(validarEventoParada('ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '12345678', tieneFoto: true })).toEqual({})
    for (const e of ['NO_ENTREGADO', 'RECHAZADO', 'INCIDENCIA'] as const) { expect(validarEventoParada(e, { motivo: 'no' }).motivo).toBeTruthy(); expect(validarEventoParada(e, { motivo: 'Cliente ausente' })).toEqual({}) }
    expect(validarEventoParada('LLEGUE', {})).toEqual({})
  })
  it('la foto es una imagen de hasta 10 MB', () => {
    expect(validarFoto('', 0)).toMatch(/Toma o elige/)
    expect(validarFoto('doc.pdf', 1000, 'application/pdf')).toMatch(/imagen/)
    expect(validarFoto('f.jpg', 11 * 1024 * 1024, 'image/jpeg')).toMatch(/10 MB/)
    expect(validarFoto('f.jpg', 2000, 'image/jpeg')).toBeNull()
  })
})

describe('lo que alimenta el LS-FR.43.03', () => {
  it('entregado: hora de entrega y quién recibió; no entregado: el motivo; las incidencias se suman', () => {
    expect(datosParaLsFr([ev('LLEGUE'), ev('ENTREGADO', { recibioNombre: 'María Pérez', recibioDocumento: '12345678', hora: '2026-11-05T16:00:00Z' })])).toEqual({ horaEntrega: '2026-11-05T16:00:00Z', observaciones: 'Recibió María Pérez (DNI 12345678)' })
    expect(datosParaLsFr([ev('NO_ENTREGADO', { motivo: 'Local cerrado' }), ev('INCIDENCIA', { motivo: 'Tráfico' })])).toEqual({ horaEntrega: undefined, observaciones: 'No entregado: Local cerrado · Incidencia: Tráfico' })
    expect(datosParaLsFr([])).toEqual({ horaEntrega: undefined, observaciones: undefined })
  })
})
