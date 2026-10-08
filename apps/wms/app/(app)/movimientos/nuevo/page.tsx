import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedePrepararMovimiento } from '@/domain/inventario'
import { ETIQUETA_ESTADO } from '@/domain/estados'
import { filasDeStock } from '@/domain/panorama'
import { FormMovimiento, type CeldaOrigen } from '@/components/inventario/form-movimiento'

export const metadata = { title: 'Preparar un movimiento — WMS LOGISALUD' }

export default async function NuevoMovimiento() {
  const ctx = await exigirContexto()
  if (!puedePrepararMovimiento(ctx.roles)) redirect('/movimientos')
  const repo = repositorio()
  const [p, ordenes, par] = await Promise.all([repo.panorama(), repo.listarMovimientos(), repo.parametrosInventario()])
  void par
  const reservado = (posicionId: string, loteId: string, estado: string, proc: string) => ordenes.filter((o) => ['PREPARADO', 'AUTORIZADO', 'EJECUTADO', 'CON_DIFERENCIA'].includes(o.estado))
    .flatMap((o) => o.lineas).filter((l) => l.desdePosicionId === posicionId && l.loteId === loteId && l.estado === estado && l.procedenciaId === proc).reduce((n, l) => n + l.cantidad, 0)
  const celdas: CeldaOrigen[] = filasDeStock(p).map((f) => ({
    clave: `${f.posicion.id}|${f.lote.id}|${f.saldo.estado}|${f.saldo.procedenciaId}`,
    etiqueta: `${f.posicion.codigo} · ${f.producto.descripcion} · lote ${f.lote.codigo} · ${ETIQUETA_ESTADO[f.saldo.estado]}`,
    posicionId: f.posicion.id, loteId: f.lote.id, estado: f.saldo.estado, procedenciaId: f.saldo.procedenciaId, propietarioId: f.saldo.propietarioId, origen: 'CARGA_INICIAL' as const,
    disponible: f.saldo.cantidad - reservado(f.posicion.id, f.lote.id, f.saldo.estado, f.saldo.procedenciaId),
  })).filter((c) => c.disponible > 0 && c.estado !== 'BAJAS_RECHAZADOS').sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es', { numeric: true }))
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/movimientos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Movimientos</Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">Preparar un movimiento</h1>
        <p className="mt-1 text-gray-600">Elige qué se mueve, de dónde a dónde y cuánto. Todavía no cambia el stock.</p>
      </header>
      <FormMovimiento celdas={celdas} posiciones={p.posiciones} asignaciones={p.asignaciones} hoy={p.hoy} />
    </div>
  )
}
