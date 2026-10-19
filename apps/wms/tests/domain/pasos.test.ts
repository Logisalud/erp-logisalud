// OS-4: toda Orden de Salida y todo ingreso muestran siempre su siguiente paso y quién lo hace; «Mis tareas» sale de ahí.
import { describe, expect, it } from 'vitest'
import { ESTADOS_INGRESO, ETAPAS_SALIDA, avanceDeIngreso, avanceDeSalida, esMiTarea } from '@/domain/pasos'

describe('Orden de Salida: siempre hay siguiente paso y responsable', () => {
  for (const etapa of ETAPAS_SALIDA) {
    it(`etapa ${etapa}`, () => {
      const a = avanceDeSalida(etapa, 'abc')
      expect(a.siguiente.texto.length).toBeGreaterThan(10)
      expect(a.siguiente.responsable.etiqueta.length).toBeGreaterThan(3)
      if (a.siguiente.fin) expect(a.siguiente.responsable.roles).toEqual([])
      else {
        expect(a.siguiente.responsable.roles.length).toBeGreaterThan(0)
        expect(a.siguiente.href).toMatch(/^\//)
        expect(a.siguiente.boton).toBeTruthy()
        expect(a.pasos.some((p) => p.estado === 'ACTUAL')).toBe(true)
      }
    })
  }

  it('los pasos avanzan con la etapa: picking hecho al llegar a conformidad, todo hecho al confirmar la salida', () => {
    const estado = (e: Parameters<typeof avanceDeSalida>[0]) => Object.fromEntries(avanceDeSalida(e, 'x').pasos.map((p) => [p.clave, p.estado]))
    expect(estado('EN_PICKING')).toMatchObject({ stock: 'HECHO', picking: 'ACTUAL', conformidad: 'PENDIENTE' })
    expect(estado('PENDIENTE_CONFORMIDAD')).toMatchObject({ picking: 'HECHO', conformidad: 'ACTUAL' })
    expect(estado('CONFORME')).toMatchObject({ conformidad: 'HECHO', documentos: 'ACTUAL' })
    expect(Object.values(estado('CONFIRMADA')).every((v) => v === 'HECHO')).toBe(true)
  })

  it('un pedido a Lima no tiene paso de embalaje; con la guía en espera de SUNAT el siguiente paso es consultarla', () => {
    expect(avanceDeSalida('LISTA_PARA_CARGA', 'x', { sinEmbalaje: true }).pasos.map((p) => p.clave)).not.toContain('embalaje')
    expect(avanceDeSalida('CONFORME', 'x', { guiaEnEspera: true }).siguiente.boton).toBe('Consultar estado en SUNAT')
  })

  it('«Mis tareas»: la conformidad es de otra persona, no de quien pickeó; el Jefe de Transporte emite la guía', () => {
    expect(esMiTarea(['conformidad_despacho'], avanceDeSalida('PENDIENTE_CONFORMIDAD', 'x').siguiente)).toBe(true)
    expect(esMiTarea(['auxiliar'], avanceDeSalida('PENDIENTE_CONFORMIDAD', 'x').siguiente)).toBe(false)
    expect(esMiTarea(['jefe_transporte'], avanceDeSalida('CONFORME', 'x').siguiente)).toBe(true)
    expect(esMiTarea(['jefe_transporte'], avanceDeSalida('CONFIRMADA', 'x').siguiente)).toBe(false)
  })
})

describe('Órdenes manuales (SA-2): siempre hay siguiente paso y responsable, en todas las etapas y los tres tipos', () => {
  for (const tipo of ['DISTRIBUCION', 'CLIENTE', 'MUESTRA', 'PROVEEDOR'] as const) {
    for (const etapa of ETAPAS_SALIDA) {
      it(`${tipo} · ${etapa}`, () => {
        const a = avanceDeSalida(etapa, 'abc', { tipo })
        expect(a.siguiente.texto.length).toBeGreaterThan(10)
        expect(a.siguiente.responsable.etiqueta.length).toBeGreaterThan(3)
        if (!a.siguiente.fin) expect(a.siguiente.responsable.roles.length).toBeGreaterThan(0)
      })
    }
  }

  it('por cuenta de un cliente (B) no se emite guía: el paso es registrar la GRE del cliente; los demás tipos la emiten', () => {
    expect(avanceDeSalida('CONFORME', 'x', { tipo: 'CLIENTE' }).siguiente.boton).toBe('Registrar la GRE del cliente')
    expect(avanceDeSalida('CONFORME', 'x', { tipo: 'DISTRIBUCION' }).siguiente.boton).toBe('Emitir la guía')
    expect(avanceDeSalida('CONFORME', 'x', { tipo: 'MUESTRA' }).siguiente.boton).toBe('Emitir la guía')
  })

  it('la destrucción sin stock en los racks no dice «esperar stock»: dice que sale desde Bajas', () => {
    expect(avanceDeSalida('SIN_STOCK', 'x', { tipo: 'CLIENTE', destruccion: true }).siguiente.texto).toMatch(/Bajas/)
  })
})

describe('Ingreso: siempre hay siguiente paso y responsable', () => {
  for (const estado of ESTADOS_INGRESO) {
    it(`estado ${estado}`, () => {
      const a = avanceDeIngreso(estado, 'abc')
      expect(a.siguiente.texto.length).toBeGreaterThan(10)
      expect(a.siguiente.responsable.etiqueta.length).toBeGreaterThan(3)
      if (!a.siguiente.fin) { expect(a.siguiente.responsable.roles.length).toBeGreaterThan(0); expect(a.siguiente.href).toMatch(/^\/entradas\//) }
    })
  }
  it('cerrada = cuatro pasos hechos', () => expect(avanceDeIngreso('CERRADA', 'x').pasos.every((p) => p.estado === 'HECHO')).toBe(true))
})

describe('Mis tareas', () => {
  const salidas = [
    { id: 's1', numero: 'OS-2026-00001', cliente: 'Botica A', etapa: 'PENDIENTE_CONFORMIDAD' as const },
    { id: 's2', numero: 'OS-2026-00002', cliente: 'Botica B', etapa: 'CONFORME' as const },
    { id: 's3', numero: 'OS-2026-00003', etapa: 'CONFIRMADA' as const },
  ]
  const ingresos = [{ id: 'i1', numero: 'IN-1', estado: 'ENVIADA' as const, etiquetaTipo: 'Compra local', etiquetaEstado: 'Por autorizar' }]
  const etiquetas = { PENDIENTE_CONFORMIDAD: 'Pendiente de conformidad', CONFORME: 'Conforme' } as never
  it('cada persona ve solo lo suyo', async () => {
    const { misTareas } = await import('@/domain/pasos')
    expect(misTareas(['conformidad_despacho'], salidas, ingresos, etiquetas).map((t) => t.clave)).toEqual(['s-s1'])
    expect(misTareas(['jefe_transporte'], salidas, ingresos, etiquetas).map((t) => t.clave)).toEqual(['s-s2'])
    expect(misTareas(['direccion_tecnica'], salidas, ingresos, etiquetas).map((t) => t.clave)).toEqual(['s-s2', 'i-i1'])
    expect(misTareas(['auditoria_lectura'], salidas, ingresos, etiquetas)).toEqual([])
  })
})
