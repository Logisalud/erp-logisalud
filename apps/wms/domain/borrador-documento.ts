// Actas sin todas sus firmas: se pueden descargar (PDF y Excel), pero salen marcadas como borrador. Con las firmas completas, sin marca.
// La misma leyenda va en el PDF y en la hoja de Excel para que nadie confunda un borrador con un acta válida.

export const MARCA_BORRADOR = 'BORRADOR, pendiente de firmas'

/** Acta de Recepción: solo el borrador lleva la marca (una acta anulada tiene su propio aviso; una firmada, ninguno). */
export const actaRecepcionEsBorrador = (a: { estado: 'BORRADOR' | 'FIRMADA' | 'ANULADA' }): boolean => a.estado === 'BORRADOR'

/** Acta organoléptica: mientras no esté firmada por Dirección Técnica (borrador o pendiente de su decisión). */
export const organolepticaEsBorrador = (a: { estado: 'BORRADOR' | 'PENDIENTE_DT' | 'FIRMADA' }): boolean => a.estado !== 'FIRMADA'

/** Nombre del archivo: el borrador lo dice, para que no se archive como si fuera el acta firmada. */
export const nombreArchivoActa = (base: string, borrador: boolean, extension: 'pdf' | 'xlsx'): string => `${base}${borrador ? ' (BORRADOR)' : ''}.${extension}`
