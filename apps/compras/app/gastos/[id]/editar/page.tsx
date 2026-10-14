import { notFound, redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { listarCategoriasGasto, obtenerSolicitud, sugerenciaResponsableArea } from '@/services/solicitudes-gasto'
import { listarUsuarios } from '@/services/usuarios'
import { listarPersonasSinUsuario } from '@/services/beneficiarios'
import { puedeEditarseSolicitud } from '@/domain/edicion'
import { valoresDeSolicitud } from '@/domain/valores-solicitud'
import { FormularioSolicitud } from '@/app/gastos/nueva/formulario'
import { editarSolicitudAction } from './actions'

export const dynamic = 'force-dynamic'

/**
 * Editar un Anticipo / Reembolso — el MISMO formulario del alta, con los
 * valores guardados cargados y la Server Action de edición.
 *
 * Reusarlo y no clonarlo no es solo menos código: es la garantía de que una
 * regla nueva (un campo obligatorio, una validación) entra en los dos
 * caminos a la vez. Un formulario de edición aparte es exactamente donde
 * esas reglas se olvidan.
 */
export default async function EditarSolicitud({ params }: { params: { id: string } }) {
  const solicitud = await obtenerSolicitud(params.id)
  if (!solicitud) notFound()

  // La ventana ya se cerró (link viejo, pestaña abierta desde antes, o
  // alguien probando la URL a mano): de vuelta a la ficha, que es donde
  // están Anular y Rechazar, los caminos que sí corresponden.
  if (!puedeEditarseSolicitud(solicitud.estado)) redirect(`/gastos/${params.id}`)

  // Todas, no solo las activas: si la persona asignada se desactivó después,
  // tiene que seguir apareciendo como la elegida (el buscador oculta las
  // inactivas salvo esa).
  const [categorias, usuarios, personas, sugerenciaAutoriza] = await Promise.all([
    listarCategoriasGasto(),
    listarUsuarios(),
    listarPersonasSinUsuario({ soloActivas: false }),
    sugerenciaResponsableArea(),
  ])

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado
        titulo={`Editar ${solicitud.codigo}`}
        atras={{ href: `/gastos/${params.id}`, texto: solicitud.codigo }}
      />

      <p className="card mb-4 text-sm text-gray-600">
        Corrige lo que esté mal antes de que Contabilidad lo revise. Si cambias el monto, se manda
        un aviso con el monto anterior y el nuevo. Los adjuntos se administran desde la ficha —
        editar acá no toca ningún archivo ya subido.
      </p>

      <FormularioSolicitud
        categorias={categorias}
        usuarios={usuarios}
        personas={personas}
        sugerenciaAutoriza={sugerenciaAutoriza}
        inicial={valoresDeSolicitud(solicitud as any)}
        accionServidor={editarSolicitudAction.bind(null, params.id)}
        textoBoton="Guardar cambios"
        textoEnviando="Guardando…"
      />
    </main>
  )
}
