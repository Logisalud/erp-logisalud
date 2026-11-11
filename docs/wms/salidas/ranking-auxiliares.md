# Ranking mensual de auxiliares de almacén (decisión de Sebas, 2026-11-11)

**Premio:** el 1.º del mes gana un día libre entero; el 2.º, medio día. **Quién entra:** los auxiliares de almacén y Sandra. **No entran los jefes.** **Periodo:** el mes.

## Cómo se mide (lo que se les explica al equipo)

> **Tu mes se mide en tres pasos, y casi todo lo calcula el sistema solo.**
>
> 1. **Primero, que salga bien.** El 99 % de los pedidos que picaste tiene que estar correcto: cantidad, descripción, lote y documento. Si bajas de ahí, ese mes no entras al premio, aunque seas rápido. Cuenta todo error, lo encuentre quien da la conformidad o aparezca después (al cargar, en la entrega o en una devolución).
> 2. **Después, cuánto y qué tan rápido trabajas.** Cada pedido vale más si es más grande (más productos y más volumen). Cuenta el tiempo que tardaste: hacer pedidos de tamaño parecido más rápido te da más puntos.
> 3. **Cuando das la conformidad al pedido de otra persona**, sumas por cada pedido que verificas y por cada error real que encuentras. Si después se descubre un error que dejaste pasar, restas.
>
> Para estar en el ranking tienes que haber hecho un mínimo de pedidos en el mes (abajo). El 1.º del mes gana un día libre y el 2.º, medio día.

## Reglas para el sistema

- **Puerta de calidad:** exactitud como picker ≥ 99 % (pedidos sin ninguna diferencia ÷ pedidos picados). Parametrizable.
- **Mínimo de pedidos (recomendado):** la mitad de lo que hizo el promedio del equipo ese mes, y nunca menos de 20 pedidos. Se ajusta solo con el volumen del mes. Parametrizable.
- **Puntaje de carga por pedido:** categoría por número de productos (A = 1, B = 2–5, C = 6–9, D = 10 o más) por volumen (S, M, L, XL, calculado desde unidades y bultos con umbrales configurables). Sale del sistema: no se vuelve a escribir.
- **Productividad:** puntos de carga ÷ tiempo efectivo de picking, tomado de los registros del sistema (hora inicial y final).
- **Como verificador:** puntos por pedido verificado + bono por cada diferencia real detectada (con tope por pedido); resta cuando se descubre después un error que dejó pasar.
- **El transportista que detecta un error al cargar** lo registra («Diferencia detectada en la carga», con motivo): baja la exactitud de quien picó y cuenta como error que dejó pasar quien dio la conformidad. El transportista no entra al ranking.
- **Lo que el sistema ya sabe no se pide:** fecha, propietario (Logisalud, Diphasac, AJR, Medic Pharma), cliente, guía, hora inicial y final, categoría, tipo (Lima/Provincia por ubigeo) y responsables (quién picó, quién conformó).
- En la pantalla de conformidad solo se agrega lo que el sistema no sabe: pedido conforme sí/no, tipo de diferencia (cantidad, descripción, lote, documento) y n.º de bultos (ya existe).
- La pantalla «Ranking del mes» se calcula sola y muestra, por persona, cómo salió cada parte.

## Pendiente de construir (en este orden)
1. Pantalla de conformidad con los datos de la hoja que faltan. 2. Botón «Diferencia detectada en la carga». 3. Ranking del mes. 4. Inspecciones LS-FR.49.03 (vehículo) y LS-FR.52.03 (limpieza): conductor y auxiliar (uno hace, el otro supervisa), firma dibujada del conductor y de la Dirección Técnica, descarga en Word del formato mensual de la placa con lo marcado hasta ese día; **no bloquean la salida a ruta**.
