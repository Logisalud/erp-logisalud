'use server'

import { redirect } from 'next/navigation'
import { exigirUsuario, perfilActual } from '@logisalud/auth/server'
import { crearOS } from '@/services/servicios'
import { avisarCreacionSinRomper } from '@/services/avisos'
import { formatoMonto } from '@/domain/aviso-email'
import { validarOS, type BorradorOS } from '@/domain/servicio'

export type EstadoFormulario = { errores: { campo: string; mensaje: string }[] } | null

export async function crearOSAction(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
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

  let os: { id: string; codigo: string }
  try {
    os = await crearOS(borrador)
  } catch (e) {
    return { errores: [{ campo: 'general', mensaje: (e as Error).message }] }
  }

  // Pieza K: aviso a Contabilidad al crear la OS.
  const [usuario, perfil] = await Promise.all([exigirUsuario(), perfilActual()])
  const proveedorNombre = String(form.get('proveedorNombre') ?? '').trim()
  await avisarCreacionSinRomper({
    tipo: 'os',
    codigo: os.codigo,
    monto: borrador.montoEstimado,
    moneda: borrador.moneda,
    referencia: proveedorNombre || 'Orden de servicio',
    filas: [
      { etiqueta: 'Creada por', valor: perfil?.nombre ?? usuario.email ?? null },
      { etiqueta: 'Tipo', valor: 'Orden de servicio' },
      { etiqueta: 'Proveedor', valor: proveedorNombre || null },
      {
        etiqueta: 'Monto',
        valor: `${formatoMonto(borrador.montoEstimado, borrador.moneda)}${borrador.montoIncluyeIgv ? ' (con IGV)' : ' (sin IGV)'}`,
      },
      { etiqueta: 'Servicio', valor: borrador.descripcionServicio },
      {
        etiqueta: 'Condición pago',
        valor: borrador.condicionesPagoDias != null ? `${borrador.condicionesPagoDias} días` : null,
      },
    ],
    ruta: `/servicios/${os.id}`,
    creadorCorreo: usuario.email ?? null,
  })

  redirect(`/servicios/${os.id}`)
}

function textoONull(v: FormDataEntryValue | null): string | null {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

function parsearBooleano(v: FormDataEntryValue | null): boolean | null {
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}
