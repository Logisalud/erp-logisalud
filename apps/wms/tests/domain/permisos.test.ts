import { describe, expect, it } from 'vitest'
import { ETIQUETA_ROL, ROLES_DE_PERSONAL, esPersonal, puede, puedeCrearProducto, puedeEditarRegulatorio, rolesDesdeTexto } from '@/domain/permisos'

describe('permisos por rol', () => {
  it('solo Dirección Técnica aprueba y ajusta', () => {
    expect(puede(['direccion_tecnica'], 'aprobar')).toBe(true)
    expect(puede(['direccion_tecnica'], 'ajustar')).toBe(true)
    for (const r of ['asistente_dt', 'jefe_almacen', 'auxiliar'] as const) {
      expect(puede([r], 'aprobar')).toBe(false)
      expect(puede([r], 'ajustar')).toBe(false)
    }
  })
  it('el Jefe de Almacén ejecuta y verifica, pero no aprueba estados', () => {
    expect(puede(['jefe_almacen'], 'ejecutar')).toBe(true)
    expect(puede(['jefe_almacen'], 'verificar')).toBe(true)
    expect(puede(['jefe_almacen'], 'aprobar')).toBe(false)
  })
  it('Sandra crea productos; Katia los valida; nadie más', () => {
    expect(puedeCrearProducto(['asistente_dt'])).toBe(true)
    // D-37: Katia y Sandra tienen la misma autoridad sobre los datos regulatorios; nadie más.
    expect(puedeEditarRegulatorio(['asistente_dt'])).toBe(true)
    expect(puedeEditarRegulatorio(['direccion_tecnica'])).toBe(true)
    expect(puedeEditarRegulatorio(['jefe_almacen'])).toBe(false)
    expect(puedeEditarRegulatorio(['auxiliar'])).toBe(false)
    expect(puedeCrearProducto(['auxiliar'])).toBe(false)
  })
  it('auditoría solo lee', () => {
    expect(puede(['auditoria_lectura'], 'ejecutar')).toBe(false)
    expect(puede(['auditoria_lectura'], 'auditar')).toBe(true)
  })
  it('ignora roles desconocidos al leer el texto', () => {
    expect(rolesDesdeTexto('jefe_almacen, inventado')).toEqual(['jefe_almacen'])
    expect(rolesDesdeTexto(undefined)).toEqual([])
  })
})

describe('S1: roles y permisos de salidas (D-57, D-70)', () => {
  it('la conformidad es un permiso propio: no la tiene el Jefe de Almacén ni el de Transporte', () => {
    expect(puede(['conformidad_despacho'], 'dar_conformidad')).toBe(true)
    for (const r of ['jefe_almacen', 'jefe_transporte', 'auxiliar', 'asistente_dt', 'direccion_tecnica'] as const) {
      expect(puede([r], 'dar_conformidad'), r).toBe(false)
    }
    // Un usuario con varios roles (p. ej. Sandra: asistente de DT + conformidad) suma sus permisos.
    expect(puede(['asistente_dt', 'conformidad_despacho'], 'dar_conformidad')).toBe(true)
  })
  it('cambiar el lote asignado (D-79): Jefe de Almacén, Jefe de Transporte y auxiliares de almacén', () => {
    for (const r of ['jefe_almacen', 'jefe_transporte', 'auxiliar'] as const) expect(puede([r], 'cambiar_lote_asignado'), r).toBe(true)
    for (const r of ['asistente_dt', 'conductor', 'usuario_cliente', 'direccion_tecnica'] as const) expect(puede([r], 'cambiar_lote_asignado'), r).toBe(false)
  })
  it('Roberto (solo jefe_transporte) tiene todo lo del auxiliar pero no ajusta, aprueba ni configura', () => {
    for (const a of ['ajustar', 'aprobar', 'configurar'] as const) expect(puede(['jefe_transporte'], a), a).toBe(false)
    expect(puede(['jefe_transporte'], 'imprimir_paquete_documental')).toBe(true)
  })
  it('DT 2026-10-17: Jefe de Almacén y Jefe de Transporte tienen TODOS los permisos del auxiliar', () => {
    const auxiliar = (['ver', 'ejecutar', 'verificar', 'cambiar_lote_asignado', 'embalar', 'cargar_ruta'] as const)
    for (const r of ['jefe_almacen', 'jefe_transporte'] as const) for (const a of auxiliar) expect(puede([r], a), `${r} ${a}`).toBe(true)
  })
  it('la Reserva de un lote la aplican y la quitan solo el Jefe de Transporte y Dirección Técnica', () => {
    for (const r of ['jefe_transporte', 'direccion_tecnica'] as const) expect(puede([r], 'reservar_lote'), r).toBe(true)
    for (const r of ['jefe_almacen', 'auxiliar', 'asistente_dt', 'conformidad_despacho', 'admin_wms'] as const) expect(puede([r], 'reservar_lote'), r).toBe(false)
  })
  it('solo Dirección Técnica gestiona los documentos regulatorios', () => {
    expect(puede(['direccion_tecnica'], 'gestionar_documentos_regulatorios')).toBe(true)
    for (const r of ['asistente_dt', 'jefe_almacen', 'jefe_transporte', 'admin_wms'] as const) expect(puede([r], 'gestionar_documentos_regulatorios'), r).toBe(false)
  })
  it('las salidas sin venta las autoriza solo su rol', () => {
    expect(puede(['autoriza_salidas_sin_venta'], 'autorizar_salida_sin_venta')).toBe(true)
    for (const r of ['direccion_tecnica', 'jefe_almacen', 'jefe_transporte', 'admin_wms'] as const) expect(puede([r], 'autorizar_salida_sin_venta'), r).toBe(false)
  })
  it('el usuario de cliente y los roles de campo no tienen ningún permiso ni cuentan como personal', () => {
    for (const r of ['usuario_cliente', 'conductor', 'auxiliar_transporte'] as const) {
      for (const a of ['ver', 'ejecutar', 'verificar', 'exportar', 'auditar', 'dar_conformidad'] as const) expect(puede([r], a), `${r}/${a}`).toBe(false)
      expect(esPersonal([r]), r).toBe(false)
    }
    expect(esPersonal(['auxiliar'])).toBe(true)
    expect(esPersonal(['jefe_transporte'])).toBe(true)
  })
  it('todo rol tiene etiqueta y el personal es un subconjunto de los roles', () => {
    expect(Object.keys(ETIQUETA_ROL)).toHaveLength(13)
    for (const r of ROLES_DE_PERSONAL) expect(ETIQUETA_ROL[r]).toBeTruthy()
    expect(rolesDesdeTexto('usuario_cliente, jefe_transporte')).toEqual(['usuario_cliente', 'jefe_transporte'])
  })
})

