import { describe, expect, it } from 'vitest'
import { puedeAtenderAlerta, puedeFirmarComo, puedePrepararSolicitud } from '@/domain/entradas'
import { puedeAutorizarBaja, puedeEvaluarBaja } from '@/domain/bajas'
import { puedeDecidirAjuste } from '@/domain/inventario'
import type { Accion } from '@/domain/tipos'
import { puedeValidarProducto } from '@/domain/permisos'
import { ACCIONES_SANITARIAS, rolesEfectivos, ETIQUETA_ROL, ROLES_DE_PERSONAL, esPersonal, puede, puedeCrearProducto, puedeEditarRegulatorio, rolesDesdeTexto } from '@/domain/permisos'

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
    for (const r of ['jefe_almacen', 'auxiliar', 'asistente_dt', 'conformidad_despacho'] as const) expect(puede([r], 'reservar_lote'), r).toBe(false)
  })
  it('Dirección Técnica y el Administrador (D-196) gestionan los documentos regulatorios; nadie más', () => {
    expect(puede(['direccion_tecnica'], 'gestionar_documentos_regulatorios')).toBe(true)
    expect(puede(['admin_wms'], 'gestionar_documentos_regulatorios')).toBe(true)
    for (const r of ['asistente_dt', 'jefe_almacen', 'jefe_transporte'] as const) expect(puede([r], 'gestionar_documentos_regulatorios'), r).toBe(false)
  })
  it('las salidas sin venta las autoriza solo su rol', () => {
    expect(puede(['autoriza_salidas_sin_venta'], 'autorizar_salida_sin_venta')).toBe(true)
    for (const r of ['direccion_tecnica', 'jefe_almacen', 'jefe_transporte'] as const) expect(puede([r], 'autorizar_salida_sin_venta'), r).toBe(false)
  })
  it('la venta manual (tipo A) la crea solo el Jefe de Transporte', () => {
    expect(puede(['jefe_transporte'], 'crear_orden_venta_manual')).toBe(true)
    for (const r of ['jefe_almacen', 'auxiliar', 'direccion_tecnica', 'asistente_dt', 'autoriza_salidas_sin_venta', 'usuario_cliente'] as const) expect(puede([r], 'crear_orden_venta_manual'), r).toBe(false)
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


describe('rol Administrador (SB-E, D-196): todo lo operativo y de configuración', () => {
  const efectivos = rolesEfectivos(['admin_wms'])
  it('da de alta y edita productos, prepara solicitudes, atiende alertas de la asistente y gestiona documentos; pero no valida productos', () => {
    expect(puedeCrearProducto(efectivos)).toBe(true)
    expect(puedeEditarRegulatorio(efectivos)).toBe(true)
    expect(puedePrepararSolicitud(efectivos)).toBe(true)
    expect(puedeAtenderAlerta(efectivos, 'asistente_dt')).toBe(true)
    expect(puedeAtenderAlerta(efectivos, 'direccion_tecnica')).toBe(false)
    expect(puedeValidarProducto(efectivos)).toBe(false)
    expect(puedeValidarProducto(['direccion_tecnica'])).toBe(true)
    expect(puedeValidarProducto(['asistente_dt'])).toBe(true)
  })
  it('firma el acta de recepción como Jefe de Almacén, pero no como Dirección Técnica', () => {
    expect(puedeFirmarComo(efectivos, 'JEFE_ALMACEN')).toBe(true)
    expect(puedeFirmarComo(efectivos, 'DIRECCION_TECNICA')).toBe(false)
  })
  it('las decisiones sanitarias siguen siendo solo de Dirección Técnica: aprobar, dar de baja, autorizar ajustes y decidir el acta', () => {
    expect(puedeAutorizarBaja(efectivos)).toBe(false)
    expect(puedeDecidirAjuste(efectivos)).toBe(false)
    expect(puedeEvaluarBaja(efectivos)).toBe(false)
    expect(puede(efectivos, 'aprobar')).toBe(false)
    expect(puede(efectivos, 'ajustar')).toBe(false)
    expect(puede(efectivos, 'autorizar_baja')).toBe(false)
  })
  it('puede hacer cada acción operativa y de configuración que existe fuera de las sanitarias', () => {
    // Clasificación exhaustiva: si aparece una acción nueva en el dominio, TypeScript obliga a decidir aquí si el Administrador la tiene.
    const clasificacion: Record<Accion, 'admin' | 'sanitaria'> = {
      ver: 'admin', ejecutar: 'admin', verificar: 'admin', configurar: 'admin', exportar: 'admin', auditar: 'admin', dar_conformidad: 'admin', cambiar_lote_asignado: 'admin',
      imprimir_paquete_documental: 'admin', gestionar_documentos_regulatorios: 'admin', autorizar_salida_sin_venta: 'admin', preparar_salidas: 'admin', confirmar_salida: 'admin',
      planificar_ruta: 'admin', registrar_documentacion: 'admin', embalar: 'admin', cargar_ruta: 'admin', liberar_unidad: 'admin', reservar_lote: 'admin', anular_guia: 'admin',
      solicitar_baja: 'admin', cerrar_ruta: 'admin', registrar_ls_fr: 'admin', originar_retorno: 'admin', crear_orden_venta_manual: 'admin', entregar_al_transportista_cliente: 'admin',
      aprobar: 'sanitaria', ajustar: 'sanitaria', autorizar_baja: 'sanitaria', registrar_dictamen_cliente: 'sanitaria', marcar_antecedentes_calidad: 'sanitaria', liberar_stock_propietario: 'sanitaria',
    }
    for (const [a, clase] of Object.entries(clasificacion) as [Accion, string][]) expect(puede(efectivos, a), a).toBe(clase === 'admin')
    expect([...ACCIONES_SANITARIAS].sort()).toEqual(Object.entries(clasificacion).filter(([, c]) => c === 'sanitaria').map(([a]) => a).sort())
  })
})

describe('rol Administrador (SB-D, D-194)', () => {
  it('se llama Administrador y tiene todo lo operativo y la configuración', () => {
    expect(ETIQUETA_ROL.admin_wms).toBe('Administrador')
    for (const a of ['configurar', 'preparar_salidas', 'confirmar_salida', 'anular_guia', 'registrar_documentacion', 'originar_retorno', 'crear_orden_venta_manual', 'embalar', 'cerrar_ruta', 'dar_conformidad', 'autorizar_salida_sin_venta', 'auditar'] as const)
      expect(puede(['admin_wms'], a), a).toBe(true)
  })
  it('nunca firma decisiones sanitarias: esas son solo de Dirección Técnica', () => {
    for (const a of ACCIONES_SANITARIAS) expect(puede(['admin_wms'], a), a).toBe(false)
    expect(puede(['admin_wms'], 'aprobar')).toBe(false)
    expect(puede(['direccion_tecnica'], 'aprobar')).toBe(true)
    expect(puede(rolesEfectivos(['admin_wms']), 'autorizar_baja')).toBe(false)
  })
  it('para las funciones que preguntan por rol cuenta como jefe y auxiliar, nunca como Dirección Técnica ni su asistente', () => {
    const r = rolesEfectivos(['admin_wms'])
    expect(r).toEqual(expect.arrayContaining(['admin_wms', 'jefe_almacen', 'jefe_transporte', 'auxiliar']))
    expect(r).not.toContain('direccion_tecnica'); expect(r).not.toContain('asistente_dt')
    expect(rolesEfectivos(['auxiliar'])).toEqual(['auxiliar'])
  })
})
