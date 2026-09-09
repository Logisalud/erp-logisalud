'use server'

import { crearProveedorUnificado } from '@/services/proveedores-unificado'
import { validarProveedor, type TipoProveedorUnificado } from '@/domain/proveedor'

export type ProveedorRapido = {
  id: string
  nombre: string
  condicionPagoDias: number
  moneda: string
  fuente: 'compra' | 'servicio'
}

export type ResultadoProveedorRapido =
  | { proveedor: ProveedorRapido }
  | { errores: { campo: string; mensaje: string }[] }

/**
 * Alta de proveedor "sin salir de la pantalla" — el combobox de OC/OC de
 * bien/Pago Directo (components/buscador-proveedor.tsx) la llama cuando la
 * persona necesita un proveedor que todavía no existe, en vez de mandarla a
 * /proveedores/nuevo y perder lo que ya escribió en el formulario que
 * estaba llenando. Mismas reglas y mismo destino final (compras.proveedores
 * o servicios.proveedores_servicio) que el alta completa — ver
 * crearProveedorUnificado.
 */
export async function crearProveedorRapidoAction(datos: {
  tipo: TipoProveedorUnificado
  ruc: string
  razonSocial: string
  condicionPagoDias: number
  monedaPrincipal: string
}): Promise<ResultadoProveedorRapido> {
  const borrador = {
    tipo: datos.tipo,
    ruc: datos.ruc.trim(),
    razonSocial: datos.razonSocial.trim(),
    condicionPagoDias: datos.condicionPagoDias,
    monedaPrincipal: datos.monedaPrincipal,
  }

  const errores = validarProveedor(borrador)
  if (errores.length > 0) return { errores }

  try {
    const { id, fuente } = await crearProveedorUnificado(borrador)
    return {
      proveedor: {
        id,
        nombre: `${borrador.razonSocial} — RUC ${borrador.ruc}`,
        condicionPagoDias: borrador.condicionPagoDias,
        moneda: borrador.monedaPrincipal,
        fuente,
      },
    }
  } catch (e) {
    return {
      errores: [{ campo: 'general', mensaje: e instanceof Error ? e.message : 'No se pudo registrar el proveedor.' }],
    }
  }
}
