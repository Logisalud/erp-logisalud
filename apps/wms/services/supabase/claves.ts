// Clave única de cada tabla/vista que el WMS lee por páginas (`traerTodo`).
//
// Paginar con `.range()` SIN un orden determinista es un error de datos, no de rendimiento:
// Postgres no garantiza el mismo orden entre dos consultas, así que la página 2 puede repetir
// filas de la 1 y saltarse otras (en Cobranzas se midieron 592 duplicadas y 592 perdidas en
// 2.573 filas; ver apps/cobranzas/lib/fetchAll.ts). Por eso `traerTodo` siempre agrega
// la clave única de esta lista como desempate final y no acepta una tabla que no esté aquí.
//
// Una tabla nueva se agrega aquí al mismo tiempo que se empieza a leer. El test
// tests/db/claves.test.ts compara esta lista con las claves primarias reales de las
// migraciones, para que no se desincronice.

export const CLAVES_UNICAS: Readonly<Record<string, readonly string[]>> = {
  'catalogo.productos': ['id'],
  'wms.acta_firmas': ['id'],
  'wms.actas_organolepticas': ['id'],
  'wms.actas_recepcion': ['id'],
  'wms.alertas': ['id'],
  'wms.asignaciones_posicion': ['id'],
  'wms.documentos_sustento': ['id'],
  'wms.cargas_coa': ['id'],
  'wms.cargas_coa_items': ['id'],
  'wms.documentos_regulatorios': ['id'],
  'wms.expediente_documentos': ['id'],
  'wms.expediente_faltantes': ['id'],
  'wms.expedientes': ['id'],
  'wms.fabricantes': ['id'],
  'wms.ingreso_lotes': ['id'],
  'wms.ingresos': ['id'],
  'wms.cambios_lote_asignado': ['id'],
  'wms.lotes': ['id'],
  'wms.ordenes_baja': ['id'],
  'wms.ordenes_baja_evaluaciones': ['id'],
  'wms.ordenes_baja_lineas': ['id'],
  'wms.ordenes_baja_sustentos': ['id'],
  'wms.ordenes_picking': ['id'],
  'wms.ordenes_picking_lineas': ['id'],
  'wms.guias_remision': ['id'],
  'wms.eventos_pedidos': ['id'],
  'wms.bultos': ['id'],
  'wms.carga_bultos': ['id'],
  'wms.reservas_lote': ['id'],
  'wms.carga_exclusiones': ['id'],
  'wms.bulto_contenido': ['bulto_id', 'linea_id', 'lote_id'],
  'wms.importaciones_pedidos': ['id'],
  'wms.parametros': ['clave'],
  'wms.personal_transporte': ['id'],
  'wms.pedidos_despacho': ['id'],
  'wms.perfil_documental_cliente': ['ruc'],
  'wms.posiciones': ['id'],
  'wms.producto_regulatorio': ['producto_id'],
  'wms.propietarios': ['id'],
  'wms.registros_ls_fr_43_03': ['id'],
  'wms.ruta_cierres': ['id'],
  'wms.ls_fr_impresiones': ['id'],
  'wms.ls_fr_escaneos': ['id'],
  'wms.cargas_iniciales': ['id'],
  'wms.cargas_iniciales_lineas': ['id'],
  'wms.reservas': ['id'],
  'wms.ruta_paradas': ['id'],
  'wms.ruta_versiones': ['id'],
  'wms.rutas': ['id'],
  'wms.salida_lineas': ['id'],
  'wms.salidas': ['id'],
  'wms.saldos': ['posicion_id', 'producto_id', 'lote_id', 'propietario_id', 'estado', 'procedencia_id'],
  'wms.solicitud_ingreso_cambios': ['id'],
  'wms.solicitud_ingreso_lineas': ['id'],
  'wms.solicitud_ingreso_versiones': ['id'],
  'wms.solicitudes_ingreso': ['id'],
  'wms.vehiculos': ['id'],
  // Stock en estado Bajas/Rechazados (OS-6): una fila por ubicación y lote.
  'wms.v_stock_en_bajas': ['posicion_id', 'lote_id'],
  // Vistas sobre Compras (solo existen si Compras está en la misma base): una fila por línea de OC.
  'wms.v_oc_items': ['oc_item_id'],
  'wms.v_oc_lineas': ['oc_item_id'],
}

/** Columnas por las que se ordena una lectura paginada: primero las pedidas, siempre cerrando con la clave única. */
export function ordenPaginado(tabla: string, schema: string, ordenPrevio: readonly string[] = []): string[] {
  const clave = CLAVES_UNICAS[`${schema}.${tabla}`]
  if (!clave || clave.length === 0) {
    throw new Error(
      `Falta la clave única de ${schema}.${tabla} en services/supabase/claves.ts: sin ella no se puede paginar de forma segura.`,
    )
  }
  return [...ordenPrevio.filter((c) => !clave.includes(c)), ...clave]
}
