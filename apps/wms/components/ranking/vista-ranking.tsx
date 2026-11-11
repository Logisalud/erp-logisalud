import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react'
import { ETIQUETA_RANKING, META_ERRORES_PCT, comoVoy, type FilaRanking, type Ranking, type Semaforo } from '@/domain/ranking'
import { CHIP_AVISO, CHIP_OK } from '../estilos-opcion'

const ROJO = 'border-red-200 bg-red-50 text-red-800'
const chip = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none whitespace-nowrap'
const pct = (n: number) => `${String(n).replace('.', ',')} %`

function ChipSemaforo({ s, pctError }: { s: Semaforo; pctError: number }) {
  const m = { VERDE: { cls: CHIP_OK, I: CheckCircle2, t: 'Dentro de la meta' }, AMARILLO: { cls: CHIP_AVISO, I: TriangleAlert, t: 'Cerca de la meta' }, ROJO: { cls: ROJO, I: XCircle, t: 'Sobre la meta' } }[s]
  return <span className={`${chip} ${m.cls}`} data-testid="chip-semaforo" data-semaforo={s}><m.I className="h-3.5 w-3.5" aria-hidden />{pct(pctError)} · {m.t}</span>
}

const ESTADO: Record<FilaRanking['estado'], string> = { EN_CARRERA: '', SOBRE_LA_META: 'Pasa de la meta: sin premio este mes por ahora', SIN_MINIMO: 'Aún no llega al mínimo de pedidos' }

/** «Cómo voy»: la frase simple de la persona en cada ranking, con su semáforo. */
export function ComoVoy({ rankings, personaId }: { rankings: Ranking[]; personaId: string }) {
  return (
    <section aria-labelledby="t-como-voy" className="grid gap-3 md:grid-cols-2" data-testid="como-voy">
      <h2 id="t-como-voy" className="sr-only">Cómo voy este mes</h2>
      {rankings.map((r) => {
        const c = comoVoy(r, personaId)
        return (
          <div key={r.rol} className="rounded-xl border border-gray-200 bg-white p-4" data-testid={`como-voy-${r.rol.toLowerCase()}`}>
            <p className="font-heading text-lg font-semibold uppercase tracking-wide text-gray-900">Cómo voy · {r.rol === 'PICKING' ? 'Picking' : 'Conformidad'}</p>
            <p className="mt-1 text-gray-800">{c.texto}</p>
            {c.fila && c.semaforo && <p className="mt-2"><ChipSemaforo s={c.semaforo} pctError={c.fila.pctError} /></p>}
          </div>
        )
      })}
    </section>
  )
}

/** Las dos reglas del mes, para que cada uno sepa cómo ganar. */
export function ComoSeGana() {
  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-950" data-testid="como-se-gana" aria-labelledby="t-como-se-gana">
      <h2 id="t-como-se-gana" className="flex items-center gap-2 font-heading text-lg font-semibold uppercase tracking-wide"><Info className="h-5 w-5" aria-hidden />Cómo se gana el mes</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li><strong>Cumple la meta de calidad:</strong> máximo {META_ERRORES_PCT} de cada 100 pedidos con error. Si te pasas, ese mes no entras al premio.</li>
        <li><strong>Trabaja lo más que puedas:</strong> entre quienes cumplen la meta, gana quien hizo más carga de trabajo (más pedidos y más difíciles).</li>
      </ol>
      <p className="mt-2 text-sm">El 1.º de cada ranking gana un día libre. Un pedido con error es uno donde alguien detectó una diferencia (cantidad, descripción, lote o documento) después de tu trabajo.</p>
    </section>
  )
}

export function TablaRanking({ ranking, nombres, personaId }: { ranking: Ranking; nombres: Map<string, string>; personaId: string }) {
  return (
    <section aria-labelledby={`t-${ranking.rol}`} className="space-y-2" data-testid={`ranking-${ranking.rol.toLowerCase()}`}>
      <h2 id={`t-${ranking.rol}`} className="font-heading text-xl font-semibold uppercase tracking-wide text-gray-900">{ETIQUETA_RANKING[ranking.rol]}</h2>
      <p className="text-sm text-gray-600">Mínimo para entrar: {ranking.minimo} pedidos en el mes.</p>
      {ranking.filas.length === 0 ? <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-gray-700" data-testid="ranking-vacio">Todavía no hay pedidos conformados este mes.</p> : (
        <ol className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {ranking.filas.map((f) => (
            <li key={f.personaId} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3 md:px-4 ${f.personaId === personaId ? 'bg-amber-50' : ''}`} data-testid="fila-ranking" data-puesto={f.puesto ?? ''}>
              <span className="w-10 shrink-0 font-heading text-2xl font-semibold tabular text-gray-900" aria-label={f.puesto ? `Puesto ${f.puesto}` : 'Sin puesto'}>{f.puesto ?? '—'}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{nombres.get(f.personaId) ?? 'Persona'}{f.personaId === personaId ? <span className="ml-2 text-sm font-normal text-gray-700">(tú)</span> : null}</p>
                <p className="text-sm text-gray-700">{f.pedidos} pedidos · carga {f.carga} · {f.conError} con error{ESTADO[f.estado] ? ` · ${ESTADO[f.estado]}` : ''}</p>
              </div>
              <ChipSemaforo s={f.semaforo} pctError={f.pctError} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
