// Clases de los botones de opción (píldoras, radios, pestañas): el estado activo y el inactivo viven en constantes separadas
// para que cada combinación de color y texto sea explícita (verde sobre verde, gris sobre blanco).

export const PILDORA_ACTIVA = 'border-green-300 bg-green-50 text-green-900'
export const PILDORA_ACTIVA_ROJA = 'border-red-300 bg-red-50 text-red-900'
export const PILDORA_INACTIVA = 'border-gray-300 bg-white text-gray-800'
export const PILDORA_INACTIVA_HOVER = 'border-gray-300 bg-white text-gray-800 hover:border-gray-400'

export const SEGMENTO_CONFORME = 'bg-green-100 text-green-900'
export const SEGMENTO_NO_CONFORME = 'bg-red-100 text-red-900'
export const SEGMENTO_NO_APLICA = 'bg-gray-200 text-gray-900'
export const SEGMENTO_INACTIVO = 'text-gray-700 hover:bg-gray-50'

export const TAB_ACTIVA = 'bg-green-100 text-green-900'
export const TAB_INACTIVA = 'text-gray-700 hover:bg-gray-100'

export const NAV_ACTIVO = 'bg-green-50 text-green-800'
export const NAV_INACTIVO = 'text-gray-700 hover:bg-gray-100'

export const CHIP_OK = 'border-green-200 bg-green-50 text-green-800'
export const CHIP_NEUTRO = 'border-gray-300 bg-gray-100 text-gray-800'
export const CONTADOR_AMBAR = 'bg-amber-100 text-amber-900'
export const PILDORA_DESHABILITADA = 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500'

// Filas de listas de selección (origen, destino) y pasos de la hoja inferior.
export const OPCION_ELEGIDA = 'bg-green-50'
export const OPCION_LIBRE = 'hover:bg-gray-50 active:bg-gray-100'
export const PASO_ACTIVO = 'bg-green-50 font-semibold text-green-900 ring-1 ring-green-700'
export const PASO_INACTIVO = 'text-gray-800 disabled:text-gray-500'
export const PILDORA_ACTIVA_FUERTE = 'border-green-700 bg-green-50 font-semibold text-green-900'

// Chips de estado de las pantallas de operación (texto + ícono, nunca solo color).
export const CHIP_AVISO = 'border-amber-300 bg-amber-50 text-amber-900'
export const CHIP_TEAL = 'border-teal-300 bg-teal-50 text-teal-900'
export const CHIP_SIN_MARCAR = 'border-gray-300 bg-gray-50 text-gray-800'
