// Umbrales de antigüedad (en días) para alertar pagos sin confirmar contra el
// extracto bancario. Cambiarlos requiere un deploy.
export const UMBRAL_DIAS_CONTADO = 2;
export const UMBRAL_DIAS_CREDITO = 5;

// La pantalla "Pagos sin confirmar" solo alerta pagos registrados desde esta
// fecha por defecto (evita un aluvión de alertas sobre el histórico previo,
// que nunca se conciliará retroactivamente). Se puede ver el histórico
// completo con el filtro correspondiente en la pantalla.
export const ALERTAS_DESDE = '2026-08-11';
