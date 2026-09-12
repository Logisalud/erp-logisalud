import { notFound, redirect } from 'next/navigation'
import { Encabezado } from '@/components/nav'
import { listarCategoriasPagoDirecto, obtenerPagoDirectoParaEditar } from '@/services/obligaciones'
import { puedeEditarseObligacion } from '@/domain/edicion'
import { valoresDePagoDirecto } from '@/domain/valores-pago-directo'
import { FormularioPagoDirecto } from '@/app/pago-directo/nueva/formulario'
import { editarPagoDirectoAction } from './actions'

export const dynamic = 'force-dynamic'

/** Editar un Pago Directo — el MISMO formulario del alta, con los valores
 * guardados y la Server Action de edición. Ver domain/edicion.ts. */
export default async function EditarPagoDirecto({ params }: { params: { id: string } }) {
  const cargado = await obtenerPagoDirectoParaEditar(params.id)
  if (!cargado) notFound()

  const { fila, proveedor } = cargado
  // Solo Pago Directo se edita desde acá: una obligación de compra o de
  // servicio se corrige en su OC u OS, que es donde vive el documento.
  if (fila.origen !== 'gasto_directo') redirect(`/cuentas-por-pagar/${params.id}`)
  if (!puedeEditarseObligacion(fila.estado)) redirect(`/cuentas-por-pagar/${params.id}`)

  const categorias = await listarCategoriasPagoDirecto()
  const inicial = valoresDePagoDirecto(fila, proveedor)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado
        titulo={`Editar ${fila.codigo}`}
        atras={{ href: `/cuentas-por-pagar/${params.id}`, texto: fila.codigo }}
      />

      <p className="card mb-4 text-sm text-gray-600">
        Corrige lo que esté mal antes de que Contabilidad le dé conformidad. Si cambias el monto,
        se manda un aviso con el monto anterior y el nuevo. Los adjuntos se administran desde la
        ficha — editar acá no toca ningún archivo ya subido.
      </p>

      <FormularioPagoDirecto
        categorias={categorias}
        inicial={inicial}
        accionServidor={editarPagoDirectoAction.bind(null, params.id, inicial.pendienteFactura)}
        textoBoton="Guardar cambios"
        textoEnviando="Guardando…"
      />
    </main>
  )
}
