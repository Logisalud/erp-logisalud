'use server'

import { redirect } from 'next/navigation'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { crearOC } from '@/services/ordenes-compra'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { formatoMonto } from '@/domain/aviso-email'
import { calcularTotales, validarOC, type BorradorOC } from '@/domain/orden-compra'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearOrdenCompraBien(
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const lineas = leerLineas(form)

  const borrador: BorradorOC & { notas: string | null; cuentaBancariaId: string | null } = {
    tipo: 'bien',
    proveedorId: String(form.get('proveedorId') ?? ''),
    fechaEmision: String(form.get('fechaEmision') ?? ''),
    fechaEntregaEstimada: textoONull(form.get('fechaEntregaEstimada')),
    moneda: String(form.get('moneda') ?? 'PEN'),
    condicionesPagoDias: numeroONull(form.get('condicionesPagoDias')),
    notas: textoONull(form.get('notas')),
    cuentaBancariaId: textoONull(form.get('cuentaBancariaId')),
    lineas,
  }

  const errores = validarOC(borrador)
  if (errores.length > 0) return { errores }

  let oc: { id: string; codigo: string }
  try {
    oc = await crearOC(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  // Pieza K: aviso a Contabilidad al crear la orden.
  const totales = calcularTotales(lineas)
  const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
  const proveedorNombre = String(form.get('proveedorNombre') ?? '').trim()
  await avisarCreacionSinRomper({
    tipo: 'oc_bien',
    codigo: oc.codigo,
    monto: totales.total,
    moneda: borrador.moneda,
    referencia: proveedorNombre || 'Orden de compra',
    filas: [
      { etiqueta: 'Creada por', valor: perfil?.nombre ?? usuario.email ?? null },
      { etiqueta: 'Tipo', valor: 'OC de un bien' },
      { etiqueta: 'Proveedor', valor: proveedorNombre || null },
      { etiqueta: 'Monto', valor: formatoMonto(totales.total, borrador.moneda) },
      { etiqueta: 'Líneas', valor: String(lineas.length) },
      { etiqueta: 'Fecha emisión', valor: borrador.fechaEmision },
      {
        etiqueta: 'Condición pago',
        valor: borrador.condicionesPagoDias != null ? `${borrador.condicionesPagoDias} días` : null,
      },
    ],
    ruta: `/ordenes-compra/${oc.id}`,
    creadorCorreo: usuario.email ?? null,
  })

  redirect(`/ordenes-compra/${oc.id}`)
}

function leerLineas(form: FormData) {
  const descripciones = form.getAll('linea_descripcion').map(String)
  const cantidades = form.getAll('linea_cantidad').map(String)
  const precios = form.getAll('linea_precio').map(String)

  return descripciones
    .map((descripcionLibre, i) => ({
      descripcionLibre,
      cantidadPedida: Number(cantidades[i] ?? 0),
      precioUnitario: Number(precios[i] ?? 0),
    }))
    // Una fila totalmente vacía es una fila que la persona agregó y no usó:
    // se descarta en silencio en vez de hacerla fallar la validación.
    .filter((l) => l.descripcionLibre.trim() || l.cantidadPedida || l.precioUnitario)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

function numeroONull(v: FormDataEntryValue | null): number | null {
  const s = textoONull(v)
  return s == null ? null : Number(s)
}
