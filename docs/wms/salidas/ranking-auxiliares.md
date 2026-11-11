# Rankings mensuales de auxiliares de almacén (Sebas, 2026-11-11: simple y muy justo; la calidad pesa más)

Dos rankings separados (picking y conformidad), cada uno con **productividad y calidad en una sola fórmula**. **Entran** los auxiliares de almacén y Sandra; **no entran los jefes ni el transportista.** Periodo: el mes. Premio: 1.º día libre, 2.º medio día (ver «Pendiente»).

## La regla, en una frase para el equipo

> **Tu puntaje es tu carga de trabajo del mes, y cada 1 % de tus pedidos con error te quita 5 % del puntaje.** Gana quien más puntaje tenga.

## La fórmula

`Puntaje = Puntos de carga × (100 % − 5 × % de pedidos con error)`   (mínimo 0)

- **Puntos de carga:** suma de los pedidos del mes. Cada pedido vale categoría (A = 1, B = 3, C = 6, D = 10) + tamaño (S = 1, M = 2, L = 4, XL = 6), por tipo (Provincia ×2, Revisión ×0,5, Lima ×1). Es la productividad: más trabajo y más difícil, más puntos.
- **% de pedidos con error:** pedidos con error ÷ pedidos del mes en ese rol. Se mide en porcentaje y no en cantidad, para que sea justo con quien hace más pedidos. Un mal despacho (el error llegó al cliente) cuenta como 3 pedidos con error.
- **Picking:** un pedido tiene error si alguien (la conformidad, la carga, la entrega o una devolución) detecta una diferencia de cantidad, descripción, lote o documento en lo que picó.
- **Conformidad:** un pedido tiene error si, habiéndolo dado por conforme, después aparece una diferencia (la detecta el transportista al cargar, o se descubre en la entrega o en una devolución). Detectar errores no suma ni resta: así nadie gana por rechazar de más ni por aprobar sin mirar.
- **Por qué es justo:** (1) la calidad pesa 5 veces su tasa: un 4 % de errores quita el 20 % del puntaje; con 20 % de errores el puntaje es 0. (2) Se compara el porcentaje de errores, no la cantidad. (3) La carga sale de la dificultad real del pedido, no de cuántos pedidos fáciles se hicieron. (4) Quien trabaja poco no gana por no equivocarse: para entrar al ranking hace falta un mínimo de pedidos.
- **Mínimo para entrar:** la mitad de los pedidos del promedio del equipo en ese rol ese mes, y nunca menos de 20.
- **Ejemplo (picking):** A: 1.000 puntos, 1 % de pedidos con error → 1.000 × 0,95 = **950**. B: 800 puntos, sin errores → **800**. C: 1.100 puntos, 4 % de errores → 1.100 × 0,80 = **880**. Orden: A, C, B.
- Los números (5, 3, 20, los puntos por categoría y tamaño) están en una tabla de parámetros que se puede cambiar sin tocar el código. Lo calcula el sistema solo; no se escribe nada que ya sabe.

## Pendiente
- ¿El premio es por cada ranking, o solo uno cuenta para el día libre? (Si una persona gana ambos, no acumula más de un día.)

## Por construir (en este orden)
1. Conformidad: «pedido conforme sí/no» y el tipo de diferencia (cantidad, descripción, lote, documento). 2. «Diferencia detectada en la carga». 3. Los dos rankings del mes. 4. Inspecciones LS-FR.49.03 y LS-FR.52.03 (conductor y auxiliar, firma dibujada, descarga en Word del formato mensual; no bloquean la salida).
