import Link from 'next/link'
import { ChevronRight, CircleHelp, Home, Hourglass } from 'lucide-react'
import type { Indicador, IndicadorPrevisto } from '@/domain/indicadores'

/**
 * La tarjeta de un indicador: valor, variación frente al periodo anterior (una flecha y el cambio; sin colores de bueno o malo, D-42),
 * «¿Cómo se calcula?» con la fórmula y los datos, y un clic lleva a su reporte. Sin tarjetas anidadas.
 */
export function TarjetaIndicador({ k, compacta = false, marcaInicio = false }: { k: Indicador; compacta?: boolean; marcaInicio?: boolean }) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white" data-testid="kpi" data-kpi={k.clave}>
      <Link href={k.href} className="group block rounded-t-xl p-3 hover:bg-gray-50 active:bg-gray-100 md:p-4" data-testid="kpi-enlace" aria-label={`${k.nombre}: ${k.sinDatos ? 'sin datos' : k.texto}. Abrir su reporte`}>
        <span className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-medium leading-snug text-gray-800 md:text-sm">{k.nombre}</span>
          <ChevronRight className="mt-0.5 hidden h-4 w-4 shrink-0 text-gray-400 md:block" aria-hidden />
        </span>
        {marcaInicio && k.enInicio && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-800" data-testid="kpi-en-inicio"><Home className="h-3 w-3" aria-hidden />En Inicio</span>
        )}
        {k.sinDatos ? (
          <span className="mt-1.5 block text-sm text-gray-700" data-testid="kpi-sin-datos"><span className="tabular block font-heading text-2xl font-semibold text-gray-500 md:text-3xl">—</span>{k.sinDatos}</span>
        ) : (
          <span className="tabular mt-1 block font-heading text-xl font-semibold leading-tight text-gray-900 md:text-3xl" data-testid="kpi-valor">{k.texto}</span>
        )}
        <span className="mt-1 block text-xs leading-snug text-gray-700 md:text-[13px]" data-testid="kpi-variacion">
          {k.variacion ? k.variacion.texto : k.sinVariacion ?? 'Sin periodo anterior para comparar.'}
        </span>
      </Link>

      {k.detalle.length > 0 && (
        <dl className={`${compacta ? 'hidden md:block' : 'block'} space-y-0.5 border-t border-gray-100 px-3 py-2 text-xs text-gray-800 md:px-4 md:text-[13px]`} data-testid="kpi-detalle">
          {k.detalle.slice(0, compacta ? 4 : 8).map((x) => <div key={x.etiqueta}><div className="flex justify-between gap-3"><dt className="truncate">{x.etiqueta}</dt><dd className="tabular shrink-0 font-medium text-gray-900">{x.valor}</dd></div>{x.sub && <p className="text-[11px] leading-snug text-gray-700" data-testid="kpi-detalle-sub">{x.sub}</p>}</div>)}
        </dl>
      )}

      <details className="group/d border-t border-gray-100 px-3 py-1.5 text-xs text-gray-800 md:px-4 md:text-[13px]" data-testid="kpi-como">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 font-medium text-teal-800 [&::-webkit-details-marker]:hidden"><CircleHelp className="h-4 w-4 shrink-0" aria-hidden />¿Cómo se calcula?</summary>
        <div className="space-y-1.5 pb-2 pt-1">
          <p><strong className="font-medium text-gray-900">Fórmula:</strong> {k.formula}</p>
          {k.datos && <p><strong className="font-medium text-gray-900">Con estos datos:</strong> {k.datos}</p>}
          {!k.filtraPropietario && <p className="text-gray-700">Este indicador no se filtra por propietario.</p>}
          {k.detalle.length > 0 && compacta && (
            <dl className="space-y-0.5 md:hidden">{k.detalle.map((x) => <div key={x.etiqueta}><div className="flex justify-between gap-3"><dt>{x.etiqueta}</dt><dd className="tabular font-medium text-gray-900">{x.valor}</dd></div>{x.sub && <p className="text-[11px] leading-snug text-gray-700">{x.sub}</p>}</div>)}</dl>
          )}
        </div>
      </details>
    </article>
  )
}

/** Un indicador que todavía no existe (por ejemplo, los de Despacho): ya tiene su lugar y su definición. */
export function TarjetaPrevista({ k }: { k: IndicadorPrevisto }) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-dashed border-gray-300 bg-white p-3 md:p-4" data-testid="kpi-previsto" data-kpi={k.clave}>
      <span className="text-[13px] font-medium text-gray-800 md:text-sm">{k.nombre}</span>
      <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-800"><Hourglass className="h-3 w-3" aria-hidden />Cuando existan las salidas</span>
      <span className="mt-1.5 block text-xs text-gray-700 md:text-[13px]">{k.definicion}</span>
      <details className="mt-1 text-xs text-gray-800 md:text-[13px]">
        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 font-medium text-teal-800 [&::-webkit-details-marker]:hidden"><CircleHelp className="h-4 w-4 shrink-0" aria-hidden />¿Cómo se calculará?</summary>
        <p className="pb-1 pt-1"><strong className="font-medium text-gray-900">Fórmula:</strong> {k.formula}</p>
      </details>
    </article>
  )
}

/** Un grupo de indicadores con su título. `previstos`: los que se agregarán después (se muestran aparte, con borde punteado). */
export function GrupoIndicadores({ id, titulo, descripcion, indicadores, previstos = [], compacta = false, marcaInicio = false, columnas = 4 }: {
  id: string; titulo: string; descripcion?: string; indicadores: Indicador[]; previstos?: IndicadorPrevisto[]; compacta?: boolean; marcaInicio?: boolean; columnas?: 2 | 3 | 4
}) {
  const cols = columnas === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : columnas === 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'
  return (
    <section aria-labelledby={id} data-testid="grupo-kpi" data-grupo={titulo}>
      <h2 id={id} className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">{titulo}</h2>
      {descripcion && <p className="mt-0.5 text-sm text-gray-700">{descripcion}</p>}
      {indicadores.length > 0 && (
        <div className={`mt-3 grid items-start gap-2 md:gap-3 ${compacta ? 'grid-cols-2' : 'grid-cols-1'} ${cols}`}>
          {indicadores.map((k) => <TarjetaIndicador key={k.clave} k={k} compacta={compacta} marcaInicio={marcaInicio} />)}
        </div>
      )}
      {previstos.length > 0 && (
        <div className={`mt-3 grid items-start gap-2 md:gap-3 ${compacta ? 'grid-cols-2' : 'grid-cols-1'} ${cols}`}>
          {previstos.map((k) => <TarjetaPrevista key={k.clave} k={k} />)}
        </div>
      )}
    </section>
  )
}
