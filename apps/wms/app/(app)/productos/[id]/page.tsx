import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, MapPin } from 'lucide-react'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { filasDeStock } from '@/domain/panorama'
import { puedeEditarRegulatorio } from '@/domain/permisos'
import { etiquetaCampo } from '@/domain/tipos'
import { diasHasta, situacionRS } from '@/domain/regulatorio'
import { formatoFecha, formatoFechaHora } from '@/domain/fechas'
import { ChipEstado, ChipPorTrasladar, ChipRS } from '@/components/chips'
import { FormRegulatorio } from '@/components/form-regulatorio'
import { vistaPropietario } from '@/components/propietarios-color'

export const metadata = { title: 'Producto — WMS LOGISALUD' }

export default async function DetalleProducto({ params, searchParams }: { params: { id: string }; searchParams: { creado?: string } }) {
  const ctx = await exigirContexto()
  const p = await repositorio().panorama()
  const id = decodeURIComponent(params.id)
  const prod = p.productos.find((x) => x.id === id)
  if (!prod) notFound()
  const reg = prod.reg
  const sit = situacionRS(reg?.rsVence, p.hoy)
  const stock = filasDeStock(p).filter((f) => f.producto.id === prod.id)
  const total = stock.reduce((n, f) => n + f.saldo.cantidad, 0)
  const puedeEditar = puedeEditarRegulatorio(ctx.roles)
  const historial = await repositorio().historialRegulatorio(prod.id)

  const dato = (k: string, v: string | undefined | null) => (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:gap-6">
      <dt className="w-44 shrink-0 text-sm text-gray-600">{k}</dt>
      <dd className="text-gray-900">{v || '—'}</dd>
    </div>
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/productos" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-gray-700 hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />Productos</Link>

      {searchParams.creado === '1' && (
        <div role="status" className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-green-900" data-testid="producto-creado">
          <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Listo. El producto quedó dado de alta.</p>
            <p className="text-sm">Sus datos regulatorios ya rigen. Cualquier cambio posterior queda en el historial con su motivo.</p>
          </div>
        </div>
      )}

      <header>
        <p className="text-sm text-gray-600">{prod.codigo}</p>
        <h1 className="font-heading text-3xl font-semibold uppercase tracking-wide text-gray-900">{prod.descripcion}</h1>
        {prod.presentacion && <p className="mt-1 text-gray-700">{prod.presentacion}</p>}
        {reg && <div className="mt-3 flex flex-wrap items-center gap-2"><ChipRS situacion={sit} /><Link href={`/kardex?producto=${prod.id}`} className="text-sm text-gray-800 underline" data-testid="ver-kardex-producto">Ver su Kardex</Link></div>}
      </header>

      {sit === 'VENCIDO' && reg?.rsVence && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">El registro sanitario venció hace {Math.abs(diasHasta(reg.rsVence, p.hoy))} días</p>
          <p className="mt-1">Sus lotes no se pueden aprobar hasta que Dirección Técnica lo resuelva. Se avisó a Dirección Técnica.</p>
        </div>
      )}

      <section className="card" aria-labelledby="reg">
        <h2 id="reg" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Datos regulatorios</h2>
        <dl className="mt-1 divide-y divide-gray-100">
          {dato('Número de registro', reg?.registroSanitario)}
          {dato('Vence', reg?.rsVence ? `${formatoFecha(reg.rsVence)}${sit === 'POR_VENCER' ? ` (en ${diasHasta(reg.rsVence, p.hoy)} días)` : ''}` : undefined)}
          {dato('Forma farmacéutica', reg?.formaPresentacion)}
          {dato('Concentración', reg?.concentracion)}
          {dato('Fabricante', reg?.fabricante)}
          {dato('Condición de almacenamiento', reg?.condicionAlmacenamiento)}
        </dl>
      </section>

      <section className="card" aria-labelledby="catalogo">
        <h2 id="catalogo" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Datos del producto</h2>
        <p className="mt-1 text-sm text-gray-600">Compras llena presentación y principio activo al crear el producto; después solo Dirección Técnica los edita, desde aquí.</p>
        <dl className="mt-1 divide-y divide-gray-100">
          <div data-testid="dato-presentacion">{dato('Presentación', prod.presentacion)}</div>
          <div data-testid="dato-principio-activo">{dato('Principio activo', prod.principioActivo)}</div>
          {dato('Marca', prod.marca)}
          {dato('Unidad', prod.unidadMedida)}
        </dl>
      </section>

      {puedeEditar && (
        <section className="card border-2 border-teal-400" aria-labelledby="editar" data-testid="panel-regulatorio">
          <h2 id="editar" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Editar datos regulatorios y del producto</h2>
          <p className="mb-3 mt-1 text-sm text-gray-600">Katia y Sandra tienen la misma autoridad. El cambio rige de inmediato y queda registrado con tu nombre, la fecha y el motivo.</p>
          <FormRegulatorio productoId={prod.id} reg={reg} presentacion={prod.presentacion} principioActivo={prod.principioActivo} />
        </section>
      )}

      <section className="card" aria-labelledby="historial" data-testid="historial-regulatorio">
        <h2 id="historial" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Historial de cambios</h2>
        {historial.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Todavía no hay cambios registrados.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {historial.map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <p className="text-gray-900"><strong>{etiquetaCampo(c.campo)}</strong>: {c.antes ?? '—'} → <strong>{c.despues ?? '—'}</strong></p>
                <p className="text-gray-600">{c.usuario} · {formatoFechaHora(c.ts)} · {c.motivo}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="donde">
        <h2 id="donde" className="font-heading text-lg font-medium uppercase tracking-wide text-gray-800">Dónde está</h2>
        {stock.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-600" data-testid="sin-stock">Todavía no hay unidades de este producto en el almacén.</p>
        ) : (
          <>
            <p className="tabular mt-1 text-sm text-gray-700">{total.toLocaleString('es-PE')} unidades en {new Set(stock.map((f) => f.posicion.codigo)).size} ubicaciones</p>
            <ul className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white">
              {stock.sort((a, b) => a.posicion.codigo.localeCompare(b.posicion.codigo, 'es', { numeric: true })).map((f, i) => {
                const v = vistaPropietario(f.propietario.codigo)
                const trasladar = f.saldo.estado === 'APROBADO' && (f.posicion.tipoArea === 'CUARENTENA' || f.posicion.tipoArea === 'RECEPCION')
                return (
                  <li key={i}>
                    <Link href={`/almacen?ver=${encodeURIComponent(f.posicion.rack + (f.posicion.posicion != null ? `-${f.posicion.posicion}` : `-${f.posicion.codigo.split('-')[1]}`))}&buscar=${encodeURIComponent(f.lote.codigo)}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-gray-50">
                      <span className="flex min-w-24 items-center gap-1.5 font-heading text-lg font-semibold tracking-wide"><MapPin className="h-4 w-4 text-gray-500" aria-hidden />{f.posicion.codigo}</span>
                      <span className="tabular text-sm text-gray-700">Lote {f.lote.codigo} · vence {formatoFecha(f.lote.vence)}</span>
                      <span className="tabular ml-auto font-medium">{f.saldo.cantidad.toLocaleString('es-PE')} u</span>
                      <span className="flex flex-wrap gap-1.5">
                        <ChipEstado estado={f.saldo.estado} />
                        {trasladar && <ChipPorTrasladar />}
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700"><span aria-hidden className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold text-white" style={{ background: v.color }}>{v.letra}</span>{v.corto}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
