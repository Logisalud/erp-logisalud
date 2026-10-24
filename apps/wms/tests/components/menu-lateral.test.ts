import { describe, expect, it } from 'vitest'
import { PERSONAS_DEMO } from '@/lib/sesion-demo'
import { ORDEN_SECCIONES, cerradasPorDefecto, SALIDAS_NOMBRES, construirMenu, hrefActivo, principalesTelefono } from '@/domain/menu'
import type { Rol } from '@/domain/tipos'

const persona = (clave: string) => PERSONAS_DEMO.find((p) => p.clave === clave)!.roles
const etiquetas = (roles: Rol[], id?: string) => construirMenu(roles).filter((s) => !id || s.id === id).flatMap((s) => s.items.map((i) => i.etiqueta))
const hrefs = (roles: Rol[]) => construirMenu(roles).flatMap((s) => s.items.map((i) => i.href))

describe('menú lateral por rol (D-131 a D-133)', () => {
  it('las secciones siguen el orden del trabajo y ninguna sale vacía, para cada persona', () => {
    for (const p of PERSONAS_DEMO) {
      const sec = construirMenu(p.roles, 3)
      const ids = sec.map((s) => s.id)
      expect(ids, p.clave).toEqual(ORDEN_SECCIONES.filter((id) => ids.includes(id)))
      for (const s of sec) expect(s.items.length, `${p.clave}/${s.id}`).toBeGreaterThan(0)
      expect(sec[0].items[0].href).toBe('/')
      expect(new Set(sec.flatMap((s) => s.items.map((i) => i.href))).size).toBe(sec.flatMap((s) => s.items).length)
    }
  })

  it('el grupo Salidas del Jefe de Transporte tiene los cuatro nombres exactos, en orden, y «Nueva salida» destacada', () => {
    const salidas = construirMenu(persona('jefe_transporte')).find((s) => s.id === 'salidas')!
    expect(salidas.titulo).toBe('Salidas')
    expect(salidas.items.map((i) => i.etiqueta)).toEqual([...SALIDAS_NOMBRES])
    expect(salidas.items.map((i) => i.href)).toEqual(['/pedidos', '/salidas', '/salidas/nueva', '/rutas'])
    expect(salidas.items.filter((i) => i.destacado).map((i) => i.etiqueta)).toEqual(['Nueva salida'])
  })

  it('los pasos del trabajo llevan nombres que dicen qué se hace', () => {
    expect(etiquetas(persona('jefe_transporte'), 'despacho')).toEqual(['Preparar pedidos (picking)', 'Embalar', 'Cargar la unidad'])
    expect(etiquetas(['conformidad_despacho', 'asistente_dt'], 'despacho')).toContain('Dar conformidad')
    expect(etiquetas(persona('jefe_transporte'), 'entradas')).toEqual(['Recepciones', 'Devoluciones'])
  })

  it('el Auxiliar no ve la bandeja de pedidos, ni Nueva salida, ni Rutas; sí ve los pasos de piso', () => {
    const h = hrefs(persona('auxiliar'))
    for (const x of ['/pedidos', '/salidas/nueva', '/rutas', '/conformidad', '/propietarios', '/calidad', '/documentos', '/expedientes', '/auditoria', '/carga-inicial', '/retornos']) expect(h, x).not.toContain(x)
    for (const x of ['/', '/almacen', '/movimientos', '/conteos', '/picking', '/embalaje', '/carga', '/alertas']) expect(h, x).toContain(x)
  })

  it('Auditoría solo lee: ve la lista de órdenes y la auditoría, ninguna cola de trabajo ni «Nueva salida»', () => {
    const h = hrefs(persona('auditoria_lectura'))
    expect(h).toEqual(expect.arrayContaining(['/pedidos', '/salidas', '/rutas', '/auditoria']))
    for (const x of ['/salidas/nueva', '/picking', '/conformidad', '/embalaje', '/carga', '/retornos', '/carga-inicial']) expect(h, x).not.toContain(x)
  })

  it('«Autoriza salidas sin venta» ve lo suyo (Nueva salida y las órdenes, para seguir su muestra: SA-2) y nada de las colas ni de la bandeja', () => {
    const sec = construirMenu(persona('autoriza_salidas_sin_venta'))
    expect(sec.find((s) => s.id === 'salidas')!.items.map((i) => i.etiqueta)).toEqual(['Órdenes de salida', 'Nueva salida'])
    expect(sec.some((s) => s.id === 'despacho')).toBe(false)
    expect(hrefs(persona('autoriza_salidas_sin_venta'))).not.toContain('/pedidos')
    for (const x of ['/entradas', '/movimientos', '/conteos', '/bajas', '/propietarios']) expect(hrefs(persona('autoriza_salidas_sin_venta')), x).not.toContain(x)
  })

  it('Sandra da conformidad y prepara; Katia ve Calidad y Carga inicial pero no las colas de piso; Admin ve Carga inicial', () => {
    expect(etiquetas(persona('asistente_dt'), 'despacho')).toEqual(['Preparar pedidos (picking)', 'Dar conformidad'])
    const katia = hrefs(persona('direccion_tecnica'))
    expect(katia).toEqual(expect.arrayContaining(['/pedidos', '/salidas', '/calidad', '/carga-inicial', '/retornos']))
    expect(katia).not.toContain('/picking')
    expect(hrefs(persona('admin_wms'))).toContain('/carga-inicial')
    expect(hrefs(persona('jefe_almacen'))).not.toContain('/carga-inicial')
  })

  it('quien no es personal (conductor, cliente) solo ve el Inicio', () => {
    expect(hrefs(['conductor'])).toEqual(['/'])
    expect(hrefs(['usuario_cliente'])).toEqual(['/'])
  })

  it('las alertas siguen con su insignia en Control', () => {
    const control = construirMenu(persona('direccion_tecnica'), 4).find((s) => s.id === 'control')!
    expect(control.items.find((i) => i.href === '/alertas')!.insignia).toBe(4)
  })

  it('la barra inferior del teléfono muestra lo principal de cada rol (solo enlaces visibles, 3 como máximo)', () => {
    for (const p of PERSONAS_DEMO) {
      const sec = construirMenu(p.roles)
      const b = principalesTelefono(p.roles, sec)
      const visibles = new Set(sec.flatMap((s) => s.items.map((i) => i.href)))
      expect(b.length, p.clave).toBeGreaterThanOrEqual(2)
      expect(b.length).toBeLessThanOrEqual(3)
      for (const h of b) expect(visibles.has(h), `${p.clave} ${h}`).toBe(true)
    }
    expect(principalesTelefono(persona('jefe_transporte'), construirMenu(persona('jefe_transporte')))).toEqual(['/', '/salidas', '/rutas'])
    expect(principalesTelefono(persona('auxiliar'), construirMenu(persona('auxiliar')))).toEqual(['/', '/picking', '/almacen'])
  })

  it('el enlace activo es el más específico', () => {
    const h = ['/', '/salidas', '/salidas/nueva', '/reportes', '/reportes/vencimientos']
    expect(hrefActivo('/salidas/nueva', h)).toBe('/salidas/nueva')
    expect(hrefActivo('/salidas/OS-1', h)).toBe('/salidas')
    expect(hrefActivo('/reportes/vencimientos', h)).toBe('/reportes/vencimientos')
    expect(hrefActivo('/reportes/inventario', h)).toBe('/reportes')
    expect(hrefActivo('/', h)).toBe('/')
    expect(hrefActivo('/salidasX', h)).toBeNull()
  })

  it('cada enlace del menú apunta a una pantalla que existe, salvo /salidas/nueva (la crea SA-2)', async () => {
    const { existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const todas = PERSONAS_DEMO.flatMap((p) => hrefs(p.roles))
    for (const h of new Set(todas)) {
      if (h === '/salidas/nueva') continue
      const ruta = h === '/' ? 'page.tsx' : h.startsWith('/reportes/') ? 'reportes/[id]/page.tsx' : `${h.slice(1)}/page.tsx`
      expect(existsSync(resolve(__dirname, '../../app/(app)', ruta)), h).toBe(true)
    }
  })

  it('arrancan cerradas Control (con la insignia de alertas) y, para quien planifica salidas, Almacén; Auditoría y Admin abren Control', () => {
    const c = (clave: string) => cerradasPorDefecto(persona(clave), construirMenu(persona(clave)))
    expect(c('jefe_transporte')).toEqual(['control', 'almacen'])
    expect(c('auxiliar')).toEqual(['control'])
    expect(c('auditoria_lectura')).toEqual([])
    expect(c('admin_wms')).toEqual([])
    expect(c('autoriza_salidas_sin_venta')).not.toContain('salidas')
  })
})
