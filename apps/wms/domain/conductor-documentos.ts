// «Conductor en documentos» (SB-A, D-154 a D-160). TEMPORAL.
//
// La ruta y la auditoría guardan SIEMPRE al conductor real (quien maneja de verdad). El nombre, el documento y la licencia que salen en la guía
// electrónica y en el LS-FR.43.03 los toma el WMS de un parámetro («conductor_en_documentos») que edita el Jefe de Transporte. Cuando Sebas avise,
// el parámetro se elimina y los documentos llevan al conductor real.
//
// CÓMO SE QUITA (una sola decisión, tres sitios que ya la respetan):
//   1. Base de datos: una migración nueva borra la fila `conductor_en_documentos` de `wms.parametros` (`delete from wms.parametros where clave = 'conductor_en_documentos'`).
//      Sin la fila, `wms._conductor_para_documentos` devuelve al conductor real y la pantalla de Recursos ya no muestra el interruptor.
//   2. Demo: `desp(e).conductorEnDocumentos = undefined` (la siembra de `DespachoDemo`).
//   3. Código: este archivo y sus usos (`grep -rn "conductorEnDocumentos\|conductor-documentos" apps/wms`) se borran; `quienFiguraEnDocumentos` pasa a devolver al real.
import type { ConductorEnDocumentos, PersonalTransporte } from './rutas'

export const CLAVE_CONDUCTOR_EN_DOCUMENTOS = 'conductor_en_documentos'

export interface QuienFigura {
  /** El que figura en los documentos. */
  figura?: PersonalTransporte
  /** El conductor real de la ruta (siempre el que se guarda). */
  real?: PersonalTransporte
  /** Los documentos llevan a otra persona distinta del conductor real. */
  distinto: boolean
}

/**
 * A quién nombran los documentos. Con el interruptor sin elegir a nadie, o ya quitado (`parametro` ausente), es el conductor real.
 * Si la persona elegida ya no está disponible se ignora: nunca se imprime un conductor que no puede conducir.
 */
export function quienFiguraEnDocumentos(real: PersonalTransporte | undefined, parametro: ConductorEnDocumentos | undefined, personal: readonly PersonalTransporte[]): QuienFigura {
  const elegido = parametro?.personaId ? personal.find((p) => p.id === parametro.personaId && p.funcion === 'CONDUCTOR' && p.activo) : undefined
  const figura = elegido ?? real
  return { figura, real, distinto: !!figura && !!real && figura.id !== real.id }
}

/** Frase para la pantalla: qué conductor sale en los documentos y cuál es el real. */
export function textoConductorEnDocumentos(q: QuienFigura): string {
  if (!q.real) return 'Todavía no hay conductor en la ruta.'
  if (!q.distinto || !q.figura) return `Los documentos llevan a ${q.real.nombre}, el conductor de la ruta.`
  return `Los documentos llevan a ${q.figura.nombre}. El conductor real de la ruta es ${q.real.nombre} y así queda registrado.`
}

/** Datos de auditoría de cada uso del parámetro, junto al conductor real. */
export function detalleUsoConductor(documento: string, q: QuienFigura): string {
  return `${documento}: en el documento ${q.figura?.nombre ?? '—'} · conductor real ${q.real?.nombre ?? '—'}${q.distinto ? '' : ' (el mismo)'}`
}

export const AVISO_TEMPORAL_CONDUCTOR_DOCUMENTOS =
  'Esto es temporal. Cuando se avise, los documentos llevarán al conductor real de cada ruta. La ruta y el registro siempre guardan al conductor real. Recomendación: pídele a la contadora que confirme por escrito si SUNAT acepta una guía con un conductor distinto del que hace el traslado, y por cuánto tiempo.'

/**
 * Valida el documento de identidad y la licencia de quien conduce (lo mismo que exige la base de datos). DNI: 8 números; carné de extranjería: 9 a 12 letras
 * o números; pasaporte: 6 a 12. La licencia, 9 o 10 letras y números (como pide la guía). Vacío = pendiente (se permite: así se guarda lo que ya se sabe).
 */
export function errorDocumentoPersonal(tipo: string, numero: string, licencia: string): { mensaje: string; errores: Record<string, string> } | null {
  const n = numero.trim().toUpperCase()
  const l = licencia.trim().toUpperCase()
  if (!['DNI', 'CE', 'PASAPORTE'].includes(tipo)) return { mensaje: 'Elige el tipo de documento', errores: { documentoTipo: 'Elige el tipo de documento.' } }
  const reglas: Record<string, [RegExp, string]> = {
    DNI: [/^[0-9]{8}$/, 'El DNI tiene 8 números.'], CE: [/^[A-Z0-9]{9,12}$/, 'El carné de extranjería tiene de 9 a 12 letras o números.'], PASAPORTE: [/^[A-Z0-9]{6,12}$/, 'El pasaporte tiene de 6 a 12 letras o números.'],
  }
  if (n && !reglas[tipo][0].test(n)) return { mensaje: reglas[tipo][1], errores: { dni: reglas[tipo][1] } }
  if (l && !/^[A-Z0-9]{9,10}$/.test(l)) return { mensaje: 'La licencia tiene 9 o 10 letras y números.', errores: { licencia: 'La licencia tiene 9 o 10 letras y números.' } }
  return null
}
