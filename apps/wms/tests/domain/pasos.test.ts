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
        // quien decide con falta de stock es el vendedor del pedido: no tiene rol en el WMS, pero siempre hay un responsable con nombre
        if (a.siguiente.responsable.externo) expect(a.siguiente.responsable.roles).toEqual([])
        else expect(a.siguiente.responsable.roles.length).toBeGreaterThan(0)
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
        if (!a.siguiente.fin) {
          if (a.siguiente.responsable.externo) expect(a.siguiente.responsable.roles).toEqual([])
          else expect(a.siguiente.responsable.roles.length).toBeGreaterThan(0)
        }
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

  it('sin stock: una orden manual sin pedido (B/C o sin pedido en la bandeja) la resuelve el Jefe de Transporte; una con pedido (A), el vendedor', () => {
    expect(avanceDeSalida('SIN_STOCK', 'x', { tipo: 'CLIENTE' }).siguiente.responsable.roles).toEqual(['jefe_transporte'])
    expect(avanceDeSalida('SIN_STOCK', 'x', { tipo: 'DISTRIBUCION', sinPedido: true }).siguiente.responsable.roles).toEqual(['jefe_transporte'])
    expect(avanceDeSalida('SIN_STOCK', 'x', { tipo: 'DISTRIBUCION', sinPedido: false, vendedor: 'Rosa' }).siguiente.responsable.externo).toBe(true)
  })
})

describe('Orden de Salida con falta de stock (SA-3): decide el vendedor, no el Jefe de Transporte', () => {
  it('«Sigue: el vendedor [nombre] decide con el cliente si se quita lo que falta o se cancela el pedido»; lo hace el Vendedor y es externo al WMS', () => {
    const a = avanceDeSalida('SIN_STOCK', 'x', { vendedor: 'Rosa Paredes' })
    expect(a.siguiente.texto).toBe('el vendedor Rosa Paredes decide con el cliente si se quita lo que falta o se cancela el pedido')
    expect(a.siguiente.responsable).toEqual({ roles: [], etiqueta: 'Vendedor Rosa Paredes', externo: true })
    expect(a.siguiente.href).toBe('/salidas/x#falta-stock')
    expect(a.pasos.find((p) => p.estado === 'ACTUAL')?.clave).toBe('stock')
  })
  it('si no se conoce el vendedor, lo dice: «el vendedor del pedido»', () => {
    const a = avanceDeSalida('SIN_STOCK', 'x')
    expect(a.siguiente.texto).toBe('el vendedor del pedido decide con el cliente si se quita lo que falta o se cancela el pedido')
    expect(a.siguiente.responsable).toMatchObject({ etiqueta: 'Vendedor del pedido', externo: true })
  })
  it('nadie del WMS lo tiene en «Mis tareas»: ni el Jefe de Transporte (lo ve, no lo decide) ni Dirección Técnica', () => {
    const s = avanceDeSalida('SIN_STOCK', 'x', { vendedor: 'Rosa' }).siguiente
    for (const rol of ['jefe_transporte', 'direccion_tecnica', 'jefe_almacen', 'auxiliar', 'asistente_dt', 'admin_wms'] as const) expect(esMiTarea([rol], s), rol).toBe(false)
  })
  it('una orden sin pedido (muestra de Logissa) no tiene vendedor: sigue siendo del Jefe de Transporte', () => {
    const s = avanceDeSalida('SIN_STOCK', 'x', { sinPedido: true }).siguiente
    expect(s.responsable.roles).toEqual(['jefe_transporte'])
    expect(esMiTarea(['jefe_transporte'], s)).toBe(true)
  })
  it('por devolver lo picado: el auxiliar devuelve y otra persona verifica; después, solo la verificación', () => {
    const d = avanceDeSalida('POR_DEVOLVER_PICKING', 'x', { devolucionHref: '/movimientos/m1' })
    expect(d.siguiente.texto).toBe('el auxiliar devuelve lo picado a su ubicación y otra persona lo verifica')
    expect(d.siguiente.responsable.roles).toEqual(['auxiliar', 'jefe_almacen'])
    expect(d.siguiente.href).toBe('/movimientos/m1')
    expect(d.pasos.find((p) => p.clave === 'stock')?.estado).toBe('HECHO')
    expect(d.pasos.find((p) => p.clave === 'picking')?.estado).toBe('ACTUAL')
    const v = avanceDeSalida('POR_DEVOLVER_PICKING', 'x', { devolucion: 'POR_VERIFICAR' })
    expect(v.siguiente.texto).toMatch(/otra persona verifica que lo picado volvió a su ubicación/)
    expect(esMiTarea(['auxiliar'], v.siguiente)).toBe(true)
    expect(esMiTarea(['jefe_transporte'], v.siguiente)).toBe(false)
  })
  it('«Mis tareas» del Jefe de Almacén incluye la devolución pendiente y no la falta de stock', async () => {
    const { misTareas } = await import('@/domain/pasos')
    const salidas = [{ id: 's1', numero: 'OS-1', etapa: 'POR_DEVOLVER_PICKING' as const }, { id: 's2', numero: 'OS-2', etapa: 'SIN_STOCK' as const }]
    const etiquetas = { POR_DEVOLVER_PICKING: 'Por devolver', SIN_STOCK: 'Sin stock' } as never
    expect(misTareas(['jefe_almacen'], salidas, [], etiquetas).map((t) => t.clave)).toEqual(['s-s1'])
    expect(misTareas(['jefe_transporte'], salidas, [], etiquetas)).toEqual([])
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
