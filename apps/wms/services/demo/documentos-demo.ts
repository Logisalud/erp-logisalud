// Documentos regulatorios (S6a), en memoria (modo demostración). Aplica las mismas reglas que la migración 0016.
import { createHash } from 'node:crypto'
import {
  ETIQUETA_TIPO_DOCUMENTO, estadoDocumento, evaluarRequisitos, motivoNoPuedeSubir, puedeCargarCoaEnBloque, puedeDefinirPerfiles, relacionarCoa, resumirDocumentos,
  validarArchivo, validarVigencia,
  type ArchivoCarga, type CandidatoCoa, type DocumentoRegulatorio, type DocumentoVista, type EntradaSubida, type FabricanteVista, type ItemCoaVista,
  type LoteParaRelacionar, type OpcionAlcance, type PanoramaDocumentos, type PerfilDocumental, type RequisitoDocumental, type ResumenCargaCoa, type TipoDocumento,
} from '@/domain/documentos'
import { normalizar } from '@/domain/busqueda'
import { sumarDias } from './datos'
import { registrar, type EstadoDemo } from './estado'
import { ahora, estadoE, falla, nuevoId } from './entradas-demo'
import { CambioPedidoDemo } from './cambio-pedido-demo'
import type { RepositorioDocumentos } from '../repositorio-documentos'
import type { Actor, ResultadoAccion } from '../repositorio'
import { nombrePersonaDemo } from '@/lib/sesion-demo'

export interface DocsDemoEstado {
  documentos: DocumentoRegulatorio[]
  fabricantes: FabricanteVista[]
  perfiles: PerfilDocumental[]
  items: (ItemCoaVista & { hash: string; ref: string; bytes: number })[]
  sembrado: boolean
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

function docs(e: EstadoDemo): DocsDemoEstado {
  if (!e.docs) e.docs = { documentos: [], fabricantes: [], perfiles: [], items: [], sembrado: false }
  const d = e.docs
  if (!d.sembrado) {
    d.sembrado = true
    const hoy = e.panorama.hoy
    const prods = e.panorama.productos.filter((p) => p.estado === 'activo')
    // Fabricantes: los nombres que ya había como texto, sin repetir
    const nombres = Array.from(new Set(prods.map((p) => p.reg?.fabricante).filter((x): x is string => !!x))).slice(0, 4)
    for (const n of nombres.length ? nombres : ['Laboratorios Demo S.A.']) d.fabricantes.push({ id: nuevoId(), nombre: n })
    const nuevo = (tipo: TipoDocumento, alcanceId: string, alcance: string, nombre: string, desde: string, hasta: string | undefined, por = 'demo:direccion_tecnica'): void => {
      d.documentos.push({
        id: nuevoId(), tipo, alcanceId, alcance, nombreArchivo: nombre, archivoRef: `demo/${nombre}`, hash: sha(`${tipo}${alcanceId}${nombre}`), bytes: 120_000,
        vigenteDesde: desde, vigenteHasta: hasta, subidoPor: por, subidoEn: `${desde}T14:00:00Z`,
      })
    }
    // Registro sanitario de los primeros productos: uno por vencer y uno vencido, para ver las alertas
    prods.slice(0, 6).forEach((p, i) => {
      const hasta = i === 1 ? sumarDias(hoy, 20) : i === 2 ? sumarDias(hoy, -5) : sumarDias(hoy, 400 + i * 30)
      nuevo('REGISTRO_SANITARIO', p.id, `${p.codigo} · ${p.descripcion}`, `RS-${p.codigo}.pdf`, sumarDias(hoy, -700), hasta)
    })
    // BPM del primer fabricante
    nuevo('BPM', d.fabricantes[0].id, d.fabricantes[0].nombre, `BPM-${d.fabricantes[0].nombre.split(' ')[0]}.pdf`, sumarDias(hoy, -300), sumarDias(hoy, 430))
    // COA de los primeros lotes; el resto queda «sin COA»
    const loteDe = new Map(e.panorama.lotes.map((l) => [l.id, l]))
    const conStock = Array.from(new Set(e.panorama.saldos.filter((s) => s.cantidad > 0).map((s) => s.loteId)))
    conStock.slice(0, 14).forEach((id) => {
      const l = loteDe.get(id)!
      const p = e.panorama.productos.find((x) => x.id === l.productoId)
      nuevo('COA', id, `${l.codigo} · ${p?.descripcion ?? ''}`, `COA-${l.codigo}.pdf`, sumarDias(hoy, -120), undefined, 'demo:auxiliar')
    })
    // Perfiles de los clientes de la bandeja de pedidos de demostración
    d.perfiles.push(
      { ruc: '20512345671', exigeCoa: true, exigeRegistroSanitario: true, exigeBpm: true, copias: 2, nota: 'Pide original y una copia' },
      { ruc: '20698765432', exigeCoa: true, exigeRegistroSanitario: true, exigeBpm: false, copias: 1 },
      { ruc: '20456789123', exigeCoa: true, exigeRegistroSanitario: false, exigeBpm: false, copias: 1, nota: 'Solo COA por lote' },
    )
    // Archivos de una carga anterior que no se pudieron relacionar
    const mk = (nombre: string, motivo: string, candidatos: CandidatoCoa[] = []) => d.items.push({
      id: nuevoId(), nombreArchivo: nombre, estado: 'POR_REVISAR', motivo, candidatos, cargadoEn: `${sumarDias(hoy, -2)}T10:00:00Z`, hash: sha(nombre), ref: `demo/pendientes/${nombre}`, bytes: 98_000,
    })
    mk('scan0001.pdf', 'No encontramos en el nombre ningún lote conocido.')
    mk('COA lote X-9999 pendiente.pdf', 'No encontramos en el nombre ningún lote conocido.')
    // Los dos candidatos son lotes que todavía no tienen COA
    const l0 = loteDe.get(conStock[14]), l1 = loteDe.get(conStock[15])
    if (l0 && l1) {
      const c = (l: typeof l0): CandidatoCoa => ({ loteId: l.id, lote: l.codigo, producto: e.panorama.productos.find((p) => p.id === l.productoId)?.descripcion ?? '' })
      mk('COA ambiguo.pdf', 'El nombre coincide con 2 lotes: elige el correcto.', [c(l0), c(l1)])
    }
  }
  return d
}

function lotesParaRelacionar(e: EstadoDemo): LoteParaRelacionar[] {
  const prod = new Map(e.panorama.productos.map((p) => [p.id, p]))
  return e.panorama.lotes.map((l) => ({ id: l.id, codigo: l.codigo, productoId: l.productoId, productoCodigo: prod.get(l.productoId)?.codigo ?? '', productoDescripcion: prod.get(l.productoId)?.descripcion ?? '' }))
}

const vigenteDe = (d: DocsDemoEstado, tipo: TipoDocumento, alcanceId: string) =>
  d.documentos.find((x) => x.tipo === tipo && x.alcanceId === alcanceId && !d.documentos.some((r) => r.reemplazaA === x.id))

function etiquetaAlcance(e: EstadoDemo, d: DocsDemoEstado, tipo: TipoDocumento, id: string): string | undefined {
  if (tipo === 'COA') { const l = e.panorama.lotes.find((x) => x.id === id); if (!l) return; return `${l.codigo} · ${e.panorama.productos.find((p) => p.id === l.productoId)?.descripcion ?? ''}` }
  if (tipo === 'REGISTRO_SANITARIO') { const p = e.panorama.productos.find((x) => x.id === id); return p ? `${p.codigo} · ${p.descripcion}` : undefined }
  return d.fabricantes.find((f) => f.id === id)?.nombre
}

export class DocumentosDemo extends CambioPedidoDemo implements RepositorioDocumentos {
  async panoramaDocumentos(): Promise<PanoramaDocumentos> {
    const e = estadoE(); const d = docs(e); const hoy = e.panorama.hoy
    const vista: DocumentoVista[] = d.documentos.map((x) => {
      const reemplazo = d.documentos.find((r) => r.reemplazaA === x.id)
      return { ...x, estado: estadoDocumento(x, hoy, !!reemplazo), reemplazadoPor: reemplazo?.id, subidoPorNombre: nombrePersonaDemo(x.subidoPor) }
    })
    const conCoa = new Set(d.documentos.filter((x) => x.tipo === 'COA').map((x) => x.alcanceId))
    const lotes = new Map(e.panorama.lotes.map((l) => [l.id, l]))
    const unidades = new Map<string, number>()
    for (const s of e.panorama.saldos) if (s.cantidad > 0 && s.estado !== 'BAJAS_RECHAZADOS') unidades.set(s.loteId, (unidades.get(s.loteId) ?? 0) + s.cantidad)
    const sinCoa = [...unidades.entries()].filter(([id]) => !conCoa.has(id)).map(([id, u]) => {
      const l = lotes.get(id)!; const p = e.panorama.productos.find((x) => x.id === l.productoId)
      return { loteId: id, lote: l.codigo, productoId: l.productoId, producto: `${p?.codigo ?? ''} · ${p?.descripcion ?? ''}`, unidades: u, vence: l.vence }
    }).sort((a, b) => (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.lote.localeCompare(b.lote))
    const items = d.items.map(({ hash: _h, ref: _r, bytes: _b, ...i }) => i)
    return structuredClone({
      hoy, documentos: vista, fabricantes: d.fabricantes, perfiles: d.perfiles, lotesSinCoa: sinCoa, itemsCoa: items,
      resumen: resumirDocumentos(vista, sinCoa.length, items.filter((i) => i.estado === 'POR_REVISAR').length),
    })
  }

  async buscarAlcanceDocumento(tipo: TipoDocumento, consulta: string): Promise<OpcionAlcance[]> {
    const e = estadoE(); const d = docs(e); const q = normalizar(consulta.trim())
    if (tipo === 'BPM') return d.fabricantes.filter((f) => !q || normalizar(f.nombre).includes(q)).slice(0, 12).map((f) => ({ id: f.id, etiqueta: f.nombre }))
    if (tipo === 'REGISTRO_SANITARIO') return e.panorama.productos.filter((p) => p.estado === 'activo' && p.reg && (!q || normalizar(`${p.codigo} ${p.descripcion}`).includes(q))).slice(0, 12).map((p) => ({ id: p.id, etiqueta: p.descripcion, detalle: p.codigo }))
    const prod = new Map(e.panorama.productos.map((p) => [p.id, p]))
    return e.panorama.lotes.filter((l) => !q || normalizar(`${l.codigo} ${prod.get(l.productoId)?.descripcion ?? ''}`).includes(q)).slice(0, 12)
      .map((l) => ({ id: l.id, etiqueta: l.codigo, detalle: prod.get(l.productoId)?.descripcion }))
  }

  async subirDocumento(entrada: EntradaSubida, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); const d = docs(e)
    const vigente = vigenteDe(d, entrada.tipo, entrada.alcanceId)
    const no = motivoNoPuedeSubir(actor.roles, entrada.tipo, false) // mismo orden que la base: primero el permiso de subir ese tipo
    if (no) return falla(no)
    if (!entrada.reemplazaA && vigente) return falla('Ya hay un documento vigente: se reemplaza (solo Dirección Técnica), no se sube otro')
    if (entrada.reemplazaA) {
      if (!actor.roles.includes('direccion_tecnica')) return falla('Solo Dirección Técnica reemplaza un documento')
      if (vigente?.id !== entrada.reemplazaA) return falla('Ese documento ya fue reemplazado: reemplaza la versión vigente')
      if (!entrada.motivo?.trim()) return falla('Indica el motivo del reemplazo')
    }
    const alcance = etiquetaAlcance(e, d, entrada.tipo, entrada.alcanceId)
    if (!alcance) return falla(entrada.tipo === 'COA' ? 'No encontramos ese lote' : entrada.tipo === 'BPM' ? 'No encontramos ese fabricante' : 'El producto todavía no tiene datos regulatorios: cárgalos primero')
    const arch = validarArchivo(entrada.nombreArchivo, entrada.bytes); if (arch) return falla(arch)
    const vig = validarVigencia(entrada.vigenteDesde, entrada.vigenteHasta); if (vig) return falla(vig)
    const id = nuevoId()
    d.documentos.push({
      id, tipo: entrada.tipo, alcanceId: entrada.alcanceId, alcance, nombreArchivo: entrada.nombreArchivo, archivoRef: entrada.archivoRef, hash: entrada.hash, bytes: entrada.bytes,
      vigenteDesde: entrada.vigenteDesde ?? e.panorama.hoy, vigenteHasta: entrada.vigenteHasta, subidoPor: actor.id, subidoEn: ahora(), reemplazaA: entrada.reemplazaA, motivoReemplazo: entrada.motivo?.trim(),
    })
    registrar(e, actor, entrada.reemplazaA ? 'documento_reemplazado' : 'documento_subido', 'documentos_regulatorios', id, `${ETIQUETA_TIPO_DOCUMENTO[entrada.tipo]} de ${alcance}`, entrada.motivo?.trim())
    return { ok: true, id }
  }

  async crearFabricante(nombre: string, actor: Actor): Promise<ResultadoAccion<{ id: string }>> {
    const e = estadoE(); const d = docs(e)
    if (!actor.roles.includes('direccion_tecnica')) return falla('Solo Dirección Técnica crea fabricantes')
    const n = nombre.trim()
    if (n.length < 2 || n.length > 120) return falla('El nombre del fabricante debe tener entre 2 y 120 caracteres')
    const ya = d.fabricantes.find((f) => f.nombre.toLowerCase() === n.toLowerCase())
    if (ya) return { ok: true, id: ya.id }
    const id = nuevoId(); d.fabricantes.push({ id, nombre: n })
    registrar(e, actor, 'fabricante_creado', 'fabricantes', id, n)
    return { ok: true, id }
  }

  async guardarPerfilDocumental(perfil: PerfilDocumental, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const d = docs(e)
    if (!puedeDefinirPerfiles(actor.roles)) return falla('Solo Dirección Técnica y el Jefe de Transporte definen qué documentos exige un cliente')
    if (!/^\d{11}$/.test(perfil.ruc)) return falla('El RUC debe tener 11 dígitos')
    if (!Number.isInteger(perfil.copias) || perfil.copias < 1 || perfil.copias > 10) return falla('Las copias van de 1 a 10')
    const i = d.perfiles.findIndex((p) => p.ruc === perfil.ruc)
    const nuevo = { ...perfil, nota: perfil.nota?.trim() || undefined }
    if (i >= 0) d.perfiles[i] = nuevo; else d.perfiles.push(nuevo)
    registrar(e, actor, 'perfil_documental_guardado', 'perfil_documental_cliente', perfil.ruc, `Exige: ${[perfil.exigeCoa && 'COA', perfil.exigeRegistroSanitario && 'RS', perfil.exigeBpm && 'BPM'].filter(Boolean).join(', ') || 'nada'}`)
    return { ok: true }
  }

  async requisitosDocumentales(loteId: string, ruc?: string, entrega?: string): Promise<RequisitoDocumental[]> { return this.requisitosSync(loteId, ruc, entrega) }

  protected requisitosSync(loteId: string, ruc?: string, entrega?: string): RequisitoDocumental[] {
    const e = estadoE(); const d = docs(e)
    const l = e.panorama.lotes.find((x) => x.id === loteId)
    if (!l) return []
    const fab = e.panorama.productos.find((p) => p.id === l.productoId)?.reg?.fabricante
    const fabId = fab ? d.fabricantes.find((f) => f.nombre.toLowerCase() === fab.toLowerCase())?.id : undefined
    const perfil = ruc ? d.perfiles.find((p) => p.ruc === ruc) : undefined
    return evaluarRequisitos(perfil, {
      COA: vigenteDe(d, 'COA', loteId), REGISTRO_SANITARIO: vigenteDe(d, 'REGISTRO_SANITARIO', l.productoId), BPM: fabId ? vigenteDe(d, 'BPM', fabId) : undefined,
    }, e.panorama.hoy, entrega)
  }

  async cargarCoaEnBloque(archivos: ArchivoCarga[], actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenCargaCoa }>> {
    const e = estadoE(); const d = docs(e)
    if (!puedeCargarCoaEnBloque(actor.roles)) return falla('No tienes permiso para cargar COA en bloque')
    if (archivos.length === 0) return falla('No hay archivos para cargar')
    const lotes = lotesParaRelacionar(e)
    const r: ResumenCargaCoa = { total: archivos.length, importados: 0, porRevisar: 0, duplicados: 0 }
    for (const a of archivos) {
      const err = validarArchivo(a.nombre, a.bytes)
      const base = { id: nuevoId(), nombreArchivo: a.nombre, hash: a.hash, ref: a.ref, bytes: a.bytes, cargadoEn: ahora(), candidatos: [] as CandidatoCoa[] }
      if (err) { d.items.push({ ...base, estado: 'POR_REVISAR', motivo: err }); r.porRevisar++; continue }
      if (d.documentos.some((x) => x.tipo === 'COA' && x.hash === a.hash) || d.items.some((i) => i.hash === a.hash && (i.estado === 'IMPORTADO' || i.estado === 'POR_REVISAR'))) {
        d.items.push({ ...base, estado: 'DUPLICADO', motivo: 'Este mismo archivo ya está cargado.' }); r.duplicados++; continue
      }
      const rel = relacionarCoa(a.nombre, lotes)
      if (rel.estado === 'RELACIONADO') {
        if (vigenteDe(d, 'COA', rel.loteId)) { d.items.push({ ...base, estado: 'POR_REVISAR', loteId: undefined, motivo: 'El lote ya tiene un COA vigente: solo Dirección Técnica lo reemplaza.', candidatos: rel.candidatos }); r.porRevisar++; continue }
        const id = nuevoId()
        d.documentos.push({ id, tipo: 'COA', alcanceId: rel.loteId, alcance: `${rel.lote} · ${rel.producto}`, nombreArchivo: a.nombre, archivoRef: a.ref, hash: a.hash, bytes: a.bytes, vigenteDesde: e.panorama.hoy, subidoPor: actor.id, subidoEn: ahora() })
        d.items.push({ ...base, estado: 'IMPORTADO', loteId: rel.loteId, lote: rel.lote, candidatos: rel.candidatos }); r.importados++
      } else { d.items.push({ ...base, estado: 'POR_REVISAR', motivo: rel.motivo, candidatos: rel.candidatos }); r.porRevisar++ }
    }
    registrar(e, actor, 'carga_coa', 'cargas_coa', 'carga', `${r.total} archivos: ${r.importados} importados, ${r.porRevisar} por revisar, ${r.duplicados} duplicados`)
    return { ok: true, resumen: r }
  }

  async asignarItemCoa(itemId: string, loteId: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const d = docs(e)
    if (!puedeCargarCoaEnBloque(actor.roles)) return falla('No tienes permiso para resolver la carga de COA')
    const it = d.items.find((x) => x.id === itemId)
    if (!it) return falla('No encontramos ese archivo')
    if (it.estado !== 'POR_REVISAR') return falla('Ese archivo ya se resolvió')
    const alcance = etiquetaAlcance(e, d, 'COA', loteId)
    if (!alcance) return falla('No encontramos ese lote')
    if (vigenteDe(d, 'COA', loteId)) return falla('El lote ya tiene un COA vigente: solo Dirección Técnica lo reemplaza')
    const id = nuevoId()
    d.documentos.push({ id, tipo: 'COA', alcanceId: loteId, alcance, nombreArchivo: it.nombreArchivo, archivoRef: it.ref, hash: it.hash, bytes: it.bytes, vigenteDesde: e.panorama.hoy, subidoPor: actor.id, subidoEn: ahora() })
    it.estado = 'IMPORTADO'; it.loteId = loteId; it.lote = alcance.split(' · ')[0]; it.motivo = undefined
    registrar(e, actor, 'coa_asignado', 'cargas_coa_items', itemId, alcance)
    return { ok: true }
  }

  async descartarItemCoa(itemId: string, motivo: string, actor: Actor): Promise<ResultadoAccion> {
    const e = estadoE(); const d = docs(e)
    if (!puedeCargarCoaEnBloque(actor.roles)) return falla('No tienes permiso para resolver la carga de COA')
    if (!motivo.trim()) return falla('Indica por qué se descarta')
    const it = d.items.find((x) => x.id === itemId)
    if (!it) return falla('No encontramos ese archivo')
    if (it.estado !== 'POR_REVISAR') return falla('Ese archivo ya se resolvió')
    it.estado = 'DESCARTADO'; it.motivo = motivo.trim()
    registrar(e, actor, 'coa_descartado', 'cargas_coa_items', itemId, it.nombreArchivo, motivo.trim())
    return { ok: true }
  }

  async reintentarItemsCoa(actor: Actor): Promise<ResultadoAccion<{ asignados: number }>> {
    const e = estadoE(); const d = docs(e)
    if (!puedeCargarCoaEnBloque(actor.roles)) return falla('No tienes permiso para resolver la carga de COA')
    const lotes = lotesParaRelacionar(e)
    let n = 0
    for (const it of d.items.filter((x) => x.estado === 'POR_REVISAR')) {
      const rel = relacionarCoa(it.nombreArchivo, lotes)
      if (rel.estado === 'RELACIONADO' && !vigenteDe(d, 'COA', rel.loteId)) {
        const r = await this.asignarItemCoa(it.id, rel.loteId, actor)
        if (r.ok) n++
      } else { it.candidatos = rel.candidatos; if (rel.estado === 'POR_REVISAR') it.motivo = rel.motivo }
    }
    return { ok: true, asignados: n }
  }
}
