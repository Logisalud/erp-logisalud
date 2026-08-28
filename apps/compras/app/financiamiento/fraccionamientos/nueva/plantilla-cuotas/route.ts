import { NextResponse } from 'next/server'
import { generarPlantillaCuotas } from '@/lib/excel-cuotas'

export const dynamic = 'force-dynamic'

/** Plantilla descargable del cronograma de cuotas — mismas columnas que
 * espera lib/excel-cuotas.ts::parsearCuotasExcel. */
export async function GET() {
  const buffer = generarPlantillaCuotas()
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-cronograma-cuotas.xlsx"',
    },
  })
}
