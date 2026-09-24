# Carga de celulares desde Excel — 2026-09-24

Archivo entregado por aromero@logisalud.com: `CELULARES_NUEVOS.xlsx`, 52
contactos con razón social, RUC, celular, zona y vendedor.

## Resultado

| | |
|---|---|
| Filas en el Excel | 52 |
| **Celulares cargados** | **46** |
| Ya tenían ese mismo número | 2 |
| El cliente no existe en la base | 3 |
| Retenido a propósito | 1 |

Ningún cliente tenía un celular **distinto** del que traía el Excel, así que
la carga no pisó ni un solo número: los 46 estaban vacíos. Después de cargar,
526 clientes tienen celular y **ninguno es inválido**. Tampoco se creó ningún
número duplicado nuevo.

Queda en `pedidos.audit_logs` id **8391**.

## Los 3 que no existen en la base

Los RUC no están en `pedidos.customers`. No se dio de alta a nadie: dar de
alta un cliente pide zona, canal, condición de pago y dirección, que el
Excel no trae, y un cliente a medias es peor que ninguno.

| RUC | Razón social (según el Excel) | Celular |
|---|---|---|
| 20609460505 | BOTICA VIDANGIE EIRL | 971390793 |
| 20606494638 | SOLMEDICA SOLU. MED.ODONTL.INTEG. AREQUIPA EIRL | 941042886 |
| 10440341654 | (fila 28 del Excel) | 952945143 |

## El retenido

**BOTICAS FARMA LOG E.I.R.L.** (RUC 20607411965) venía con **912345678** —
nueve dígitos que empiezan en 9, así que pasa la validación de formato, pero
son los dígitos en orden. Tiene toda la pinta de un número puesto para salir
del paso, del mismo tipo que los que se limpiaron el 2026-09-23.

No se cargó **a propósito**: si fuera falso, el pedido de ese cliente saldría
igual y Operaciones no llegaría a nadie, que es exactamente lo que la regla
del celular obligatorio vino a evitar. Un cliente sin número queda frenado y
alguien lo nota; un cliente con número falso no lo nota nadie. Si resulta ser
real, se carga con una línea.

## Una zona que no coincide

No se tocó —el pedido era cargar contactos, no mover zonas— pero conviene
mirarlo:

| RUC | Cliente | Zona en el Excel | Zona en la base |
|---|---|---|---|
| 10453227311 | VARGAS ANTEZANA LILIA | HYOM02 | HYOM01 |

Las otras 48 coinciden.

## Cómo revertirlo

`revertir.sql`, en esta misma carpeta: vuelve a null los **46** que este
script cargó. No toca los 2 que ya tenían ese número de antes.
`celulares-del-excel.json` guarda el contenido del Excel tal como se leyó.
