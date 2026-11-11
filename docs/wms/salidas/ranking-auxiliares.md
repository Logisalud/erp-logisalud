# Rankings mensuales de auxiliares de almacén (decisión de Sebas, 2026-11-11)

Son **dos rankings separados**, cada uno con productividad y calidad. **Quién entra:** los auxiliares de almacén y Sandra; **no entran los jefes ni el transportista.** **Periodo:** el mes. **Premio:** el 1.º gana un día libre entero y el 2.º, medio día (ver «Pendiente»: si es por cada ranking o uno solo).

La calidad de cada ranking la mide **el filtro que sigue**: al picking lo juzga la conformidad (y después el transporte); a la conformidad la juzga el transporte, que es el tercer filtro, cuando detecta un error posterior.

## Cómo se mide (lo que se les explica al equipo)

> **Hay dos rankings. En los dos pesan dos cosas: cuánto y qué tan rápido trabajas, y que no se te escapen errores.**
>
> **Ranking de picking.** Cada pedido que picas vale más si es más grande (más productos y más volumen), y cuenta el tiempo que tardas. Tu calidad es el porcentaje de tus pedidos que salen sin diferencias (cantidad, descripción, lote y documento), lo encuentre quien da la conformidad o aparezca después, al cargar o en la entrega.
>
> **Ranking de conformidad.** Cada pedido que verificas vale igual según su tamaño, y cuenta el tiempo que tardas. Tu calidad es que no se te escape nada: si después, al cargar el vehículo, el transportista detecta un error en un pedido que diste por conforme, baja tu calidad.
>
> En los dos hay una **calidad mínima** para entrar al premio (aunque seas el más rápido) y un **mínimo de pedidos** en el mes. Gana quien, cumpliendo eso, trabaja más y más rápido.

## Reglas para el sistema

- **Puerta de calidad (cada ranking):** picking ≥ 99 % de pedidos sin diferencia; conformidad ≥ 99 % de pedidos verificados sin error posterior. Parametrizable.
- **Mínimo de pedidos (recomendado), en cada ranking:** la mitad de lo que hizo el promedio del equipo ese mes en ese rol, y nunca menos de 20. Parametrizable.
- **Puntaje de carga por pedido:** categoría por número de productos (A = 1, B = 2–5, C = 6–9, D = 10 o más) por volumen (S, M, L, XL, calculado desde unidades y bultos con umbrales configurables). Lo calcula el sistema.
- **Productividad:** puntos de carga ÷ tiempo efectivo, de los registros del sistema (hora inicial y final del picking; inicio y fin de la conformidad).
- **Calidad del picking:** pedidos sin diferencia ÷ pedidos picados. Una diferencia se cuenta contra quien picó sin importar quién la detectó (conformidad, carga, entrega o devolución).
- **Calidad de la conformidad:** pedidos sin error posterior ÷ pedidos verificados. Un error posterior es una «Diferencia detectada en la carga» (o una incidencia de entrega atribuible al pedido) en un pedido que ya tenía conformidad; se cuenta contra quien dio esa conformidad. No hay bono por rechazar: así nadie gana por rechazar de más.
- **Transportista:** registra «Diferencia detectada en la carga» con motivo; no entra a ningún ranking.
- **Lo que el sistema ya sabe no se pide:** fecha, propietario, cliente, guía, horas, categoría, tipo (Lima/Provincia) y responsables.
- En la pantalla de conformidad solo se agrega lo que el sistema no sabe: pedido conforme sí/no y el tipo de diferencia (cantidad, descripción, lote, documento); el n.º de bultos ya existe.
- Pantalla «Ranking del mes» con las dos tablas, calculadas solas, y el detalle por persona.

## Pendiente
- ¿El premio es 1.º día libre y 2.º medio día **en cada ranking**, o uno solo de los dos? (Si una persona gana ambos, no se acumula más de un día.)

## Pendiente de construir (en este orden)
1. Pantalla de conformidad con los datos de la hoja que faltan. 2. Botón «Diferencia detectada en la carga». 3. Los dos rankings del mes. 4. Inspecciones LS-FR.49.03 (vehículo) y LS-FR.52.03 (limpieza): conductor y auxiliar (uno hace, el otro supervisa), firma dibujada del conductor y de la Dirección Técnica, descarga en Word del formato mensual de la placa con lo marcado hasta ese día; **no bloquean la salida a ruta**.
