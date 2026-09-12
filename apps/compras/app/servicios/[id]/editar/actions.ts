'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { editarOS } from '@/services/servicios'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { formatoMonto } from '@/domain/aviso-email'
import { cambioExigeAviso } from '@/domain/edicion'
import { validarOS, type BorradorOS } from '@/domain/servicio'
import type { EstadoFormulario } from '@/app/servicios/nueva/actions'

/** Guardar la edición de una OS — mismo FormData y mismo `validarOS` que el
 * alta, porque es el mismo formulario. Ver domain/edicion.ts. */
export async function editarOSAction(
  osId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const borrador: BorradorOS = {
    proveedorServicioId: String(form.get('proveedorServicioId') ?? ''),
    descripcionServicio: String(form.get('descripcionServicio') ?? ''),
    montoEstimado: Number(form.get('montoEstimado') ?? 0),
    montoIncluyeIgv: parsearBooleano(form.get('montoIncluyeIgv')),
    moneda: String(form.get('moneda') ?? 'PEN') as 'PEN' | 'USD',
    condicionesPagoDias: form.get('condicionesPagoDias') ? Number(form.get('condicionesPagoDias')) : null,
    fechaEntregaEstimada: textoONull(form.get('fechaEntregaEstimada')),
  }

  const errores = validarOS(borrador)
  if (errores.length > 0) return { errores }

  let resultado: Awaited<ReturnType<typeof editarOS>>
  try {
    resultado = await editarOS(osId, borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  // Solo si cambió el monto: el jefe de área aprueba un importe, y si ese
  // importe cambia antes de que decida, tiene que enterarse.
  if (cambioExigeAviso(resultado.montoAntes, resultado.montoDespues)) {
    const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
    const proveedorNombre = String(form.get('proveedorNombre') ?? '').trim()
    await avisarCreacionSinRomper({
      tipo: 'os',
      codigo: resultado.codigo,
      monto: resultado.montoDespues,
      moneda: borrador.moneda,
      referencia: proveedorNombre || 'Orden de servicio',
      filas: [
        { etiqueta: 'Editada por', valor: perfil?.nombre ?? usuario.email ?? null },
        { etiqueta: 'Proveedor', valor: proveedorNombre || null },
        { etiqueta: 'Monto anterior', valor: formatoMonto(resultado.montoAntes, borrador.moneda) },
        { etiqueta: 'Monto nuevo', valor: formatoMonto(resultado.montoDespues, borrador.moneda) },
        { etiqueta: 'Servicio', valor: borrador.descripcionServicio },
      ],
      ruta: `/servicios/${osId}`,
      creadorCorreo: usuario.email ?? null,
    })
  }

  revalidatePath(`/servicios/${osId}`)
  redirect(`/servicios/${osId}`)
}

function parsearBooleano(v: FormDataEntryValue | null): boolean | null {
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
