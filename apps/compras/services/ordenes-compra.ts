import 'server-only'
import { crearClienteServidor } from '@logisalud/auth/server'
import { exigirUsuario } from '@logisalud/auth/server'
import { perfilActual } from '@logisalud/auth/server'
import {
  siguienteCodigoOC,
  transicionPermitida,
  puedeEditarse,
  puedeCerrarseParcial,
  ETIQUETA_ESTADO,
  type BorradorOC,
  type EstadoOC,
} from '@/domain/orden-compra'

export type OCListada = {
  id: string
  codigo: string
  estado: EstadoOC
  fecha_emision: string
  moneda: string
  proveedor: { razon_social: string; ruc: string } | null
  total: number
}

export type OCDetalle = {
  id: string
  codigo: string
  tipo: 'mercaderia' | 'bien'
  estado: EstadoOC
  fecha_emision: string
  fecha_entrega_estimada: string | null
  moneda: string
  condiciones_pago_dias: number | null
  notas: string | null
  proveedor_id: string
  cuenta_bancaria_id: string | null
  cierre_tipo: 'completa' | 'saldo_no_entregado' | null
  cierre_motivo: string | null
  items: {
    id: string
    producto_id: string | null
    descripcion_libre: string | null
    cantidad_pedida: number
    precio_unitario: number
    cantidad_recibida: number
    cantidad_facturada: number
    producto: { codigo: string; descripcion: string; unidad_medida: string } | null
  }[]
}

export async function listarOC(estado?: EstadoOC): Promise<OCListada[]> {
  const supabase = crearClienteServidor()
  let q = supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(`id, codigo, estado, fecha_emision, moneda,
             proveedor:proveedores(razon_social, ruc),
             ordenes_compra_items(cantidad_pedida, precio_unitario)`)
    .order('codigo', { ascending: false })
    .limit(100)

  if (estado) q = q.eq('estado', estado)

  const { data, error } = await q
  if (error) throw new Error(`No se pudieron listar las órdenes: ${error.message}`)

  // El total se arma acá y no en la base: `subtotal` de los items es una
  // columna generada por línea, pero el total con IGV es una regla de dominio
  // (ver calcularTotales) y no debe duplicarse en SQL.
  return (data ?? []).map((oc: any) => ({
    id: oc.id,
    codigo: oc.codigo,
    estado: oc.estado,
    fecha_emision: oc.fecha_emision,
    moneda: oc.moneda,
    proveedor: Array.isArray(oc.proveedor) ? oc.proveedor[0] ?? null : oc.proveedor,
    total: (oc.ordenes_compra_items ?? []).reduce(
      (acc: number, i: any) => acc + Number(i.cantidad_pedida) * Number(i.precio_unitario),
      0
    ),
  }))
}

export async function obtenerOC(id: string): Promise<OCDetalle | null> {
  const supabase = crearClienteServidor()
  const { data, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select(`id, codigo, tipo, estado, fecha_emision, fecha_entrega_estimada, moneda,
             condiciones_pago_dias, notas, proveedor_id, cuenta_bancaria_id,
             cierre_tipo, cierre_motivo,
             ordenes_compra_items(id, producto_id, descripcion_libre, cantidad_pedida,
                                  precio_unitario, cantidad_recibida, cantidad_facturada)`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la orden: ${error.message}`)
  if (!data) return null

  // El producto vive en catalogo.productos, otro schema: PostgREST no lo
  // embebe desde compras, así que se resuelve en una segunda consulta. Una OC
  // de "bien" no tiene producto_id en ninguna línea — el Map queda vacío y
  // cada línea muestra su descripcion_libre en vez de un producto de catálogo.
  const ids = ((data as any).ordenes_compra_items ?? [])
    .map((i: any) => i.producto_id)
    .filter((id: string | null): id is string => id != null)
  const productos = ids.length ? await mapaProductos(ids) : new Map()

  return {
    ...(data as any),
    items: ((data as any).ordenes_compra_items ?? []).map((i: any) => ({
      ...i,
      producto: productos.get(i.producto_id) ?? null,
    })),
  }
}

async function mapaProductos(ids: string[]) {
  const supabase = crearClienteServidor()
  const { data } = await supabase
    .schema('catalogo')
    .from('productos')
    .select('id, codigo, descripcion, unidad_medida')
    .in('id', ids)
  return new Map((data ?? []).map((p: any) => [p.id, p]))
}

/** Busca productos para el combobox. El catálogo no cabe en un <select>. */
export async function buscarProductos(termino: string) {
  const supabase = crearClienteServidor()
  const t = termino.trim()
  if (!t) return []

  const { data, error } = await supabase
    .schema('catalogo')
    .from('productos')
    .select('id, codigo, descripcion, unidad_medida')
    .eq('estado', 'activo')
    .or(`codigo.ilike.%${t}%,descripcion.ilike.%${t}%`)
    .order('descripcion')
    .limit(20)

  if (error) throw new Error(`No se pudieron buscar productos: ${error.message}`)
  return data ?? []
}

/**
 * Crea la OC en borrador con sus líneas.
 *
 * El código se calcula desde el último del año y no contando filas: contar
 * daría el mismo número dos veces si alguna OC se borrara, y `codigo` es
 * unique. Si dos personas crean una OC en el mismo instante, la segunda choca
 * con el unique y se reintenta — mejor que un correlativo con huecos.
 */
export async function crearOC(
  borrador: BorradorOC & { notas?: string | null; cuentaBancariaId?: string | null }
) {
  const usuario = await exigirUsuario()
  const supabase = crearClienteServidor()
  const anio = Number(borrador.fechaEmision.slice(0, 4))

  const { data: ultima } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('codigo')
    .like('codigo', `OC-${anio}-%`)
    .order('codigo', { ascending: false })
    .limit(1)
    .maybeSingle()

  const codigo = siguienteCodigoOC(anio, ultima?.codigo ?? null)

  const { data: oc, error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .insert({
      codigo,
      tipo: borrador.tipo ?? 'mercaderia',
      proveedor_id: borrador.proveedorId,
      cuenta_bancaria_id: borrador.cuentaBancariaId ?? null,
      fecha_emision: borrador.fechaEmision,
      fecha_entrega_estimada: borrador.fechaEntregaEstimada ?? null,
      moneda: borrador.moneda,
      condiciones_pago_dias: borrador.condicionesPagoDias ?? null,
      estado: 'borrador',
      notas: borrador.notas ?? null,
      creado_por: usuario.id,
    })
    .select('id, codigo')
    .single()

  if (error) {
    if (error.code === '23505' || /duplicate key/i.test(error.message)) {
      throw new Error(
        `El código ${codigo} se acaba de usar en otra orden. Vuelve a guardar y se toma el siguiente.`
      )
    }
    throw new Error(`No se pudo crear la orden: ${error.message}`)
  }

  const { error: errorItems } = await supabase.schema('compras').from('ordenes_compra_items').insert(
    borrador.lineas.map((l) => ({
      oc_id: oc.id,
      producto_id: 'productoId' in l ? l.productoId : null,
      descripcion_libre: 'descripcionLibre' in l ? l.descripcionLibre : null,
      cantidad_pedida: l.cantidadPedida,
      precio_unitario: l.precioUnitario,
    }))
  )

  if (errorItems) {
    // La cabecera quedó sin líneas: se borra para no dejar una OC vacía con un
    // número correlativo consumido a medias.
    await supabase.schema('compras').from('ordenes_compra').delete().eq('id', oc.id)
    throw new Error(`No se pudieron guardar las líneas: ${errorItems.message}`)
  }

  return oc
}

/**
 * Edita cabecera y líneas de una OC en 'borrador' o 'enviada' (ver
 * domain/orden-compra.ts::puedeEditarse) — Sebas encontró que el texto "En
 * borrador: todavía se puede editar" no tenía ningún botón atrás.
 *
 * Las líneas se reemplazan enteras (borrar + insertar) en vez de hacer un
 * diff línea por línea: mientras se puede editar todavía no hay recepción
 * contra esta OC (Almacén solo recibe desde 'confirmada' — ver
 * puedeRecibirse), así que no hay `cantidad_recibida`/`cantidad_facturada`
 * que se pueda perder al reinsertar.
 */
export async function actualizarOC(
  id: string,
  borrador: BorradorOC & { notas?: string | null }
): Promise<void> {
  const supabase = crearClienteServidor()

  const { data: oc, error: errorLectura } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('estado')
    .eq('id', id)
    .maybeSingle()
  if (errorLectura || !oc) throw new Error('No se encontró la orden de compra.')
  if (!puedeEditarse(oc.estado as EstadoOC)) {
    throw new Error(`Ya no se puede editar: está "${ETIQUETA_ESTADO[oc.estado as EstadoOC]}".`)
  }

  const { error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .update({
      proveedor_id: borrador.proveedorId,
      fecha_emision: borrador.fechaEmision,
      fecha_entrega_estimada: borrador.fechaEntregaEstimada ?? null,
      moneda: borrador.moneda,
      condiciones_pago_dias: borrador.condicionesPagoDias ?? null,
      notas: borrador.notas ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`No se pudo actualizar la orden: ${error.message}`)

  const { error: errorBorrado } = await supabase
    .schema('compras')
    .from('ordenes_compra_items')
    .delete()
    .eq('oc_id', id)
  if (errorBorrado) throw new Error(`No se pudieron actualizar las líneas: ${errorBorrado.message}`)

  const { error: errorItems } = await supabase.schema('compras').from('ordenes_compra_items').insert(
    borrador.lineas.map((l) => ({
      oc_id: id,
      producto_id: 'productoId' in l ? l.productoId : null,
      descripcion_libre: 'descripcionLibre' in l ? l.descripcionLibre : null,
      cantidad_pedida: l.cantidadPedida,
      precio_unitario: l.precioUnitario,
    }))
  )
  if (errorItems) throw new Error(`No se pudieron guardar las líneas: ${errorItems.message}`)
}

/**
 * Los dos pasos manuales del ciclo antes de poder recibir mercadería —
 * "Enviar al proveedor" (borrador → enviada) y "Confirmar" (enviada →
 * confirmada, el proveedor aceptó el pedido). Ninguno manda correo ni nada
 * automático: decisión explícita, es Compras quien avisa al proveedor por
 * su cuenta (correo, WhatsApp) y confirma acá cuando ya lo hizo — separado
 * de solo descargar el PDF, para no asumir que descargar es lo mismo que
 * mandarlo. Sin este paso ninguna OC llega nunca a 'confirmada', y sin eso
 * Almacén no puede recibir nada contra ella (ver domain/orden-compra.ts::
 * puedeRecibirse) — bug real encontrado auditando el ciclo completo.
 */
export async function cambiarEstadoOC(id: string, nuevoEstado: EstadoOC): Promise<void> {
  const supabase = crearClienteServidor()

  const { data: oc, error: errorLectura } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('estado')
    .eq('id', id)
    .maybeSingle()
  if (errorLectura || !oc) throw new Error('No se encontró la orden de compra.')

  if (!transicionPermitida(oc.estado as EstadoOC, nuevoEstado)) {
    throw new Error(`No se puede pasar de "${oc.estado}" a "${nuevoEstado}".`)
  }

  const { error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`No se pudo actualizar el estado: ${error.message}`)
}

/**
 * Cierre manual de una OC con saldo pendiente que ya no se va a completar
 * (0030_oc_cierre_parcial.sql). Acción explícita de Compras/admin, con
 * motivo obligatorio — no cambia el `estado` (sigue el CHECK existente,
 * pasa a 'cerrada' igual que el cierre normal) sino que deja registrado
 * `cierre_tipo = 'saldo_no_entregado'` y el motivo, para distinguirla de
 * una OC cerrada por el flujo normal (recibida y facturada completa, que
 * deja esas dos columnas en null).
 */
export async function cerrarOCConSaldoPendiente(id: string, motivo: string): Promise<void> {
  const perfil = await perfilActual()
  const puedeCerrar = perfil?.area === 'admin' || perfil?.area === 'compras'
  if (!puedeCerrar) {
    throw new Error('Solo Compras (o admin) puede cerrar una orden con saldo pendiente.')
  }
  if (!motivo.trim()) {
    throw new Error('El motivo del cierre es obligatorio.')
  }

  const supabase = crearClienteServidor()
  const { data: oc, error: errLectura } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .select('estado')
    .eq('id', id)
    .maybeSingle()
  if (errLectura || !oc) throw new Error('No se encontró la orden de compra.')
  if (!puedeCerrarseParcial(oc.estado as EstadoOC)) {
    throw new Error(`La orden está en estado "${ETIQUETA_ESTADO[oc.estado as EstadoOC]}" — solo una orden recibida en parte se puede cerrar con saldo pendiente.`)
  }

  const { error } = await supabase
    .schema('compras')
    .from('ordenes_compra')
    .update({
      estado: 'cerrada',
      cierre_tipo: 'saldo_no_entregado',
      cierre_motivo: motivo.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(`No se pudo cerrar la orden: ${error.message}`)
}
