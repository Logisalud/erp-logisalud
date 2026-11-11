// Los parámetros del piloto que la demo imita (en producción son filas de wms.parametros, migración 0061). Por defecto la demo y las pruebas siguen el flujo de antes (embalaje encendido,
// carga por escaneo); `WMS_DEMO_EMBALAJE=NO` y `WMS_DEMO_CARGA_QR=NO` las ponen como el piloto: sin embalaje y con la carga por conteo de bultos.
export const embalajeActivoDemo = () => process.env.WMS_DEMO_EMBALAJE !== 'NO'
export const escaneoQrDemo = () => process.env.WMS_DEMO_CARGA_QR !== 'NO'
