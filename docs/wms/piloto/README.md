# Piloto «como real» del WMS · noviembre

**Decisión de Sebas (2026-10-24).** Producción en diciembre. En noviembre corre un **piloto «como real» de al menos 2 semanas con Odoo como sistema oficial**.

## Estado al 15 de noviembre de 2026
> Este apartado reemplaza a los «Pendientes de la ventana» originales (la ventana ya se hizo). Lo que sigue verifica la base real de hoy.

**Qué entra al piloto (alcance vigente)**
- **Como real:** entradas, calidad, movimientos, conteos y revisión diaria.
- **Pedidos:** el WMS **lee los pedidos reales** de Pedidos y las OC de Compras. Lo que el WMS avisa a Pedidos queda **retenido** mientras dure el piloto (hoy hay 1 aviso retenido); se libera al salir del piloto.
- **Salidas:** orden de salida, picking, conformidad, **pre-guía** (con número reservado) y **guía**. En el piloto la guía se envía a Nubefact en **modo PRUEBA (cuenta DEMO)**: no es documento oficial. `guia_modo = WMS`; el modo `PANEL` (registrar una guía emitida afuera) queda como contingencia.
- **Transporte:** «Mis rutas» para el conductor y el auxiliar de transporte (Llegué, Entregado, No entregado, Rechazado, Incidencia), inspección de la unidad, ruta y vehículo de contingencia.
- **Sin embalaje** (`embalaje_activo = NO`) y **carga por conteo de bultos** (`carga_escaneo_qr = NO`); Lima = ubigeo 15 y 07.
- **Clientes:** seguimiento del pedido por **número de pedido + RUC** (5 pasos, «Van X de Y», botón al vendedor —en el piloto va a un número de prueba—, guía y estado de pagos) y **stock del cliente de almacenamiento** por enlace con token.
- **Vencimiento con solo mes y año:** se usa el **último día del mes** (`vencimiento_dia_por_defecto = ultimo`, decidido por Sebas el 14-nov).
- **Sigue solo en Odoo:** stock oficial, facturación, compras, toma y validación de pedidos y la guía oficial.
- El stock del piloto **no tiene que cuadrar** con Odoo. Al final, la información del piloto se **archiva** y la base se **recrea** con la carga definitiva (destructivo: lo aprueba Sebas, con respaldo). El 1 de diciembre los correlativos se reinician.

**Lo que ya está en la base real** (a mano, sin la 0008): migraciones **0001 a 0069**; 21 asignaciones de rol; 14 teléfonos de vendedores; 5 personas de transporte y 1 vehículo activo.

**Datos hoy:** 659 productos en el catálogo (643 activos; 328 sin contar los códigos de bonificación BO, que heredan la ficha del producto normal) · 467 fichas regulatorias · 447 con registro sanitario y vencimiento · 266 lotes (todos de LOGISSA: 308 saldos, 26,686 unidades) · **0 documentos regulatorios (COA, registro, BPM)** · 0 perfiles de «qué pide cada cliente» · 0 códigos propios de clientes · stock de los clientes de almacenamiento (DIPHASAC, AJR LABS, MEDIC PHARMA LAB, TRIAMED): **0**.

## Pendientes para producción (1 de diciembre)
Marcados con su dueño.

| # | Qué falta | Dueño |
|---|---|---|
| 1 | **Completar los datos de los productos** con el «Excel para completar»: 92 sin ficha, 10 con datos obligatorios faltantes y 50 sin forma, concentración o principio activo. 90 más esperan la **validación de Dirección Técnica**. Todos los productos controlan lote y vencimiento (hoy ninguno lo tiene marcado en el catálogo de Compras: se marcan los 643 activos con el OK de Sebas). | Sebas, Katia |
| 2 | **Stock al 1 de diciembre** de cada cliente y de Logisalud, con lote y vencimiento (hoja «Stock al 1 de diciembre» del Excel maestro; misma carga inicial con informe «Lista para cargar»). Lo que entre después va por Recepciones. | Sebas, Katia |
| 3 | **COA por lote:** subir la carpeta de PDF con **Documentos → Cargar COA en bloque** (el nombre del archivo lleva el código del lote). Se hace **después** de cargar el stock, porque el lote debe existir. | Katia, Sandra |
| 4 | **Qué pide cada cliente** (COA, registro sanitario, BPM, copias) y los **códigos propios de cada cliente** (para su página de stock y su Kardex). | Katia, Sebas |
| 5 | **Datos del formato de destrucción** (LS-FR.56.01; ver D-102 en `decisiones-pendientes.md`). | Sebas (los pasa) |
| 6 | **Probar Nubefact de punta a punta en la cuenta DEMO:** «Probar conexión», emitir, consultar y anular una guía. Luego producción: credenciales y el **correlativo nuevo del 1 de diciembre**. | Roberto, equipo técnico; Sebas |
| 7 | **Contadora:** baja de guías ante SUNAT, conductor distinto en la guía, retenciones. | Sebas |
| 8 | **Flota:** completar vehículos y personal de transporte. | Roberto |
| 9 | **Temperatura:** definir qué pasa con una lectura sobre 24.9 °C. Hoy alerta y no cambia nada. Opciones: tolerancia documentada y aprobada por Katia, o excursión con justificación. **No se ajusta ni se borra una lectura.** | Sebas, Katia |
| 10 | **Salida a producción:** quitar el modo piloto (variable `WMS_MODO_PILOTO`→`WMS_GO_LIVE=1` y parámetro `modo_piloto = no`), aplicar la **0008**, reiniciar los datos del piloto y hacer la **carga definitiva** (ensayo con informe), conectar los avisos a Pedidos, respaldo de Supabase del mismo día y de los archivos del Storage, dirección propia del seguimiento y protección de la Preview. | Equipo técnico; aprueba Sebas |
| 11 | **Criterios Go/No-Go** (`go-no-go.md`): al menos 2 semanas de piloto, saldos sin filas 10 días hábiles seguidos, conteos ≥ 98 %. | Sebas |
| 12 | **Recorrido de prueba** de cada persona con su hoja (`hojas-por-rol/`) y de todos los flujos de punta a punta. | Charlie, Roberto |

**Resuelto:** acta organoléptica versión 2; formato de conformidad SML (no hace falta: está el ranking); seguimiento al cliente; modo de la guía (`WMS`); día por defecto del vencimiento (último).

## Firma del acta de recepción (C)
Cada persona firma desde **su propio celular o PC, con su propio usuario** (no hay PIN ni celular compartido). El orden es: **transportista → responsable de conteo → Jefe de Almacén → Dirección Técnica**; la pantalla dice a quién le toca y no deja firmar antes. Al transportista lo atiende quien recibe: registra su nombre, DNI y placa y le da la pantalla para que dibuje su firma (**Borrar** / **Listo**).

