'use client'

import { BUCKETS_ANTIGUEDAD, ETIQUETA_BUCKET, type BucketAntiguedad } from '@/domain/reportes'
import type { FilaAntiguedadProveedor } from '@/services/reportes-cuentas-por-pagar-detalle'

type Props = {
  filas: readonly FilaAntiguedadProveedor[]
  totalesPorMoneda: readonly { moneda: string; porBucket: Record<BucketAntiguedad, number>; total: number }[]
}

/**
 * Exporta la tabla ya renderizada a CSV — sin pedir de nuevo al servidor
 * (misma data que ya llegó en el render). Mirror del patrón de descarga de
 * lib/excel-sabana.ts, pero client-side porque acá no hace falta un
 * endpoint aparte: la tabla ya está armada en la página.
 */
export function DescargarCSV({ filas, totalesPorMoneda }: Props) {
  function descargar() {
    const encabezado = ['Proveedor / beneficiario', 'Moneda', ...BUCKETS_ANTIGUEDAD.map((b) => ETIQUETA_BUCKET[b]), 'Total']
    const filasCSV = filas.map((f) => [f.nombre, f.moneda, ...BUCKETS_ANTIGUEDAD.map((b) => f.porBucket[b].toFixed(2)), f.total.toFixed(2)])
    const filasTotales = totalesPorMoneda.map((t) => [
      `Total ${t.moneda}`,
      t.moneda,
      ...BUCKETS_ANTIGUEDAD.map((b) => t.porBucket[b].toFixed(2)),
      t.total.toFixed(2),
    ])
    const filasTexto = [encabezado, ...filasCSV, ...filasTotales]
      .map((fila) => fila.map(csvEscape).join(','))
      .join('\r\n')
    const blob = new Blob(['﻿' + filasTexto], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `antiguedad-saldos-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <button type="button" onClick={descargar} className="btn-secondary">
      Descargar CSV
    </button>
  )
}

function csvEscape(valor: string | number): string {
  const s = String(valor)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
