// Los archivos de la demostración viven en la memoria del servidor (se pierden al reiniciar). Módulo sin dependencias: lo usan `archivos.ts` y el motor de la demo.
const g = globalThis as unknown as { __wmsArchivos?: Map<string, Buffer> }
export const archivosEnMemoria: Map<string, Buffer> = (g.__wmsArchivos ??= new Map<string, Buffer>())
