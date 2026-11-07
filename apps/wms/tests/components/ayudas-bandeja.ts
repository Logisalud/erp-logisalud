// Fixtures de la bandeja de pedidos para los tests de componentes (P1 y P2).
import { bandejaDeFila, type PedidoBandeja, type PedidoSnapshot } from '@/domain/pedidos-despacho'

export const ZONAS = { centro: { codigo: 'LIMA-CENTRO', nombre: 'Lima Centro', ordenRuta: 1 }, norte: { codigo: 'LIMA-NORTE', nombre: 'Lima Norte', ordenRuta: 2 }, sur: { codigo: 'LIMA-SUR', nombre: 'Lima Sur', ordenRuta: 3 } }
export const pedidoBandeja = (n: number, p: { fecha?: string; estado?: string; salida?: string; avisoVendedor?: string; cliente?: string; zona?: 'centro' | 'norte' | 'sur'; ordenDistrito?: number; dia?: number; fechaPlanificada?: string; distrito?: string } = {}): PedidoBandeja => {
  const snapshot = {
    pedidoId: `ped-${n}`, numero: `PED-${String(n).padStart(4, '0')}`, version: 1, fecha: p.fecha ?? '2026-11-03', estado: p.estado ?? 'LISTO_PARA_OPERACIONES',
    cliente: { id: `c${n}`, nombre: p.cliente ?? `Cliente ${n} SAC`, ruc: '20100000001', direccion: 'Av. Prueba 123', distrito: p.distrito ?? 'Lima', ventanaCita: undefined },
    vendedor: 'Rosa', lineas: [{ lineaId: `l${n}`, productoCodigo: 'PARA-500', descripcion: 'Paracetamol 500 mg', cantidad: 10 }], ...(p.zona ? { zonaReparto: ZONAS[p.zona] } : {}), ...(p.ordenDistrito != null ? { ordenDistrito: p.ordenDistrito } : {}), ...(p.dia ? { diaPlanificado: p.dia, fechaPlanificada: p.fechaPlanificada } : {}),
  } as unknown as PedidoSnapshot
  return bandejaDeFila({ id: `f${n}`, snapshot, cambios: [], cambioPendiente: false, salida: p.salida, salidaId: p.salida ? `s${n}` : undefined, importadoEn: '2026-11-03T10:00:00Z', codigosEnCatalogo: new Set(['PARA-500']), avisoVendedor: p.avisoVendedor })
}
