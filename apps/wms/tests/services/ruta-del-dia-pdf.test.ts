import { describe, expect, it } from 'vitest'
import { renderRutaDelDia } from '@/services/pdf/ruta-del-dia'
import { textoDePdf } from '@/services/logger/leer-pdf'

describe('PDF de la ruta del día', () => {
  it('lleva el título con la fecha, el vehículo, el conductor y las columnas del formato', async () => {
    const buf = await renderRutaDelDia({ numero: 'RUT-9', fecha: '2026-11-12', vehiculo: 'ABC-123', conductor: 'Hans', filas: [
      { n: 1, cliente: 'Botica Uno SAC', condicion: 'DESPACHO', guia: 'TTT1-00003315', direccion: 'Av. Santa Rosa 1753', destino: 'SJL', transportista: 'Hans', representante: 'Cintya Vilchez', formaPago: 'CREDITO', horario: '8AM A 12PM' }] })
    const t = textoDePdf(Buffer.from(buf)) ?? ''
    for (const x of ['RUTA DEL 12/11/2026', 'ABC-123', 'Hans', 'CLIENTE', 'CONDICIÓN', 'GUÍA', 'DIRECCIÓN', 'DESTINO', 'TRANSPORTISTA', 'REPRESENTANTE', 'Botica Uno SAC', 'TTT1-00003315', 'SJL']) expect(t, x).toContain(x)
  })
})
