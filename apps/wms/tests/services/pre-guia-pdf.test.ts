import { describe, expect, it } from 'vitest'
import { renderPreGuia } from '@/services/pdf/pre-guia'
import { textoDePdf } from '@/services/logger/leer-pdf'
import type { DatosGuia } from '@/domain/guia-electronica'
import type { PreGuiaVista } from '@/domain/pre-guia'

const texto = (pdf: Buffer) => textoDePdf(Buffer.from(pdf)) ?? ''
const guia = {
  salidaId: 's', salidaNumero: 'SAL-2026-00001', tipo: 'DISTRIBUCION', conforme: true, pedidoNumero: 'PED-10',
  destinatario: { nombre: 'Botica Salud Total SAC', ruc: '20512345671', direccion: 'Av. Arequipa 1450', distrito: 'Lince', ubigeo: '150116' },
  lineas: [{ productoCodigo: 'LIZI-10', producto: 'Lizinopril 10 mg', lote: 'L-77', vence: '2028-05-31', cantidad: 120 }], bultos: 2,
  partida: { ubigeo: '150101', direccion: 'Av. Almacén 123' }, motivoTraslado: 'Venta', modalidad: 'Transporte privado', serie: 'TTT1',
  reglasBaja: { plazoHoras: '', trasInicioTraslado: '', soportadaPorApi: '' },
} as unknown as DatosGuia
const pre = (o: Partial<PreGuiaVista> = {}): PreGuiaVista => ({ salidaId: 's', serie: 'TTT1', numero: 7, numeroCompleto: 'TTT1-00000007', estado: 'PRE_GUIA', ...o })

describe('PDF de la pre-guía', () => {
  it('lleva el número reservado, el cliente, el detalle por lote y dice que vehículo y conductor están por asignar', async () => {
    const t = texto(await renderPreGuia({ pre: pre(), guia, piloto: true, generadaEn: '11/11/26 10:00' }))
    for (const x of ['TTT1-00000007', 'PRE-GUÍA DE REMISIÓN', 'Botica Salud Total SAC', '20512345671', 'Lizinopril 10 mg', 'L-77', 'Por asignar con la ruta', 'PRUEBA, NO FACTURAR', 'Todavía no hay ruta']) expect(t, x).toContain(x)
  })
  it('con ruta, vehículo y conductor los muestra y ya no pide nada', async () => {
    const t = texto(await renderPreGuia({ pre: pre({ estado: 'LISTA_PARA_ENVIAR', rutaNumero: 'RUT-9', placa: 'ABC-123', conductor: 'Hans' }), guia, piloto: false, generadaEn: 'hoy' }))
    expect(t).toContain('ABC-123 · Hans'); expect(t).not.toContain('Todavía no hay ruta'); expect(t).not.toContain('PRUEBA, NO FACTURAR')
  })
})
