import { notFound, redirect } from 'next/navigation'
import { perfilActual } from '@logisalud/auth/server'
import { Encabezado } from '@/components/nav'
import { listarCategoriasGasto } from '@/services/solicitudes-gasto'
import { obtenerAporte, puedeRegistrarAporte } from '@/services/aportes-accionista'
import { puedeEditarseAporte } from '@/domain/aporte-accionista'
import { FormularioAporte } from '../../formulario-uno'
import { editarAporteAction } from '../../actions'
import { BotonAnularAporte } from './anular'

export const dynamic = 'force-dynamic'

/**
 * Editar un aporte — el MISMO formulario del alta.
 *
 * Acá NO rige la ventana de domain/edicion.ts: no hay ninguna autoridad que
 * decida sobre un aporte, así que no existe el momento en que se congela.
 * Mientras no esté anulado, se corrige. Es la única entidad del módulo con
 * esta regla, y es una decisión explícita.
 */
export default async function EditarAporte({ params }: { params: { id: string } }) {
  if (!puedeRegistrarAporte(await perfilActual())) redirect('/aportes-accionista')

  const aporte = await obtenerAporte(params.id)
  if (!aporte) notFound()
  if (!puedeEditarseAporte(aporte.anulado_en)) redirect('/aportes-accionista')

  const categorias = await listarCategoriasGasto()
  // La categoría puede ser del catálogo o libre; el formulario necesita
  // saber cuál de las dos para preseleccionar el desplegable.
  const delCatalogo = categorias.find((c) => c.nombre === aporte.categoria)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Encabezado
        titulo={`Editar ${aporte.codigo}`}
        atras={{ href: '/aportes-accionista', texto: 'Aportes de accionista' }}
      />

      <FormularioAporte
        categorias={categorias}
        inicial={{
          fecha: aporte.fecha,
          categoriaId: delCatalogo?.id ?? '',
          categoriaLibre: delCatalogo ? '' : aporte.categoria,
          descripcion: aporte.descripcion,
          moneda: aporte.moneda,
          monto: String(aporte.monto),
        }}
        accionServidor={editarAporteAction.bind(null, params.id)}
        textoBoton="Guardar cambios"
        textoEnviando="Guardando…"
      />

      <BotonAnularAporte aporteId={params.id} />
    </main>
  )
}
