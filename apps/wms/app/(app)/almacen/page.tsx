import { repositorio } from '@/services/repositorio-actual'
import { construirVistaMapa } from '@/domain/vista-mapa'
import { MapaAlmacen, type Capa } from '@/components/mapa/mapa-almacen'
import { exigirContexto } from '@/lib/contexto'

export const metadata = { title: 'Almacén — WMS LOGISALUD' }

export default async function PaginaAlmacen({ searchParams }: { searchParams: { buscar?: string; ver?: string; capa?: string } }) {
  await exigirContexto()
  const panorama = await repositorio().panorama()
  const vista = construirVistaMapa(panorama)
  const capa = (['propietario', 'estado', 'ocupacion', 'verificar'] as const).find((c) => c === searchParams.capa)
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Almacén</h1>
        <p className="mt-1 text-gray-600">Dónde está cada cosa, de quién es y en qué estado. Toca una ubicación para ver su contenido.</p>
      </header>
      <MapaAlmacen
        vista={vista}
        capaInicial={(capa ?? 'propietario') as Capa | 'verificar'}
        verInicial={searchParams.ver}
        buscarInicial={searchParams.buscar ?? ''}
      />
    </div>
  )
}
