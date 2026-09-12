'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { editarSolicitud } from '@/services/solicitudes-gasto'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { formatoMonto } from '@/domain/aviso-email'
import { cambioExigeAviso } from '@/domain/edicion'
import { validarSolicitud, type BorradorSolicitud, type TipoComprobante } from '@/domain/gasto'
import type { EstadoFormulario } from '@/app/gastos/nueva/actions'

/**
 * Guardar la edición de un Anticipo / Reembolso.
 *
 * El borrador se arma igual que al crear (mismo FormData, mismo
 * `validarSolicitud`) — es el mismo formulario. Lo único distinto es el
 * `tipo`: acá viaja en un hidden y el servicio lo verifica contra lo
 * guardado, así nadie lo cambia toqueteando el HTML.
 */
export async function editarSolicitudAction(
  solicitudId: string,
  _previo: EstadoFormulario,
  form: FormData
): Promise<EstadoFormulario> {
  const tipo = String(form.get('tipo') ?? 'anticipo') as BorradorSolicitud['tipo']
  const tipoComprobante = String(form.get('tipoComprobante') ?? 'boleta') as TipoComprobante

  const borrador: BorradorSolicitud = {
    tipo,
    categoriaId: String(form.get('categoriaId') ?? ''),
    moneda: String(form.get('moneda') ?? 'PEN'),
    montoAnticipo: tipo === 'anticipo' ? Number(form.get('montoAnticipo') ?? 0) : null,
    baseImponible: tipo === 'anticipo' ? null : Number(form.get('baseImponible') ?? 0),
    igv: tipo === 'anticipo' ? null : Number(form.get('igv') ?? 0),
    descripcion: String(form.get('descripcion') ?? ''),
    destino: textoONull(form.get('destino')),
    fechaRequerida: tipo === 'gasto_directo' ? null : textoONull(form.get('fechaRequerida')),
    fechaInicio: textoONull(form.get('fechaInicio')),
    fechaFin: textoONull(form.get('fechaFin')),
    asignadoA: tipo === 'anticipo' ? textoONull(form.get('asignadoA')) : null,
    quienAutoriza: tipo === 'gasto_directo' ? null : textoONull(form.get('quienAutoriza')),
    fechaFactura: tipo === 'anticipo' ? null : textoONull(form.get('fechaFactura')),
    tipoComprobante: tipo === 'anticipo' ? null : tipoComprobante,
  }

  const errores = validarSolicitud(borrador)
  if (errores.length > 0) return { errores }

  let resultado: Awaited<ReturnType<typeof editarSolicitud>>
  try {
    resultado = await editarSolicitud(solicitudId, borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  // El correo sale SOLO si cambió el monto: eso cambia qué se está
  // autorizando. Un typo corregido en la descripción no le mueve la aguja a
  // nadie, y un correo por cada corrección menor entrena a ignorarlos todos.
  if (cambioExigeAviso(resultado.montoAntes, resultado.montoDespues) && tipo !== 'gasto_directo') {
    const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
    await avisarCreacionSinRomper({
      tipo,
      codigo: resultado.codigo,
      monto: resultado.montoDespues,
      moneda: borrador.moneda,
      referencia: String(form.get('categoriaNombre') ?? '').trim() || 'Edición',
      filas: [
        { etiqueta: 'Editado por', valor: perfil?.nombre ?? usuario.email ?? null },
        { etiqueta: 'Monto anterior', valor: formatoMonto(resultado.montoAntes, borrador.moneda) },
        { etiqueta: 'Monto nuevo', valor: formatoMonto(resultado.montoDespues, borrador.moneda) },
        { etiqueta: 'Motivo', valor: borrador.descripcion },
      ],
      ruta: `/gastos/${solicitudId}`,
      creadorCorreo: usuario.email ?? null,
    })
  }

  revalidatePath(`/gastos/${solicitudId}`)
  redirect(`/gastos/${solicitudId}`)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}
