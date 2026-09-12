import { notFound, redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { listarProveedoresServicio, obtenerOS } from '@/services/servicios'
import { puedeEditarseOS } from '@/domain/edicion'
import { valoresDeOS } from '@/domain/valores-os'
import { FormularioOS } from '@/app/servicios/nueva/formulario'
import { editarOSAction } from './actions'

export const dynamic = 'force-dynamic'

/** Editar una OS — el MISMO formulario del alta, con los valores guardados
 * y la Server Action de edición. Ver domain/edicion.ts. */
export default async function EditarOS({ params }: { params: { id: string } }) {
  const os = await obtenerOS(params.id)
  if (!os) notFound()
  if (!puedeEditarseOS(os.estado)) redirect(`/servicios/${params.id}`)

  const proveedores = await listarProveedoresServicio()

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado
        titulo={`Editar ${os.codigo}`}
        atras={{ href: `/servicios/${params.id}`, texto: os.codigo }}
      />

      <p className="card mb-4 text-sm text-gray-600">
        Corrige lo que esté mal antes de que el jefe de área la apruebe o la rechace. Si cambias
        el monto, se manda un aviso con el monto anterior y el nuevo.
      </p>

      <FormularioOS
        proveedores={proveedores}
        inicial={valoresDeOS(os as any)}
        accionServidor={editarOSAction.bind(null, params.id)}
        textoBoton="Guardar cambios"
        textoEnviando="Guardando…"
      />
    </main>
  )
}
