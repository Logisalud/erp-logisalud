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
