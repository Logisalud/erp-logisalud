import 'server-only'

import { crearClienteServidor } from '@logisalud/auth/server'
import { bandejaDeFila, puedeActualizarBandeja, type ImportacionVista, type PedidoSnapshot, type ResumenImportacion } from '@/domain/pedidos-despacho'
import type { Actor, ResultadoAccion } from '../repositorio'
import type { BandejaPedidos, RepositorioPedidos } from '../repositorio-pedidos'
import { fuenteReal } from '../pedidos/fuente-actual'
import { traerPedidos } from '../pedidos/importar'
import { nombresDe } from './entradas-supabase'
import { OperacionSupabase } from './operacion-supabase'
import { mensajeHumano, PAGINA, rpc, s, type Fila } from './util'
import { ordenPaginado } from './claves'

// ESTE ADAPTADOR NO SE EJECUTÓ CONTRA UNA BASE REAL (misma limitación que los demás). Está verificado contra el contrato de las funciones SQL de la
// migración 0014 (probada en Postgres local) y por tipos. Las reglas las aplica la base de datos con la sesión de la persona.

const sch = () => crearClienteServidor().schema('wms')

function vistaImportacion(r: Fila, nombres: Map<string, string>): ImportacionVista {
  const ok = Boolean(r.ok)
  return {
    id: String(r.id), en: String(r.en), por: nombres.get(String(r.por)) ?? 'Usuario', origen: String(r.origen), ok, mensaje: s(r.mensaje),
    resumen: ok ? {
      nuevos: Number(r.nuevos), nuevasVersiones: Number(r.nuevas_versiones), iguales: Number(r.iguales), antiguas: Number(r.antiguas),
      descartados: Array.isArray(r.descartados) ? r.descartados.length : 0,
    } : undefined,
  }
}

export class PedidosSupabase extends OperacionSupabase implements RepositorioPedidos {
  async bandejaPedidos(): Promise<BandejaPedidos> {
    // Los pedidos vigentes, por páginas y con orden determinista (la bandeja puede crecer más allá de 1.000 filas)
    const filas: Fila[] = []
    for (let desde = 0; ; desde += PAGINA) {
      let q = sch().from('pedidos_despacho').select('*').eq('vigente', true)
      for (const c of ordenPaginado('pedidos_despacho', 'wms', ['fecha'])) q = q.order(c)
      const { data, error } = await q.range(desde, desde + PAGINA - 1)
      if (error) throw new Error(`No se pudo leer la bandeja de pedidos: ${error.message}`)
      filas.push(...((data ?? []) as Fila[]))
      if (!data || data.length < PAGINA) break
    }
    const { data: imp, error: e2 } = await sch().from('importaciones_pedidos').select('*').order('en', { ascending: false }).limit(30)
    if (e2) throw new Error(`No se pudieron leer las importaciones: ${e2.message}`)
    const importaciones = (imp ?? []) as Fila[]
    const idsSalida = [...new Set(filas.map((f) => s(f.salida_id)).filter((x): x is string => !!x))]
    const salidas = new Map<string, string>()
    if (idsSalida.length) {
      const { data } = await sch().from('salidas').select('id, numero').in('id', idsSalida)
      for (const r of (data ?? []) as Fila[]) salidas.set(String(r.id), String(r.numero))
    }
    const codigos = [...new Set(filas.flatMap((f) => ((f.snapshot as PedidoSnapshot).lineas ?? []).map((l) => l.productoCodigo)))]
    const enCatalogo = new Set<string>()
    for (let i = 0; i < codigos.length; i += 200) {
      const { data } = await crearClienteServidor().schema('catalogo').from('productos').select('codigo').in('codigo', codigos.slice(i, i + 200))
      for (const r of (data ?? []) as Fila[]) enCatalogo.add(String(r.codigo))
    }
    const nombres = await nombresDe(importaciones.map((r) => String(r.por)))
    const vistas = importaciones.map((r) => vistaImportacion(r, nombres))
    return {
      pedidos: filas.map((f) => bandejaDeFila({
        id: String(f.id), snapshot: f.snapshot as PedidoSnapshot, cambios: (Array.isArray(f.cambios) ? f.cambios : []) as string[], cambioPendiente: Boolean(f.cambio_pendiente),
        salida: f.salida_id ? salidas.get(String(f.salida_id)) : undefined, salidaId: s(f.salida_id), importadoEn: String(f.importado_en), codigosEnCatalogo: enCatalogo,
      })),
      ultimoIntento: vistas[0] ?? null,
      ultimaExitosa: vistas.find((v) => v.ok) ?? null,
    }
  }

  async actualizarBandeja(actor: Actor): Promise<ResultadoAccion<{ resumen: ResumenImportacion }>> {
    if (!puedeActualizarBandeja(actor.roles)) return { ok: false, mensaje: 'No tienes permiso para actualizar la bandeja de pedidos' }
    const r = await traerPedidos(fuenteReal())
    if (!r.ok) {
      // queda el intento fallido y lo ya importado no se toca
      await rpc('registrar_importacion_pedidos', { p_origen: r.origen, p_pedidos: null, p_error: r.mensaje })
      return { ok: false, mensaje: r.mensaje }
    }
    const { data, error } = await rpc('registrar_importacion_pedidos', { p_origen: r.origen, p_pedidos: r.pedidos, p_error: null })
    if (error) return { ok: false, mensaje: mensajeHumano(error) }
    const d = data as { nuevos: number; nuevas_versiones: number; iguales: number; antiguas: number; descartados: { referencia?: string; motivo: string }[] }
    return {
      ok: true,
      resumen: {
        nuevos: d.nuevos, nuevasVersiones: d.nuevas_versiones, iguales: d.iguales, antiguas: d.antiguas,
        descartados: [...r.descartados, ...(d.descartados ?? []).map((x, i) => ({ indice: -(i + 1), referencia: x.referencia, motivo: x.motivo }))],
      },
    }
  }

  async revisarCambioPedido(pedidoId: string, _actor: Actor): Promise<ResultadoAccion> {
    const { error } = await rpc('revisar_cambio_pedido', { p_pedido_id: pedidoId })
    return error ? { ok: false, mensaje: mensajeHumano(error) } : { ok: true }
  }
}
