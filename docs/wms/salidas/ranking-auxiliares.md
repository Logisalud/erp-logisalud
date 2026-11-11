# Rankings mensuales de auxiliares de almacén (Sebas, 2026-11-11: «algo más simple»)

Dos rankings separados (picking y conformidad). **Entran** los auxiliares de almacén y Sandra; **no entran los jefes ni el transportista.** Periodo: el mes. Premio: 1.º día libre, 2.º medio día (ver «Pendiente»).

## La regla, en una frase para el equipo

> **Cada pedido suma puntos según qué tan grande es; cada error resta. Gana quien más puntos tenga en el mes.**

## Puntos (los mismos números que ya usan hoy, ahora en una sola tabla)
- **Pedido:** categoría (A = 1, B = 3, C = 6, D = 10) **+** tamaño (S = 1, M = 2, L = 4, XL = 6). Provincia **×2**; Revisión **×0,5**; Lima **×1**.
- **Picking:** suma los puntos de cada pedido que picó; **−15 por cada error** (cantidad, descripción, lote o documento) y **−80 por cada mal despacho** (error que llegó al cliente).
- **Conformidad:** suma los puntos de cada pedido que verificó; **+10 por cada error que filtró** (lo detectó antes de salir); **−80 por cada mal despacho** de un pedido que dio por conforme, incluido el error que el transportista detecta al cargar.
- **Sin bonos de mes, sin puertas, sin tablas aparte.** Para entrar al ranking: mínimo de **20 pedidos** en el mes en ese rol.
- Lo calcula el sistema desde sus registros: categoría (número de productos), tamaño (unidades y bultos, umbrales configurables), tipo (ubigeo), quién picó y quién conformó, errores y mal despacho. No se vuelve a escribir nada que el sistema ya sabe.
- Los valores salen de una tabla de parámetros que se puede cambiar sin tocar el código.
- No se usa el tiempo hoy (en la hoja actual las horas estaban vacías). Se puede sumar después.

## Pendiente
- ¿El premio es por cada ranking o uno solo cuenta para el día libre? (Si una persona gana ambos, no acumula más de un día.)

## Por construir (en este orden)
1. Conformidad: «pedido conforme sí/no» y el tipo de diferencia (cantidad, descripción, lote, documento). 2. «Diferencia detectada en la carga». 3. Los dos rankings del mes. 4. Inspecciones LS-FR.49.03 y LS-FR.52.03 (conductor y auxiliar, firma dibujada, descarga en Word del formato mensual; no bloquean la salida).
