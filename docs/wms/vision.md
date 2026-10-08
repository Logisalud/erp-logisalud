> **Nota (2026-10-08):** el *Addendum — flujo real de ingreso* (ver `analisis-addendum-inbound.md` y `reglas-negocio.md`, «Flujo de ingreso») corrige este documento en lo que se refiere al ingreso: la recepción empieza con la Solicitud de Ingreso, la cantidad física se captura una sola vez en el WMS y las devoluciones no pasan por Cuarentena.

# Visión del WMS de LOGISALUD

> Norte de producto. NO son instrucciones de alcance: el alcance y el orden los define el prompt vigente y docs/wms/reglas-negocio.md.

QUIERO QUE DISEÑES Y CONSTRUYAS EL WMS COMPLETO DE LOGISALUD.

Actúa simultáneamente como:

- Principal Product Engineer
- Software Architect
- Senior Full-Stack Engineer
- WMS Domain Expert
- UX/Product Designer especializado en software operacional
- especialista en logística farmacéutica
- especialista en sistemas auditables
- Data / Reporting Product Designer
- QA/Test Architect

No quiero un ERP genérico.
No quiero copiar SAP.
No quiero solamente CRUDs.
No quiero un software que requiera saber logística para poder utilizarlo.

Quiero construir un WMS moderno, visual, rápido, fácil de aprender, muy bien pensado y agradable de usar.

Debe ser serio para una operación farmacéutica regulada, pero simple para el usuario.

La experiencia debe combinar:

- claridad;
- trazabilidad;
- visualización;
- automatización;
- excelente UX;
- reportes accionables;
- joyfulness;
- velocidad operativa.

## 0. VISIÓN DEL PRODUCTO

LOGISALUD es una distribuidora y operador logístico farmacéutico peruano.

El WMS debe convertirse progresivamente en la:

FUENTE DE VERDAD FÍSICA DEL ALMACÉN.

Debe poder responder con absoluta trazabilidad:

- qué producto físico tenemos;
- cuánto tenemos;
- a quién pertenece;
- de qué lote;
- cuándo vence;
- dónde está;
- de dónde vino;
- qué estado sanitario tiene;
- si está listo para vender;
- si tiene un bloqueo;
- qué movimientos tuvo;
- qué pedido lo utilizó;
- qué lote se seleccionó;
- quién lo recogió;
- quién lo verificó;
- cómo se embaló;
- dónde espera el despacho;
- en qué despacho salió;
- en qué ruta viajó;
- quién lo transportó;
- quién modificó algo;
- cuándo ocurrió;
- por qué ocurrió.

Principio central:

“UN DATO SE ESCRIBE UNA SOLA VEZ.”

Si Compras ya sabe algo:
WMS no debe pedirlo otra vez.

Si Pedidos ya sabe algo:
WMS no debe pedirlo otra vez.

## 1. EXPERIENCIA MULTIDISPOSITIVO

El WMS será principalmente utilizado desde PC.

Pero quiero PARIDAD FUNCIONAL prácticamente completa entre:

- PC;
- laptop;
- tablet;
- teléfono.

La regla es:

SI UNA OPERACIÓN SE PUEDE HACER EN PC,
TAMBIÉN DEBE PODER HACERSE EN TELÉFONO,

salvo una razón UX/técnica fuerte expresamente documentada.

La diferencia entre dispositivos es:

PRESENTACIÓN,
DENSIDAD,
INTERACCIÓN,

NO reglas de negocio.

### PC / LAPTOP

Es la experiencia principal y debe aprovechar el espacio disponible.

Ideal para:

- dashboard;
- reportes;
- Visual Warehouse;
- inventario;
- recepciones;
- calidad;
- movimientos;
- conteos;
- picking;
- packing;
- despacho;
- rutas;
- auditoría;
- configuración;
- maestros;
- análisis;
- planificación.

Usar cuando aporte valor:

- tablas densas pero legibles;
- split views;
- side panels;
- drawers;
- filtros persistentes;
- saved views;
- acciones masivas seguras;
- búsqueda global;
- keyboard shortcuts;
- gráficos;
- Visual Warehouse.

### TELÉFONO

NO es una versión limitada.

Debe poder:

- recibir;
- registrar lotes;
- registrar vencimientos;
- revisar inventario;
- aprobar si el rol lo permite;
- cambiar condición;
- crear movimientos;
- verificar movimientos;
- hacer conteos;
- crear/revisar bloqueos;
- hacer picking;
- verificar;
- packing;
- staging;
- despachar;
- administrar rutas;
- buscar;
- consultar historial;
- ver reportes adaptados;
- consultar auditoría según permiso;
- realizar maestros simples cuando corresponda.

Pero la interfaz debe adaptarse.

En móvil:

UNA TAREA
→ UNA DECISIÓN
→ SIGUIENTE PASO.

No tablas gigantes.

Convertir tablas en:

cards,
listas,
steps,
accordions,
detail screens.

Usar:

- botones grandes;
- sticky primary action;
- mínimo tipeo;
- selects inteligentes;
- búsqueda;
- autocompletado;
- cámara/escaneo cuando posteriormente se habilite;
- feedback inmediato.

### TABLET

Debe funcionar como híbrido:

- capacidades completas;
- buena operación táctil;
- Visual Warehouse completo;
- split views cuando haya espacio.

### EXCEPCIÓN: VISUAL WAREHOUSE

Visual Warehouse completo:

PC
+
tablet.

En teléfono no es obligatorio mostrar el plano 2D completo.

En teléfono debe existir:

- buscar ubicación;
- buscar producto;
- buscar lote;
- ver dónde está;
- ver contenido de ubicación;
- ver ubicación destino;
- abrir detalle;
- iniciar movimiento;
- iniciar conteo;
- confirmar picking.

Ejemplo:

“Dapagliflozina está en A-10.2”

en vez de obligar a manipular un mapa complejo en 390px.

## 2. ARQUITECTURA GENERAL

Repositorio:

erp-logisalud

Monorepo.

Aplicaciones relevantes:

apps/compras
apps/pedidos
apps/cobranzas

Paquetes relevantes:

packages/auth
packages/design-system

Crear:

apps/wms

como cuarta aplicación independiente.

NO construir WMS dentro de Compras.

NO construir WMS dentro de Pedidos.

## 3. FUENTES DE VERDAD

ERP COMPRAS gobierna:

- Orden de Compra;
- proveedor;
- factura;
- guías;
- documentos comerciales/económicos;
- cantidad física agregada recibida.

WMS gobierna:

- realidad física;
- lote;
- vencimiento;
- quantity por lote;
- owner;
- ubicación;
- estado sanitario;
- condición operativa;
- holds;
- inventario;
- movimientos;
- conteos;
- ajustes;
- allocation;
- picking;
- verificación;
- packing;
- staging;
- despacho;
- ruteo;
- trazabilidad logística.

ERP PEDIDOS gobierna:

- pedido;
- cliente;
- dirección;
- vendedor;
- condiciones comerciales;
- aprobaciones comerciales;
- preferencias del cliente;
- reservas/compromisos comerciales;
- disponible comercial.

DIRECCIÓN TÉCNICA gobierna:

- decisiones sanitarias.

## 4. REGLAS SANITARIAS CERRADAS

Estas reglas NO se reinterpretan.

### 4.1 RECEPCIÓN

Todo inventario recibido por compra:

entra inicialmente en:

CUARENTENA.

“Recepción” NO es un estado.

Es un proceso.

### 4.2 RUTA NORMAL

Para una recepción normal:

CUARENTENA
↓
APROBADO

Producto permanece en Cuarentena hasta que DT aprueba.

### 4.3 REGLA ABSOLUTA

APROBADO JAMÁS VUELVE A CUARENTENA.

Nunca permitir:

APROBADO
→
CUARENTENA.

Esta transición debe ser rechazada incluso a nivel dominio/server/database cuando corresponda.

### 4.4 PROBLEMA POST-APROBACIÓN

Si después de estar Aprobado aparece una incidencia:

NO usar Cuarentena.

Diseñar concepto separado:

inventory_hold
quality_hold
operational_block
review_required

o equivalente.

No convertir ese concepto automáticamente en regla sanitaria sin validación.

El objetivo es poder impedir:

- venta;
- allocation;
- picking;
- despacho;

sin destruir el estado sanitario Aprobado.

### 4.5 BAJAS / RECHAZADOS

Un producto APROBADO puede posteriormente pasar a:

BAJAS / RECHAZADOS

cuando:

- Dirección Técnica lo dispone;
- existe motivo;
- existe sustento.

Transición válida:

APROBADO
→
BAJAS/RECHAZADOS.

Cuando ocurre:

operational_condition = NULL / N/A.

No completar la baja sin trazabilidad documental.

No hardcodear todavía documentos regulatorios específicos si no están formalmente cerrados.

## 5. CONDICIÓN OPERATIVA

Estado sanitario,
condición operativa,
ubicación

son dimensiones distintas.

Condición operativa solo existe cuando:

state = APPROVED.

Valores actuales:

VERDE
=
Aprobado + listo para venta.

ÁMBAR
=
Aprobado pero requiere acondicionamiento operativo permitido.

Regla:

state != APPROVED
→ operational_condition = NULL.

Stock físicamente vendible:

APPROVED
+
GREEN
+
no bloqueado para venta.

## 6. DEVOLUCIONES

DEVOLUCIÓN NO ES UN ESTADO.

Es otro proceso/origen de ingreso.

Nunca:

state = devolución.

Debe existir una dimensión separada:

inventory_origin
source_process
inbound_type

Ejemplos posibles:

PURCHASE_RECEIPT
CUSTOMER_RETURN
TRANSFER
AUTHORIZED_ADJUSTMENT
OTHER

No definir todavía el flujo sanitario completo de Devoluciones.

Debe quedar preparada la arquitectura.

## 7. CONTRAMUESTRA

Existe físicamente una zona Contramuestra.

Eso NO demuestra que:

CONTRAMUESTRA

deba ser estado sanitario.

No crear un enum por intuición.

Dejar flexible hasta estudiar el proceso.

## 8. UBICACIÓN ≠ ESTADO

Ejemplo:

location = J-12.1

state = BAJA

son datos distintos.

Aunque J-12.1 sea físicamente la zona de Bajas.

Mover:

A-10.2
→
J-12.1

NO cambia estado automáticamente.

## 9. TOPOLOGÍA DEL ALMACÉN

Jerarquía conceptual:

warehouse
→ zone
→ rack / floor_area
→ bay / position
→ level
→ location

Debe soportar:

- pallet rack;
- posiciones de piso;
- recepción;
- cuarentena;
- aprobados;
- embalaje;
- staging;
- despacho;
- bajas;
- devoluciones;
- contramuestra;
- zonas compartidas;
- zonas exclusivas.

No forzar todo a estructura rack.

## 10. INVENTORY OWNER

LOGISALUD administra inventario que puede pertenecer a diferentes clientes/cuentas.

Analizar el modelo actual:

inventory_source_id.

Determinar si representa:

inventory_owner,
warehouse_client,
source,

o varios conceptos mezclados.

No crear nueva entidad antes de auditar.

El inventario debe poder identificar a quién pertenece.

## 11. MODELO DE INVENTARIO

Conceptualmente:

product
+
lot
+
expiry
+
owner
+
location
+
sanitary_state
+
operational_condition
+
quantity.

Pero NO usar solamente una tabla balance como verdad histórica.

Debe existir:

INVENTORY LEDGER / MOVEMENT HISTORY.

Todo saldo actual debe poder explicarse.

## 12. LOTES

Lote debe permitir:

- product;
- lot_code;
- expiry_date;
- owner;
- origin;
- receipt;
- documents;
- inventory balances;
- movements;
- allocations;
- picks;
- dispatches;
- audit history.

## 13. RECEPCIÓN

Compras registra:

cantidad_fisica.

WMS recibe:

recepción pendiente.

WMS completa:

lote,
vencimiento,
cantidad por lote.

Invariante:

SUM(lot_allocations.quantity)
=
cantidad_fisica de Compras.

Ejemplo:

Compras:
6.

WMS:
Lote A = 4
Lote B = 2

válido.

4 + 3

inválido.

Mensaje humano (addendum 2026-10-08: se compara contra la Solicitud, no contra Compras):

“Esperábamos 6 y encontramos 7.”

Se actualiza la Solicitud con su historial y se continúa.

Al confirmar:

compra o ingreso de cliente → CUARENTENA.
devolución → ÁREA DE DEVOLUCIONES (estado «Devoluciones»), nunca Cuarentena.

## 14. RECEPCIONES PARCIALES

Auditar código actual.

Puede existir soporte para:

1 OC
→
N recepciones.

Negocio debe decidir conscientemente.

No resolver arbitrariamente.

Diseñar dominio que no obligue a rehacer todo después.

## 15. CALIDAD

Crear experiencia específica para DT.

Ejemplo:

PENDIENTES DE DIRECCIÓN TÉCNICA

3 pendientes.

Mostrar:

- producto;
- lote;
- recepción;
- fecha;
- cantidad;
- documentos;
- ubicación;
- historial.

Acción:

[Revisar]

DT puede:

aprobar,
registrar decisión posterior de baja,
vincular sustento,
consultar historial.

## 16. VERDE / ÁMBAR

Una vez Aprobado:

Charlie/Almacén asigna:

VERDE
o
ÁMBAR.

Registrar:

usuario;
timestamp;
from;
to;
motivo cuando aplique.

## 17. HOLD / BLOQUEO

Debe ser independiente de estado sanitario.

Propuesta conceptual:

inventory_hold.

Campos:

inventory_scope
reason
created_by
created_at
released_by
released_at
notes
blocks_sale
blocks_allocation
blocks_pick
blocks_move
blocks_dispatch

Tipos posibles futuros:

QUALITY_REVIEW
RECALL
COMMERCIAL
OPERATIONAL
DOCUMENTARY

No congelar tipos regulatorios sin validación.

## 18. DISPONIBILIDAD

WMS calcula:

physical_sellable

como:

APPROVED
+
GREEN
-
holds incompatibles.

Pedidos calcula:

commercial_available
=
physical_sellable
-
reservas/compromisos.

## 19. INTEGRACIÓN WMS → PEDIDOS

Actualmente el stock se publica diariamente.

Con WMS:

debe convertirse en proyección automática.

Diseñar:

- idempotencia;
- reintentos;
- observabilidad;
- errores;
- timestamps;
- versionado;
- reconciliación.

Mantener fallback actual hasta estabilización.

## 20. SELECCIÓN DE LOTES

NO usar FEFO rígido.

Default:

vencimiento MÁS PRÓXIMO.

Pero cliente puede pedir:

- vencimiento más lejano;
- lote específico.

Preferencia debe poder existir idealmente por línea de pedido.

Conceptos posibles:

DEFAULT_NEAREST_EXPIRY
FARTHEST_EXPIRY
SPECIFIC_LOT

Registrar:

requested_strategy
suggested_lot
selected_lot
reason/override cuando corresponda.

## 21. ALLOCATION

Antes del picking:

WMS reserva inventario físico.

Considerar:

- owner;
- product;
- lot;
- expiry;
- quantity;
- state;
- condition;
- holds;
- preference;
- existing allocations.

Nunca asignar:

- Cuarentena;
- ÁMBAR;
- Baja;
- hold incompatible.

## 22. PICKING

Pedidos listo para Operaciones:

→ WMS crea outbound order
→ allocation
→ pick tasks.

Estados:

pending
assigned
in_progress
completed
exception.

PC:

- cola de pedidos;
- prioridades;
- progreso;
- operario;
- ubicación;
- excepción.

Móvil:

“Tu siguiente tarea”

📍 A-10.2

Dapagliflozina 10 mg

Lote ABC123

12 unidades

[Estoy aquí]

después:

[Confirmar 12 unidades]

## 23. SECUENCIA DE PICKING

Primera versión:

orden razonable de ubicaciones.

Más adelante:

path optimization.

No construir algoritmo sofisticado prematuramente.

## 24. VERIFICACIÓN

Después del picking:

validar:

- producto;
- lote;
- quantity;
- pedido.

Registrar:

verificador;
timestamp;
resultado;
diferencias.

## 25. PACKING

Entidad:

package / packing_unit.

Pedido puede tener:

1..N bultos.

Registrar:

- contenidos;
- peso;
- volumen cuando aplique;
- número de bulto;
- responsable;
- fecha/hora;
- sello cuando corresponda.

## 26. STAGING

Después de packing:

mercadería lista espera salida.

WMS debe conocer:

- ubicación staging;
- pedido;
- bultos;
- ruta;
- hora;
- estado.

## 27. DESPACHO

Entidad:

dispatch.

Relacionar:

- pedidos;
- packages;
- vehicle;
- driver;
- transporter;
- route;
- documentos;
- departure time.

Confirmar despacho debe producir movimiento real de inventario.

No editar saldo directamente.

## 28. RUTEO

Ruteo vive en WMS.

Conceptos separados:

PEDIDO
=
lo que pide el cliente.

ORDEN DE PREPARACIÓN
=
trabajo de almacén.

DESPACHO
=
mercadería lista para salir.

RUTA
=
despachos que viajarán juntos.

Entidades:

route
route_stop
dispatch
vehicle
driver
transporter.

## 29. ROUTING V1

Primera versión:

manual asistida.

PC:

- lista despachos listos;
- agrupar;
- ordenar paradas;
- zona;
- vehículo;
- conductor;
- transportista;
- hora.

Móvil:

mismas acciones,
presentadas como listas/steps.

No empezar con algoritmo complejo.

## 30. MOVIMIENTOS INTERNOS

INV-02:

PREPARAR
→
MOVER
→
VERIFICAR
→
CONFIRMAR.

Registrar:

product;
lot;
owner;
quantity;
origin;
destination;
reason;
executor;
verifier;
timestamps.

No confirmar antes de verificar físicamente.

## 31. CORRECCIONES

Nunca borrar un movimiento confirmado.

Usar:

reversal
o
compensating movement.

Relacionar con movimiento original.

Registrar razón.

## 32. INVENTARIOS CÍCLICOS

3 conteos pequeños por semana.

Primer conteo:

ciego.

Si coincide:

cerrar.

Si no:

segundo conteo por otra persona.

Si continúa:

investigar.

Después:

corrección por proceso correcto
o
authorized adjustment.

## 33. AJUSTES

Ajuste excepcional requiere permisos.

Registrar:

before;
after;
difference;
reason;
evidence;
requested_by;
approved_by;
timestamp.

## 34. VISUAL WAREHOUSE CONTROL

CAPACIDAD CENTRAL.

NO plano decorativo.

Debe ser:

MAPA
+
BUSCADOR
+
CONTROL CENTER
+
ENTRY POINT DE OPERACIONES.

Completo en:

PC
+
tablet.

Simplificado en teléfono.

## 35. MAPA 2D

Vista superior del almacén.

Funciones:

- zoom;
- pan;
- fit;
- reset;
- select;
- search;
- layers;
- highlight.

Mostrar:

- racks;
- zonas;
- recepción;
- cuarentena;
- approved storage;
- packing;
- staging;
- dispatch;
- special zones.

NO 3D en primera fase.

## 36. GEOMETRÍA

Separar:

location

de:

location_geometry.

Geometry posible:

x
y
width
height
rotation
shape
z_index
label_position.

## 37. PLANOS REALES

Revisar los planos ubicados en:

docs/wms/layouts/

Usarlos como base real.

No inventar precisión inexistente.

Si no se pueden extraer coordenadas fiables:

crear mecanismo de calibración/configuración.

## 38. VISTA FRONTAL DE RACK

Click rack:

mostrar frente.

Ejemplo:

Rack A

A-10.4
A-10.3
A-10.2
A-10.1

Cada ubicación interactiva.

## 39. BÚSQUEDA UNIVERSAL

Global search:

producto,
lote,
ubicación,
OC,
pedido,
despacho,
ruta.

Cmd/Ctrl+K en PC.

Ejemplo:

DAPAGLIFLOZINA

72 unidades encontradas.

A-10.2
48
ABC
02/2027

A-10.3
24
XYZ
08/2027.

Mapa resalta ubicaciones.

## 40. CAPAS DEL MAPA

Arquitectura preparada para:

- Occupancy;
- Sellable Stock;
- Expiry;
- Sanitary State;
- Operational Condition;
- Holds;
- Count Differences;
- Pending Movements;
- Picking Activity;
- Incidents;
- Owner;
- Heatmaps;
- Travel Distance.

## 41. ACCIONES DESDE MAPA

Click location:

drawer.

Mostrar:

- stock;
- products;
- lots;
- owner;
- expiry;
- state;
- condition;
- holds;
- tasks.

Acciones:

Mover
Contar
Historial
Reportar incidencia
Crear hold
Ver picking.

Drag-and-drop:

NO modifica inventario.

Solo puede iniciar:

“Crear movimiento A → B”.

## 42. COMMAND CENTER

Dashboard debe responder:

“¿Qué necesita atención?”

Ejemplo:

🔴 1 diferencia de inventario
🟠 3 productos ÁMBAR
🧪 2 pendientes de DT
📥 4 recepciones
↔️ 3 movimientos pendientes
📦 8 pedidos esperando picking
🚚 5 despachos listos

Cada indicador clickeable.

## 43. HOME POR ROL

ALMACÉN:

tareas,
recepciones,
picking,
movimientos,
conteos.

JEFE DE ALMACÉN:

operación,
excepciones,
mapa,
ocupación,
stock,
productividad.

DT:

pendientes,
decisiones,
lotes,
trazabilidad.

DESPACHO:

staging,
bultos,
despachos,
rutas.

GERENCIA:

KPIs,
alertas,
tendencias,
excepciones.

## 44. NAVEGACIÓN DESKTOP

Sidebar sugerida:

Inicio
Almacén visual
Recepciones
Inventario
Calidad
Movimientos
Conteos
Preparación
Despachos
Rutas
Reportes

separator

Maestros
Auditoría
Configuración

## 45. NAVEGACIÓN MÓVIL

Bottom navigation posible:

Inicio
Tareas
Buscar
Operaciones
Más

Todo lo demás accesible.

Visual Warehouse completo no obligatorio.

## 46. REPORTERÍA — PRINCIPIO

REPORTERÍA ES UNA CAPACIDAD CENTRAL DEL WMS.

No debe ser una colección de PDFs estáticos.

Debe ayudar a responder:

“¿Qué está pasando?”

“¿Por qué pasó?”

“¿Dónde está el problema?”

“¿Está mejorando?”

“¿Qué necesita acción?”

Quiero tres niveles:

1. DASHBOARDS OPERACIONALES
2. REPORTES ANALÍTICOS
3. AUDITORÍA / TRAZABILIDAD.

## 47. DASHBOARD OPERACIONAL

Orientado al HOY.

Ejemplos:

Recepciones pendientes
Pendientes DT
Productos ÁMBAR
Holds activos
Movimientos pendientes
Conteos pendientes
Diferencias abiertas
Pedidos esperando picking
Picking en proceso
Pedidos verificados
Bultos en staging
Despachos listos
Rutas abiertas.

No llenar de gráficos innecesarios.

Priorizar:

acción.

## 48. REPORTE DE INVENTARIO

Debe permitir analizar:

stock por producto;
stock por lote;
stock por owner;
stock por ubicación;
stock por estado;
stock por condición;
stock vendible;
stock bloqueado;
stock no vendible.

Filtros:

warehouse
owner
product
lot
state
condition
location
expiry.

Exportación:

CSV/XLSX.

## 49. REPORTE DE LOTES

Mostrar:

product;
lot;
expiry;
owner;
quantity;
locations;
state;
condition;
holds;
origin;
receipt;
available;
allocated.

Drill-down a trazabilidad.

## 50. REPORTE DE VENCIMIENTOS

Buckets configurables:

vencido;
0–3 meses;
3–6;
6–12;
>12.

Mostrar:

cantidad;
valor si posteriormente tenemos costo autorizado;
owner;
producto;
lote;
ubicación.

Visual Warehouse:

opcionalmente colorear riesgo de vencimiento.

## 51. REPORTE DE OCUPACIÓN

Por:

warehouse;
zone;
rack;
location;
owner.

Indicadores:

ubicaciones totales;
ocupadas;
libres;
porcentaje ocupación;
capacidad física cuando exista.

Visual Warehouse:

overlay de ocupación.

## 52. INVENTORY ACCURACY

Indicadores:

conteos realizados;
diferencias;
unidades diferencia;
accuracy;
reconteos;
ajustes;
causas frecuentes.

Formula debe documentarse claramente.

No inventar denominador ambiguo.

## 53. RECEPCIONES

Medir:

recepciones por día;
unidades recibidas;
tiempo desde registro de Compras hasta trazabilidad completa;
tiempo en Cuarentena hasta aprobación;
recepciones con diferencia;
recepciones incompletas;
lotes identificados.

## 54. CALIDAD

Reportes:

pendientes DT;
tiempo de aprobación;
inventario en Cuarentena;
Aprobado;
ÁMBAR;
Bajas/Rechazados;
holds;
motivos.

No confundir KPI operacional con decisión técnica.

## 55. MOVIMIENTOS

Analizar:

movimientos por día;
por usuario;
por zona;
origen/destino;
motivo;
tiempo de cierre;
reversas;
correcciones.

Futuro:

heatmap de movimientos.

## 56. PICKING

Indicadores:

pedidos preparados;
líneas;
unidades;
pick time;
tiempo por línea;
excepciones;
productividad por operario;
recorridos futuros.

No usar métricas para castigar personas sin contexto.

## 57. PACKING

Medir:

pedidos embalados;
bultos;
unidades/bulto;
tiempo;
reprocesos;
excepciones.

## 58. DESPACHO

Medir:

despachos;
pedidos;
bultos;
tiempo staging;
hora programada vs salida real;
incidencias;
transportista;
vehículo.

## 59. RUTAS

Medir:

rutas;
despachos/ruta;
paradas;
utilización;
hora salida;
tiempo total cuando exista;
cumplimiento;
incidencias.

Más adelante:

km;
cost;
route efficiency.

## 60. INVENTORY AGING

Analizar cuánto tiempo lleva inventario almacenado.

Por:

product;
lot;
owner;
location.

Útil para identificar inventario lento.

No confundir aging con vencimiento.

## 61. OWNER / CLIENT REPORTING

Para cada owner:

stock;
pallets/locations;
ocupación;
movimientos;
recepciones;
despachos;
lotes;
vencimientos;
holds;
accuracy.

Preparar arquitectura para que eventualmente podamos compartir reportes con clientes si el negocio lo decide.

## 62. AUDITORÍA

Reporte especializado:

quién
hizo qué
cuándo
sobre qué
antes
después
por qué.

Filtrar por:

user;
entity;
event;
date;
product;
lot;
order;
receipt;
movement.

## 63. INTEGRATION HEALTH

Dashboard técnico-operativo:

Compras → WMS
Pedidos → WMS
WMS → Pedidos.

Mostrar:

last successful sync;
pending events;
failed events;
retries;
lag;
errors.

Debe permitir entender:

“¿por qué WMS dice 84 y Pedidos 80?”

## 64. REPORT BUILDER LIGHT

No construir BI enterprise.

Pero sí permitir:

- seleccionar filtros;
- guardar vistas;
- ordenar columnas;
- seleccionar columnas visibles;
- exportar.

Saved views:

“Stock por vencer”
“DIPHASAC”
“Conteos con diferencia”
“Despachos de hoy”

## 65. EXPORTACIONES

Soportar cuando corresponda:

CSV
XLSX

y vistas imprimibles.

PDF solo cuando tenga sentido documental.

No convertir PDF en el formato principal de análisis.

## 66. REPORTERÍA EN MÓVIL

Misma información esencial.

No tablas horizontales gigantes.

Mostrar:

KPIs
cards
rankings
listas
mini charts
drill-down.

Filtros móviles simples.

## 67. DATA FOR BI FUTURO

Diseñar eventos/datos limpios para que más adelante podamos conectar:

Power BI
Metabase
o herramienta similar

sin rehacer el dominio.

NO construir data warehouse ahora si no es necesario.

## 68. KPIs — NO INVENTAR

Cada KPI debe tener:

name
definition
formula
source
frequency
owner
interpretation.

No crear un número bonito sin definición.

## 69. JOYFULNESS

Quiero que usar el WMS sea agradable.

No infantil.

Microcopy:

“Perfecto. Las 6 unidades están identificadas.”

“Movimiento listo para verificar.”

“Todo coincide. Puedes confirmar.”

“Conteo perfecto: físico = sistema.”

“Buen ojo. Encontraste una diferencia antes de que creciera.”

Vacíos útiles:

“No tienes recepciones pendientes 🎉”

Feedback:

claro,
amable,
profesional.

## 70. DISEÑO

Usar:

@logisalud/design-system

cuando corresponda.

No diseño AI-generic SaaS.

No:

- glassmorphism excesivo;
- gradientes inútiles;
- cards por todas partes;
- gráficos decorativos;
- iconos sin significado.

Sí:

- claridad;
- alta calidad visual;
- información densa cuando PC lo permite;
- hierarchy;
- whitespace;
- typography;
- consistent status language.

## 71. TABLAS

Desktop:

sticky headers
filters
search
sorting
column visibility
saved views
row actions
bulk safe actions
virtualization cuando aplique.

Mobile:

cards/lists/detail views.

## 72. DRAWERS / SPLIT VIEW

PC:

click lote
→ drawer.

click ubicación
→ drawer.

click pedido
→ detail pane.

Evitar navegar hacia adelante/atrás innecesariamente.

## 73. PERMISOS

RBAC.

Roles conceptuales:

Warehouse Operator
Warehouse Lead
Technical Director
Operations
Dispatch
Administrator
Audit/Read Only
Management

Permisos:

view
execute
verify
approve
adjust
configure
export
audit.

Enforce server/database.

## 74. AUDIT EVENTS

Toda operación crítica:

actor
timestamp
event
entity
before
after
reason
source.

Ejemplos:

receipt_confirmed
lot_allocated
inventory_created
quality_approved
condition_changed
hold_created
hold_released
movement_confirmed
movement_reversed
count_completed
adjustment_approved
allocation_created
pick_completed
verification_completed
package_closed
dispatch_confirmed
route_created.

## 75. IDEMPOTENCIA

Integraciones deben soportar retry sin duplicar efectos.

Compras → WMS
Pedidos → WMS
WMS → Pedidos.

## 76. OBSERVABILIDAD

Errores visibles.

No fallos silenciosos.

Registrar:

sync status
last attempt
last success
retry count
message
correlation id.

## 77. PERFORMANCE

Visual Warehouse:

cientos de locations fluidamente.

Tablas:

virtualización cuando convenga.

Evitar fetches N+1.

Evitar rerenders innecesarios.

## 78. ACCESSIBILITY

No depender solamente de colores.

VERDE:
texto + icono.

ÁMBAR:
texto + icono.

Mapa siempre complementado con búsqueda/lista.

Teclado en PC.

## 79. NETWORK FAILURE

No implementar offline complejo inicialmente.

Pero:

retry;
clear failure state;
pending state.

Nunca mostrar operación confirmada si servidor no confirmó.

## 80. CONCURRENCIA

Prevenir:

dos usuarios moviendo mismo stock;
dos pick tasks consumiendo mismas unidades;
dos ajustes simultáneos.

Diseñar reservations/locks apropiados.

## 81. MASTER DATA

No duplicar.

Revisar actuales:

products
suppliers
warehouses
locations
owners
vehicles
drivers
transporters.

Producto farmacéutico:
DT controla/valida.

Proveedor:
business ownership actual de Almacén.

## 82. ESTRUCTURA APP

Referencia:

apps/wms/

app/
  dashboard/
  warehouse/
  receipts/
  inventory/
  quality/
  movements/
  counts/
  fulfillment/
  dispatch/
  routes/
  reports/
  audit/
  settings/

domain/
  warehouse/
  inventory/
  receipts/
  quality/
  movements/
  counts/
  allocation/
  picking/
  packing/
  dispatch/
  routing/
  reporting/

services/

components/

supabase/
  migrations/

tests/
  domain/
  integration/
  e2e/

PRODUCT.md
DESIGN.md
CLAUDE.md

Adapta a convenciones reales del repo.

## 83. SCHEMA

Preferencia:

schema Supabase `wms`

en Supabase consolidado junto a Compras.

Validar técnicamente primero.

## 84. ENTIDADES A EVALUAR

warehouses
zones
racks
locations
location_geometries

inventory_owners

lots

inventory_balances
inventory_movements

receipts
receipt_lines
lot_allocations

quality_decisions
quality_documents
inventory_holds
operational_condition_events

cycle_counts
cycle_count_lines
inventory_adjustments

outbound_orders
outbound_order_lines
allocations

pick_tasks
pick_task_lines

packages
package_lines

dispatches
dispatch_lines

routes
route_stops

vehicles
drivers
transporters

audit_events

integration_events

saved_report_views

No crear todo sin necesidad.

## 85. EVENT / OUTBOX

Considerar outbox para integración confiable.

Ejemplo:

inventory changed
→ event
→ publish stock
→ Pedidos
→ acknowledge.

No overengineering.

## 86. TESTING

Vitest:

domain rules.

Playwright:

critical workflows.

No aceptar feature crítica sin tests.

## 87. E2E MÍNIMOS (visión completa)

1. Compras = 6, 4 + 2, confirm, Cuarentena.
2. Compras = 6, 4 + 3, reject.
3. Cuarentena → Aprobado.
4. Aprobado → VERDE → vendible.
5. Aprobado → ÁMBAR → no vendible.
6. Aprobado → Cuarentena → RECHAZAR SIEMPRE.
7. Hold sobre Aprobado → no vendible según configuración → state sigue Aprobado.
8. Movement A→B: prepare, execute, verify, confirm.
9. Cycle count correcto.
10. Cycle count diferencia + recount.
11. Visual Warehouse search.
12. Location drawer.
13. Default lot closest expiry.
14. Farthest expiry preference.
15. Specific lot.
16. Picking.
17. Verification.
18. Packing.
19. Dispatch.
20. Route.
21. Report inventory filters.
22. Export report.
23. Audit event trace.
24. Integration failure visible.

## 88. RESPONSIVE TESTING

Probar:

Desktop 1440×900
Laptop 1280×800
Tablet 1024×768
Mobile 390×844

Cada flujo operacional crítico debe funcionar en los cuatro.

Excepción:

Visual Warehouse completo:
desktop/tablet.

## 89. BATCHES (visión de largo plazo)

BATCH 1: Foundation; topology + Visual Warehouse; reception + inventory + quality; sellable stock projection; reporting foundation.

BATCH 2: movements; counts; holds; real stock sync; operational dashboards.

BATCH 3: outbound; allocations; picking; lot strategy; picking reports / map overlays.

BATCH 4: verification; packing; staging; dispatch; dispatch reporting.

BATCH 5: routing; route stops; dispatch grouping; route UX; route reporting.

BATCH 6: heatmaps; slotting; deeper analytics; performance; scan-first improvements.

## 90. GATES

Cada batch debe pasar:

DOMAIN
UX
TESTING
INTEGRATION
RESPONSIVE
REPORTING
NO REGRESSION.

## 91. NO HACER SIN APROBACIÓN

NO:

merge main;
production deploy;
production migration;
drop tables;
destructive migration;
replace product master;
break Pedidos;
remove Odoo fallback;
change regulatory rules;
invent sanitary states.

## 92. CONFLICTOS

Clasificar:

TECHNICAL
BUSINESS
REGULATORY
DATA
UX.

Técnico reversible:
decide y documenta.

Business:
escalar.

Regulatory:
escalar.

Destructive:
escalar.

## 93. AUDITORÍA DEL REPO

Revisar:

root package.json
root CLAUDE.md

apps/compras
apps/pedidos
apps/cobranzas

packages/auth
packages/design-system

Supabase
migrations
services
workflows

Vitest
Playwright
.claude/skills

PRODUCT docs
DESIGN docs

planos físicos.

## 94. DOCUMENTACIÓN VIVA

Crear y mantener:

apps/wms/PRODUCT.md

apps/wms/DESIGN.md

apps/wms/CLAUDE.md

y documentación técnica necesaria.

Debe reflejar código real.

No documentos aspiracionales desactualizados.

## 95. RELACIÓN CON MANUALES VIVOS

El proceso gobierna software.

Software puede automatizar pasos.

Cuando una automatización elimina un paso manual:

manual vivo se actualiza.

No programar burocracia solo porque existía manualmente.

## 96. BENCHMARK

Piensa en capacidades propias de los mejores WMS:

- visual warehouse;
- real-time visibility;
- inventory traceability;
- task orchestration;
- exception management;
- slotting;
- dashboards;
- operational analytics;
- mobile execution;
- auditability.

Pero no copies complejidad enterprise sin necesidad.

Objetivo:

CAPACIDAD ENTERPRISE DONDE IMPORTA
+
EXPERIENCIA MUCHO MÁS SIMPLE.

## 97. PRINCIPIO DE EXPERIENCIA

Una persona que no conoce logística debe entender:

“¿Qué tengo que hacer?”

Una persona experta debe sentir:

“Esto no me hace perder tiempo.”

Un jefe debe poder responder:

“¿Qué está pasando?”

Un gerente:

“¿Dónde están nuestros problemas y estamos mejorando?”

sin llamar a cinco personas.

## 98. VISIÓN FINAL

El WMS debe sentirse como:

LIVE WAREHOUSE MAP
+
TASK MANAGER
+
INVENTORY ENGINE
+
CONTROL TOWER
+
REPORTING PLATFORM
+
TRACEABILITY LEDGER.

NO:

una hoja de Excel con botones.

## 99. REGLAS ABSOLUTAS

APROBADO JAMÁS VUELVE A CUARENTENA.

DEVOLUCIÓN NO ES ESTADO.

RECEPCIÓN NO ES ESTADO.

UBICACIÓN NO ES ESTADO.

VERDE/ÁMBAR SOLO EXISTE EN APROBADO.

STOCK VENDIBLE =
APROBADO + VERDE
sin bloqueos incompatibles.

DEFAULT LOT =
VENCIMIENTO MÁS PRÓXIMO.

SI CLIENTE INDICA OTRA PREFERENCIA:
RESPETAR SI ES VÁLIDA.

COMPRAS =
cantidad física agregada.

WMS =
realidad física.

PEDIDOS =
demanda y disponibilidad comercial.

PC Y TELÉFONO =
MISMAS CAPACIDADES FUNCIONALES,
ADAPTADAS A SU CONTEXTO.

EXCEPCIÓN =
Visual Warehouse completo principalmente en PC/tablet.

UN DATO SE ESCRIBE UNA SOLA VEZ.
