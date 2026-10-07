import type { EventoAuditoria } from '@/domain/tipos'
import type { Panorama, ProductoConReg } from '@/domain/panorama'
import { autorizarAltaProducto, autorizarValidacion, validarEntradaProducto, type EntradaProducto } from '@/domain/productos'
import { construirPanoramaDemo, sumarDias } from './datos'
import type { Actor, Repositorio, ResultadoAccion } from '../repositorio'

interface EstadoDemo {
  panorama: Panorama
  auditoria: EventoAuditoria[]
  contador: number
}

/** Estado en memoria, por instancia del servidor. En Vercel puede reiniciarse: es una DEMO. */
const g = globalThis as unknown as { __wmsDemo?: EstadoDemo }

function estado(): EstadoDemo {
  const hoy = new Date().toISOString().slice(0, 10)
  if (!g.__wmsDemo || g.__wmsDemo.panorama.hoy !== hoy) {
    const panorama = construirPanoramaDemo(hoy)
    const ts = (dias: number, h: string) => `${sumarDias(hoy, dias)}T${h}:00Z`
    g.__wmsDemo = {
      panorama,
      contador: 6,
      auditoria: [
        { id: 6, ts: ts(0, '08:12'), actor: 'Dirección Técnica (demo)', evento: 'producto_validado', entidad: 'producto_regulatorio', entidadId: 'DEMO-019', detalle: 'Registro sanitario validado' },
        { id: 5, ts: ts(0, '07:40'), actor: 'Asistente DT (demo)', evento: 'producto_creado', entidad: 'productos', entidadId: 'DEMO-020', detalle: 'Alta de producto' },
        { id: 4, ts: ts(-1, '16:05'), actor: 'Administración (demo)', evento: 'update', entidad: 'asignaciones_posicion', entidadId: 'G-7.1', detalle: 'Asignación de AJR Labs registrada desde la adenda (por confirmar firma)' },
        { id: 3, ts: ts(-1, '15:50'), actor: 'Administración (demo)', evento: 'insert', entidad: 'posiciones', entidadId: 'A-27.1', detalle: 'Posición creada: el rack A llega a A-27' },
        { id: 2, ts: ts(-2, '11:20'), actor: 'Administración (demo)', evento: 'insert', entidad: 'propietarios', entidadId: 'AJR_LABS', detalle: 'Propietario creado' },
        { id: 1, ts: ts(-2, '11:00'), actor: 'Administración (demo)', evento: 'insert', entidad: 'usuario_roles', entidadId: 'direccion_tecnica', detalle: 'Rol asignado' },
      ],
    }
  }
  return g.__wmsDemo
}

function registrar(e: EstadoDemo, actor: Actor, evento: string, entidad: string, entidadId: string, detalle: string, motivo?: string) {
  e.contador += 1
  e.auditoria.unshift({ id: e.contador, ts: new Date().toISOString(), actor: actor.nombre, evento, entidad, entidadId, detalle, motivo })
}

export class RepositorioDemo implements Repositorio {
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
        estadoValidacion: 'PENDIENTE', creadoPor: actor.id,
      },
    }
    e.panorama.productos.push(prod)
    registrar(e, actor, 'producto_creado', 'productos', codigo, 'Alta de producto (pendiente de validar)')
    return { ok: true, id }
  }

  async decidirProducto(id: string, decision: 'VALIDADO' | 'OBSERVADO', observacion: string | undefined, actor: Actor): Promise<ResultadoAccion> {
    const permiso = autorizarValidacion(actor.roles)
    if (permiso) return { ok: false, mensaje: permiso }
    const e = estado()
    const prod = e.panorama.productos.find((p) => p.id === id)
    if (!prod?.reg) return { ok: false, mensaje: 'El producto no tiene datos regulatorios cargados.' }
    if (decision === 'VALIDADO' && (!prod.reg.registroSanitario || !prod.reg.rsVence)) {
      return { ok: false, mensaje: 'Para validar hacen falta el registro sanitario y su vencimiento.' }
    }
    if (decision === 'OBSERVADO' && !observacion?.trim()) {
      return { ok: false, mensaje: 'Al observar un producto hay que decir qué falta o qué está mal.' }
    }
    prod.reg = {
      ...prod.reg, estadoValidacion: decision, observacion: observacion?.trim() || undefined,
      validadoPor: decision === 'VALIDADO' ? actor.id : undefined, validadoEn: decision === 'VALIDADO' ? new Date().toISOString() : undefined,
    }
    registrar(e, actor, `producto_${decision.toLowerCase()}`, 'producto_regulatorio', prod.codigo,
      decision === 'VALIDADO' ? 'Registro sanitario validado' : 'Producto observado', observacion)
    return { ok: true }
  }
}
