import { describe, expect, it } from 'vitest'
import {
  PARAMETROS_FORMATO_BAJA, contenidoDeOrden, faltantesEvaluacion, motivoParaFormato, partesDeFecha, primerFaltante, puedeAutorizarBaja, puedeEvaluarBaja, puedeSolicitarBaja, puedeTrasladarBaja,
  resumenSustento, siguientePasoBaja, sustentoFaltante, validarArchivoSustento, validarLineaBaja, type LineaBajaVista, type OrdenBajaVista,
} from '@/domain/bajas'

const HOY = '2026-10-17'
type Ctx = Parameters<typeof validarLineaBaja>[2]
const ctx: Ctx = { lote: 'L1', vence: '2026-09-30', propietarioDelLote: 'p1', propietarioDeLaBaja: 'p1', areaPosicion: 'APROBADOS', disponible: 20, posicion: 'F-1.1' }
const linea = (extra: Partial<Ctx> = {}, l: { cantidad?: number; motivo?: string; estado?: string } = {}) =>
  validarLineaBaja(1, { loteId: 'l1', posicionId: 'x', estado: (l.estado ?? 'APROBADO') as 'APROBADO', cantidad: l.cantidad ?? 5, motivo: (l.motivo ?? 'VENCIDO') as 'VENCIDO' }, { ...ctx, ...extra }, HOY)

describe('permisos de las bajas', () => {
  it('solicitan DT, su asistente y el Jefe de Almacén; autoriza solo DT; evalúan la asistente y DT; traslada quien ejecuta movimientos', () => {
    expect(puedeSolicitarBaja(['direccion_tecnica'])).toBe(true); expect(puedeSolicitarBaja(['asistente_dt'])).toBe(true); expect(puedeSolicitarBaja(['jefe_almacen'])).toBe(true)
    expect(puedeSolicitarBaja(['auxiliar'])).toBe(false); expect(puedeSolicitarBaja(['auditoria_lectura'])).toBe(false)
    expect(puedeAutorizarBaja(['direccion_tecnica'])).toBe(true); expect(puedeAutorizarBaja(['asistente_dt', 'jefe_almacen'])).toBe(false)
    expect(puedeEvaluarBaja(['asistente_dt'])).toBe(true); expect(puedeEvaluarBaja(['jefe_almacen'])).toBe(false)
    expect(puedeTrasladarBaja(['auxiliar'])).toBe(true); expect(puedeTrasladarBaja(['auditoria_lectura'])).toBe(false)
  })
})

describe('validar una línea de baja (mismos mensajes que la base)', () => {
  it('una línea válida pasa', () => expect(linea()).toBeNull())
  it('una baja es de un solo propietario', () => expect(linea({ propietarioDelLote: 'p2' })).toMatch(/otro propietario/))
  it('lo que está en Bajas no se vuelve a dar de baja; lo de Despacho se resuelve en la salida', () => {
    expect(linea({ areaPosicion: 'BAJAS_RECHAZADOS' })).toMatch(/ya está en Bajas/)
    expect(linea({ areaPosicion: 'DESPACHO' })).toMatch(/Despacho/)
  })
  it('cantidad entera y positiva, y no más de lo disponible', () => {
    expect(linea({}, { cantidad: 0 })).toMatch(/mayor que cero/); expect(linea({}, { cantidad: 1.5 })).toMatch(/mayor que cero/)
    expect(linea({ comprometido: 7 }, { cantidad: 21 })).toMatch(/Disponible en F-1\.1 \(APROBADO\): 20 unidades \(otras 7 están comprometidas/)
  })
  it('«vencido» solo para un lote vencido (vence hoy todavía no lo está)', () => {
    expect(linea({ vence: '2026-10-17' })).toMatch(/no está vencido \(vence el 17\/10\/2026\)/)
    expect(linea({ vence: undefined })).toMatch(/sin fecha/)
    expect(linea({ vence: '2027-03-01' }, { motivo: 'DETERIORO_DANO' })).toBeNull()
  })
  it('elige un estado y un motivo válidos', () => {
    expect(linea({}, { motivo: 'OTRO' })).toMatch(/elige el motivo/); expect(linea({}, { estado: 'COSA' })).toMatch(/elige el estado/)
  })
})

describe('sustento por motivo (aprobado por Katia)', () => {
  const base = { n: 1, lote: 'L1', vence: '2026-09-30', sustentos: [] as LineaBajaVista['sustentos'], evaluacion: undefined as LineaBajaVista['evaluacion'], venceConfirmada: undefined as string | undefined }
  const ev = (conclusion: 'CONFORME' | 'NO_CONFORME', checklist: Record<string, 'C' | 'NC' | 'NA'>) => ({ id: 'e', version: 1, checklist, certAnalisis: null, observacion: 'x', conclusion, evaluadaPor: 'Sandra', evaluadaEn: '2026-10-17T10:00:00Z' })
  it('VENCIDO: la fecha la confirma Dirección Técnica; si el vencimiento del lote cambia, se confirma otra vez', () => {
    expect(sustentoFaltante({ ...base, motivo: 'VENCIDO' }, HOY)).toMatch(/Dirección Técnica debe confirmar la fecha de vencimiento/)
    expect(sustentoFaltante({ ...base, motivo: 'VENCIDO', venceConfirmada: '2026-09-30' }, HOY)).toBeNull()
    expect(sustentoFaltante({ ...base, motivo: 'VENCIDO', venceConfirmada: '2026-08-30' }, HOY)).toMatch(/confirmarlo otra vez/)
    expect(sustentoFaltante({ ...base, motivo: 'VENCIDO', vence: '2027-01-01' }, HOY)).toMatch(/no está vencido/)
  })
  it('DETERIORO_DANO: una evaluación NO CONFORME que marque algo no conforme', () => {
    expect(sustentoFaltante({ ...base, motivo: 'DETERIORO_DANO' }, HOY)).toMatch(/falta la evaluación/)
    expect(sustentoFaltante({ ...base, motivo: 'DETERIORO_DANO', evaluacion: ev('CONFORME', { a: 'C' }) }, HOY)).toMatch(/concluye CONFORME/)
    expect(sustentoFaltante({ ...base, motivo: 'DETERIORO_DANO', evaluacion: ev('NO_CONFORME', { a: 'C' }) }, HOY)).toMatch(/ningún punto no conforme/)
    expect(sustentoFaltante({ ...base, motivo: 'DETERIORO_DANO', evaluacion: ev('NO_CONFORME', { a: 'NC' }) }, HOY)).toBeNull()
  })
  const adj = (tipo: 'ALERTA_DIGEMID' | 'COMUNICACION_PROVEEDOR') => [{ id: 's', tipo, nombreArchivo: 'a.pdf', archivoRef: 'r', agregadoPor: 'x', agregadoEn: '2026-10-17T10:00:00Z' }]
  it('ALERTA_DIGEMID y OBSERVACION_PROVEEDOR piden su archivo, del tipo que corresponde', () => {
    expect(sustentoFaltante({ ...base, motivo: 'ALERTA_DIGEMID' }, HOY)).toMatch(/falta adjuntar la alerta/)
    expect(sustentoFaltante({ ...base, motivo: 'ALERTA_DIGEMID', sustentos: adj('COMUNICACION_PROVEEDOR') }, HOY)).toMatch(/falta adjuntar la alerta/)
    expect(sustentoFaltante({ ...base, motivo: 'ALERTA_DIGEMID', sustentos: adj('ALERTA_DIGEMID') }, HOY)).toBeNull()
    expect(sustentoFaltante({ ...base, motivo: 'OBSERVACION_PROVEEDOR', sustentos: adj('COMUNICACION_PROVEEDOR') }, HOY)).toBeNull()
  })
  it('el resumen para la tabla quita el prefijo de línea', () => {
    const l = { faltante: 'Línea 2 (lote L9): falta adjuntar la alerta' } as LineaBajaVista
    expect(resumenSustento(l)).toEqual({ completo: false, texto: 'Falta adjuntar la alerta' })
    expect(resumenSustento({ faltante: null } as LineaBajaVista).completo).toBe(true)
  })
})

describe('la evaluación y el archivo', () => {
  it('la evaluación pide checklist, material, observación y conclusión; no conforme pide marcar algo', () => {
    expect(faltantesEvaluacion({ checklist: {}, certAnalisis: null, observacion: '', conclusion: null }).join(' ')).toMatch(/material[\s\S]*checklist[\s\S]*observación[\s\S]*conclusión/)
    expect(faltantesEvaluacion({ checklist: { emb_cerrado: 'C' }, certAnalisis: null, observacion: 'x', conclusion: 'NO_CONFORME' }).some((m) => /al menos un punto como no conforme/.test(m))).toBe(true)
  })
  it('el archivo es PDF o imagen, no vacío y de hasta 10 MB', () => {
    expect(validarArchivoSustento('alerta.PDF', 100)).toBeNull(); expect(validarArchivoSustento('foto.jpeg', 100)).toBeNull()
    expect(validarArchivoSustento('hoja.xlsx', 100)).toMatch(/PDF o una imagen/); expect(validarArchivoSustento('a.pdf', 0)).toMatch(/vacío/)
    expect(validarArchivoSustento('a.pdf', 10 * 1024 * 1024 + 1)).toMatch(/10 MB/)
  })
})

describe('siguiente paso y documento LS-FR.56.01', () => {
  const lin = (extra: Partial<LineaBajaVista> = {}): LineaBajaVista => ({
    id: 'l', n: 1, productoId: 'p', productoCodigo: 'P1', producto: 'Paracetamol 500 mg', presentacion: 'Caja x 100', registroSanitario: 'EG-123', loteId: 'x', lote: 'L1', vence: '2026-06-30', posicionId: 'a', posicion: 'F-1.1',
    estadoOrigen: 'APROBADO', cantidad: 12, motivo: 'VENCIDO', vencePropuesta: '2026-06-30', venceConfirmada: '2026-06-30', sustentos: [], evaluaciones: 0, faltante: null, ...extra,
  })
  const orden = (extra: Partial<OrdenBajaVista> = {}): OrdenBajaVista => ({
    id: 'o', numero: 'BJ-2026-00001', estado: 'SOLICITADA', propietarioId: 'p1', propietarioCodigo: 'LOGISSA', propietario: 'Logissa S.A.C.', solicitadaPor: 'Charlie', solicitadaPorId: 'u', solicitadaEn: '2026-10-17T10:00:00Z', lineas: [lin()], unidades: 12, ...extra,
  })
  it('quién y qué sigue en cada estado', () => {
    expect(siguientePasoBaja(orden({ lineas: [lin({ faltante: 'x' })] }))).toMatchObject({ quien: 'Quien pidió la baja', tono: 'accion', texto: expect.stringContaining('1 línea') })
    expect(siguientePasoBaja(orden())).toMatchObject({ quien: 'Dirección Técnica (Katia)', texto: 'Revisar el sustento y autorizar' })
    expect(siguientePasoBaja(orden({ estado: 'EMITIDA' }))).toMatchObject({ tono: 'accion', texto: expect.stringContaining('área de Bajas') })
    expect(siguientePasoBaja(orden({ estado: 'EMITIDA', traslado: { ordenMovimientoId: 'm', numero: 'MOV-1', estado: 'EJECUTADO' } }))).toMatchObject({ tono: 'listo' })
    for (const e of ['RECHAZADA', 'CANCELADA', 'ANULADA'] as const) expect(siguientePasoBaja(orden({ estado: e })).tono).toBe('cerrada')
  })
  it('sin sustento no se autoriza: el primer faltante lleva su línea', () => {
    expect(primerFaltante(orden())).toBeNull()
    expect(primerFaltante(orden({ lineas: [lin(), lin({ n: 2, faltante: 'Línea 2 (lote L2): falta adjuntar la alerta' })] }))).toBe('Sin sustento no se da de baja. Línea 2 (lote L2): falta adjuntar la alerta')
  })
  it('el contenido lleva los campos del formato: número, fecha, solicitante, motivo de traslado y, por línea, producto, presentación, R.S., lote, vencimiento, cantidad y motivo', () => {
    const c = contenidoDeOrden(orden(), '2026-10-17')
    expect(c).toMatchObject({ formato: 'LS-FR.56.01', poe: 'LS-POE.11.01', numero: 'BJ-2026-00001', fecha: '2026-10-17', solicitante: { nombre: 'Katia Zapata', cargo: 'Dirección Técnica' }, motivoTraslado: 'Traslado al área de baja' })
    expect(c.lineas[0]).toMatchObject({ n: 1, producto: 'Paracetamol 500 mg', presentacion: 'Caja x 100', registroSanitario: 'EG-123', lote: 'L1', vence: '2026-06-30', cantidad: 12, motivo: 'VENCIDO' })
    expect(c.lineas[0].sustento).toMatch(/Venció el 30\/06\/2026/)
    expect(PARAMETROS_FORMATO_BAJA.formato).toBe(c.formato)
  })
  it('SB-C (D-170): el código oficial es LS-FR.56.01 y Katia Zapata firma el Visto Bueno; el nombre y el cargo del V°/B° vienen de la base', () => {
    const c = contenidoDeOrden(orden(), '2026-10-23')
    expect(c.formato).toBe('LS-FR.56.01')
    expect(c.formato).not.toMatch(/POE/)
    expect(c.vistoBueno).toEqual({ nombre: 'Katia Zapata', cargo: 'Dirección Técnica' })
    expect(contenidoDeOrden(orden(), '2026-10-23', { ...PARAMETROS_FORMATO_BAJA, vistoBuenoNombre: 'Otra Persona', vistoBuenoCargo: 'Otro cargo' }).vistoBueno).toEqual({ nombre: 'Otra Persona', cargo: 'Otro cargo' })
  })
  it('los parámetros del formato vienen de la base (los pendientes de Katia no están escritos en el PDF)', () => {
    const c = contenidoDeOrden(orden(), '2026-10-17', { ...PARAMETROS_FORMATO_BAJA, solicitanteNombre: 'Katia Zapata Rojas', solicitanteCargo: 'Directora Técnica' })
    expect(c.solicitante).toEqual({ nombre: 'Katia Zapata Rojas', cargo: 'Directora Técnica' })
  })
  it('el motivo del formato dice la fecha de vencimiento y el detalle; la fecha se parte en día, mes y año', () => {
    const c = contenidoDeOrden(orden({ lineas: [lin({ detalle: 'cajas mojadas' })] }), '2026-10-17').lineas[0]
    expect(motivoParaFormato(c)).toBe('Vencido (venció el 30/06/2026): cajas mojadas')
    expect(motivoParaFormato({ ...c, motivo: 'DETERIORO_DANO', motivoTexto: 'Deterioro o daño', detalle: undefined })).toBe('Deterioro o daño')
    expect(partesDeFecha('2026-10-07')).toEqual({ dia: '07', mes: '10', anio: '2026' })
  })
})
