import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeDecidirAjuste, puedeProgramarConteo } from '@/domain/inventario'
import { formatoFechaHora } from '@/domain/fechas'
import { ChipConteo } from '@/components/inventario/chips-inventario'
import { FormProgramarConteo, type PosicionContable } from '@/components/inventario/form-programar-conteo'
import { AjustesPorDecidir } from '@/components/inventario/ajustes-por-decidir'
import { ETIQUETA_AREA } from '@/domain/zonas'
import { CONTEOS_POR_SEMANA_DEFECTO, lunesDe } from '@/domain/operacion'
import { ProgramacionSemanal } from '@/components/operacion/programacion-semanal'
import { CONTADOR_AMBAR } from '@/components/estilos-opcion'

export const metadata = { title: 'Conteos — WMS LOGISALUD' }

export default async function Conteos({ searchParams }: { searchParams: { semana?: string } }) {
  const ctx = await exigirContexto()
  const repo = repositorio()
  const [conteos, ajustes, p, ordenes, cobertura] = await Promise.all([repo.listarConteos(), repo.listarAjustes(), repo.panorama(), repo.listarMovimientos(), repo.ultimaCobertura()])
  const hoyLunes = lunesDe(p.hoy)
  const semana = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.semana ?? '') ? lunesDe(searchParams.semana!) : hoyLunes
  const programaciones = await repo.programacionDeSemana(semana)
  const enMovimiento = new Set(ordenes.filter((o) => ['EJECUTADO', 'CON_DIFERENCIA'].includes(o.estado)).flatMap((o) => o.lineas.flatMap((l) => [l.desdePosicionId, l.haciaPosicionId])))
  const puedeProgramar = puedeProgramarConteo(ctx.roles)
  const pendientes = ajustes.filter((a) => a.estado === 'PROPUESTO')
  const porPosicion = new Map<string, number>()
  for (const s of p.saldos) if (s.cantidad > 0) porPosicion.set(s.posicionId, (porPosicion.get(s.posicionId) ?? 0) + s.cantidad)
  const posiciones: PosicionContable[] = p.posiciones.filter((x) => porPosicion.has(x.id)).map((x) => ({ id: x.id, codigo: x.codigo, area: ETIQUETA_AREA[x.tipoArea], unidades: porPosicion.get(x.id)!, ocupada: enMovimiento.has(x.id) ? 'tiene movimientos por verificar' : undefined }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Conteos</h1>
        <p className="mt-1 text-gray-600">Tres conteos pequeños por semana, a ciegas: quien cuenta no ve lo que dice el sistema. Una diferencia pide un segundo conteo de otra persona y, si sigue, se busca la causa antes de corregir.</p>
      </header>

      {pendientes.length > 0 && (
        <section aria-labelledby="aj-pend">
          <h2 id="aj-pend" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Ajustes por autorizar <span className={`tabular rounded-full ${CONTADOR_AMBAR} px-2 py-0.5 text-sm`}>{pendientes.length}</span></h2>
          <div className="mt-3"><AjustesPorDecidir ajustes={pendientes} puedeDecidir={puedeDecidirAjuste(ctx.roles)} /></div>
        </section>
      )}

      <ProgramacionSemanal semana={semana} hoyLunes={hoyLunes} programaciones={programaciones} cobertura={cobertura} posiciones={posiciones} puedeProgramar={puedeProgramar} porSemana={CONTEOS_POR_SEMANA_DEFECTO} />

      {puedeProgramar && <FormProgramarConteo posiciones={posiciones} />}

      <section aria-labelledby="lista-conteos">
        <h2 id="lista-conteos" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Conteos <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 text-sm text-gray-700">{conteos.length}</span></h2>
        {conteos.length === 0 ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white px-6 py-10 text-center" data-testid="conteos-vacio">
            <ClipboardCheck className="mx-auto h-9 w-9 text-gray-400" aria-hidden />
            <p className="mt-3 font-medium text-gray-900">Todavía no hay conteos</p>
            <p className="mt-1 text-sm text-gray-600">{puedeProgramar ? 'Programa el primero eligiendo ubicaciones arriba.' : 'El Jefe de Almacén programa los conteos.'}</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white" data-testid="lista-conteos">
            {conteos.map((c) => (
              <li key={c.id}>
                <Link href={`/conteos/${c.id}`} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-gray-50" data-testid="fila-conteo">
                  <span className="tabular font-heading text-lg font-semibold tracking-wide text-gray-900">{c.numero}</span>
                  <ChipConteo estado={c.estado} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{c.nota ?? 'Sin nota'} · {c.resueltas} de {c.lineas} líneas resueltas</span>
                  <span className="tabular text-sm text-gray-600">{formatoFechaHora(c.programadoEn)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
