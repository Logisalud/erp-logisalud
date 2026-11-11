import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'
import { repositorio } from '@/services/repositorio-actual'
import { puedeVerInspecciones, TIPOS_INSPECCION, type TipoInspeccion } from '@/domain/inspecciones'
import { documentoWord, nombreArchivoWord } from '@/services/docx/inspeccion-docx'

export const dynamic = 'force-dynamic'

/** Descarga el formato del mes (LS-FR.49.03 o LS-FR.52.03) en Word. */
export async function GET(req: Request) {
  const ctx = await exigirContexto()
  if (!puedeVerInspecciones(ctx.roles)) return new NextResponse('No tienes permiso para ver las inspecciones de la unidad', { status: 403 })
  const u = new URL(req.url)
  const tipo = u.searchParams.get('tipo') as TipoInspeccion
  const vehiculoId = u.searchParams.get('vehiculo') ?? ''
  const mes = u.searchParams.get('mes') ?? ''
  if (!TIPOS_INSPECCION.includes(tipo) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || !vehiculoId) return new NextResponse('Pide un tipo, un vehículo y un mes válidos', { status: 400 })
  const actor = { id: ctx.usuario.id, nombre: ctx.usuario.nombre, roles: ctx.roles }
  const repo = repositorio()
  const vehiculo = (await repo.vehiculosParaInspeccion(actor)).find((v) => v.id === vehiculoId)
  if (!vehiculo) return new NextResponse('No encontramos ese vehículo', { status: 404 })
  const inspecciones = await repo.inspeccionesDelMes(tipo, vehiculoId, mes, actor)
  const archivo = documentoWord({ tipo, placa: vehiculo.placa, mes, inspecciones })
  return new NextResponse(archivo as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${nombreArchivoWord(tipo, vehiculo.placa, mes)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
