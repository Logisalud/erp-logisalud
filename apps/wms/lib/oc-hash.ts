import type { ContenidoOc } from '@/domain/oc-versiones'
import { hashDe } from './hash'

/** Hash del contenido de una OC (lo que se compara para saber si cambió). Solo servidor/pruebas: usa node:crypto. */
export const hashDeContenidoOc = (c: ContenidoOc) => hashDe({ encabezado: c.encabezado, lineas: [...c.lineas].sort((a, b) => a.ocItemId.localeCompare(b.ocItemId)) })
