import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { cargarIndicadores, puedeVerIndicadores } from '@/lib/indicadores-datos'
import { DESPACHO_PREVISTO, PERIODOS_RAPIDOS, TEMAS, periodoDe, periodoDeRango, textoPeriodo } from '@/domain/indicadores'
import { formatoFecha } from '@/domain/fechas'
import { FiltroIndicadores } from '@/components/indicadores/filtro-indicadores'
import { GrupoIndicadores } from '@/components/indicadores/tarjeta-indicador'

export const metadata = { title: 'Indicadores — WMS LOGISALUD' }

const DESCRIPCION_TEMA: Record<string, string> = {
  Inventario: 'Qué tan confiable es el inventario y cuánto espacio se usa.',
  Recepciones: 'Lo que llega y cómo se recibe.',
  Calidad: 'Cuarentena y vencimientos.',
  'Movimientos y conteos': 'Movimientos internos con dos personas y los conteos cíclicos.',
  'Operación diaria': 'La revisión diaria, sus pendientes y las alertas.',
  Despacho: 'Se agregan cuando existan las salidas.',
}

export default async function Indicadores({ searchParams }: { searchParams: { dias?: string; desde?: string; hasta?: string; propietario?: string } }) {
  const ctx = await exigirContexto()
  if (!puedeVerIndicadores(ctx.roles)) redirect('/reportes')
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
  const n = Number(searchParams.dias)
  const periodo = (PERIODOS_RAPIDOS as readonly number[]).includes(n) ? periodoDe(hoy, n) : searchParams.desde ? periodoDeRango(searchParams.desde, searchParams.hasta, hoy) : periodoDe(hoy, 30)
  const rapido = (PERIODOS_RAPIDOS as readonly number[]).includes(n) || !searchParams.desde ? periodo.dias : null
  const actor = { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
  const { indicadores, propietarios } = await cargarIndicadores(actor, periodo, searchParams.propietario)
  const pid = propietarios.find((p) => p.codigo === searchParams.propietario)?.id
  return (
    <div className="space-y-6">
      <Link href="/reportes" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Reportes</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900" data-testid="titulo-indicadores">Indicadores</h1>
        <p className="mt-1 text-gray-600">Todos los indicadores de <code className="rounded bg-gray-100 px-1 text-sm">kpis.md</code>, agrupados por tema. Cada uno muestra su valor, cómo cambió frente al periodo anterior y cómo se calcula; un clic abre su reporte. No hay metas ni semáforos todavía: se miden un mes con operación real antes de fijarlas.</p>
        <p className="tabular mt-1 text-sm text-gray-800" data-testid="periodo-actual">Periodo: {formatoFecha(periodo.desde)} al {formatoFecha(periodo.hasta)} ({textoPeriodo(periodo)}){searchParams.propietario && pid ? ` · ${searchParams.propietario}` : ''}</p>
      </header>
      <FiltroIndicadores dias={rapido} desde={periodo.desde} hasta={periodo.hasta} propietario={pid ? searchParams.propietario ?? '' : ''} propietarios={propietarios.map((p) => p.codigo).sort()} />
      {TEMAS.map((t) => {
        const lista = indicadores.filter((i) => i.tema === t)
        if (t !== 'Despacho' && lista.length === 0) return null
        return <GrupoIndicadores key={t} id={`g-${t}`} titulo={t} descripcion={DESCRIPCION_TEMA[t]} indicadores={lista} previstos={t === 'Despacho' ? DESPACHO_PREVISTO : []} marcaInicio columnas={3} />
      })}
    </div>
  )
}
