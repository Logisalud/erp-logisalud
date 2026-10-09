import { CAMPOS_CATALOGO, CAMPOS_REGULATORIOS, type CambioRegulatorio, type EventoAuditoria, type Regulatorio } from '@/domain/tipos'
import type { Panorama, ProductoConReg } from '@/domain/panorama'
import {
  autorizarAltaProducto, autorizarEdicionRegulatoria, validarEdicionRegulatoria, validarEntradaProducto, validarMotivoRegulatorio,
  type DatosRegulatorios, type EntradaProducto,
} from '@/domain/productos'
import { estado, registrar } from './estado'
import { InventarioDemo } from './inventario-demo'
import type { Actor, Repositorio, ResultadoAccion } from '../repositorio'

export class RepositorioDemo extends InventarioDemo implements Repositorio {
  async panorama(): Promise<Panorama> {
    return structuredClone(estado().panorama)
  }

  async auditoria(limite = 100): Promise<EventoAuditoria[]> {
    return estado().auditoria.slice(0, limite)
  }

  async crearProducto(entrada: EntradaProducto, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const permiso = autorizarAltaProducto(actor.roles)
    if (permiso) return { ok: false, mensaje: permiso }
    const v = validarEntradaProducto(entrada)
    if (!v.ok) return { ok: false, mensaje: 'Revisa los campos marcados.', errores: v.errores as Record<string, string> }
    const e = estado()
    const codigo = entrada.codigo.trim()
    if (e.panorama.productos.some((p) => p.codigo.toLowerCase() === codigo.toLowerCase())) {
      return { ok: false, mensaje: `Ya existe un producto con el código ${codigo}.`, errores: { codigo: 'Este código ya existe.' } }
    }
    const id = `prod:${e.panorama.productos.length + 1}`
    const prod: ProductoConReg = {
      id, codigo, descripcion: entrada.descripcion.trim(), presentacion: entrada.presentacion?.trim() || undefined,
      marca: entrada.marca?.trim() || undefined, principioActivo: entrada.principioActivo?.trim() || undefined,
      unidadMedida: entrada.unidadMedida?.trim() || 'UND', estado: 'activo',
      reg: {
        productoId: id, registroSanitario: entrada.registroSanitario?.trim() || undefined, rsVence: v.rsVence,
        fabricante: entrada.fabricante?.trim() || undefined, formaPresentacion: entrada.formaPresentacion?.trim() || undefined,
        concentracion: entrada.concentracion?.trim() || undefined, condicionAlmacenamiento: entrada.condicionAlmacenamiento?.trim() || undefined,
        creadoPor: actor.id,
      },
    }
    e.panorama.productos.push(prod)
    registrar(e, actor, 'producto_creado', 'productos', codigo, 'Alta de producto')
    for (const c of CAMPOS_REGULATORIOS) {
      const valor = prod.reg![c.clave]
      if (valor) e.cambiosRegulatorios.unshift({ id: `${id}:${c.campo}:${e.cambiosRegulatorios.length}`, productoId: id, campo: c.campo, despues: valor, usuario: actor.nombre, ts: new Date().toISOString(), motivo: 'Alta del producto' })
    }
    return { ok: true, id }
  }

  async editarRegulatorio(id: string, datos: DatosRegulatorios, motivo: string, actor: Actor): Promise<ResultadoAccion<{ cambios: number }>> {
    const permiso = autorizarEdicionRegulatoria(actor.roles)
    if (permiso) return { ok: false, mensaje: permiso }
    const errMotivo = validarMotivoRegulatorio(motivo)
    if (errMotivo) return { ok: false, mensaje: errMotivo, errores: { motivo: errMotivo } }
    const e = estado()
    const prod = e.panorama.productos.find((p) => p.id === id)
    if (!prod) return { ok: false, mensaje: 'No encontramos ese producto.' }
    const actual: Regulatorio = prod.reg ?? { productoId: id, creadoPor: actor.id }
    const v = validarEdicionRegulatoria(datos, actual)
    if (!v.ok) return { ok: false, mensaje: 'Revisa los campos marcados.', errores: v.errores as Record<string, string> }
    const nuevo: Regulatorio = { ...actual }
    const cambios: CambioRegulatorio[] = []
    for (const c of CAMPOS_REGULATORIOS) {
      const crudo = (v.datos as Record<string, string | undefined>)[c.clave]
      if (crudo === undefined) continue
      const despues = crudo.trim() || undefined
      const antes = actual[c.clave]
      if (antes === despues) continue
      ;(nuevo as unknown as Record<string, string | undefined>)[c.clave] = despues
      cambios.push({ id: `${id}:${c.campo}:${e.cambiosRegulatorios.length + cambios.length}`, productoId: id, campo: c.campo, antes, despues, usuario: actor.nombre, ts: new Date().toISOString(), motivo: motivo.trim() })
    }
    // D-38: presentación y principio activo viven en el catálogo, con el mismo historial
    for (const c of CAMPOS_CATALOGO) {
      const crudo = (v.datos as Record<string, string | undefined>)[c.clave]
      if (crudo === undefined) continue
      const despues = crudo.trim() || undefined
      const antes = prod[c.clave]
      if (antes === despues) continue
      prod[c.clave] = despues
      cambios.push({ id: `${id}:${c.campo}:${e.cambiosRegulatorios.length + cambios.length}`, productoId: id, campo: c.campo, antes, despues, usuario: actor.nombre, ts: new Date().toISOString(), motivo: motivo.trim() })
    }
    prod.reg = nuevo
    e.cambiosRegulatorios.unshift(...cambios.reverse())
    if (cambios.length) registrar(e, actor, 'regulatorio_editado', 'producto_regulatorio', prod.codigo, `Datos regulatorios actualizados (${cambios.length})`, motivo.trim())
    return { ok: true, cambios: cambios.length }
  }

  async historialRegulatorio(id: string): Promise<CambioRegulatorio[]> {
    return estado().cambiosRegulatorios.filter((c) => c.productoId === id)
  }
}
