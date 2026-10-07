# Principio de experiencia — Joyful WMS

NO quiero que el WMS se sienta “serio” en el sentido tradicional de software empresarial.

No quiero una interfaz gris, fría, burocrática o intimidante.

Quiero que alguien tenga GANAS DE USARLO.

La experiencia debe ser:

- divertida;
- visual;
- viva;
- intuitiva;
- satisfactoria;
- rápida;
- humana;
- con personalidad;
- fácil de explorar;
- fácil de aprender.

Pero debajo de esa experiencia debe existir muchísimo rigor:

- reglas de negocio estrictas;
- trazabilidad completa;
- auditoría;
- permisos;
- integridad de inventario;
- controles sanitarios;
- invariantes;
- validaciones;
- idempotencia;
- tests;
- seguridad.

Principio:

JOYFUL ON THE SURFACE.
RIGOROUS UNDERNEATH.

La diversión NO puede sacrificar control.

El rigor NO puede sacrificar experiencia.

## Qué quiero que sienta el usuario

Cuando alguien abra el WMS debería pensar:

“Entiendo qué está pasando.”

“Sé qué tengo que hacer.”

“Esto es más fácil de lo que esperaba.”

“Quiero terminar esta tarea.”

“Qué buena forma de ver el almacén.”

No:

“¿Dónde tengo que hacer clic?”

“¿Qué significa este estado?”

“¿Por qué hay 40 campos?”

“Mejor le pregunto a Charlie.”

## El trabajo debe tener momentum

Cada flujo debe hacer sentir progreso.

Ejemplo recepción:

Compras registró:
6 unidades.

Usuario identifica primer lote:

4 de 6 identificadas.

████████░░ 67%

“Muy bien. Faltan 2.”

Segundo lote:

6 de 6 identificadas.

██████████ 100%

“Perfecto. Todo cuadra.”

[Confirmar ingreso]

Después:

“📦 Listo. Las 6 unidades ingresaron a Cuarentena.”

La persona debe SENTIR que terminó algo.

## Microcopy con personalidad

Evitar lenguaje de sistema.

NO:

Validation successful.

SÍ:

“Todo cuadra. Puedes continuar.”

NO:

Insufficient inventory.

SÍ:

“Te faltan 2 unidades en esta ubicación.”

NO:

Invalid lot allocation.

SÍ:

“Compras registró 6 unidades y aquí tenemos 7. Hay una de más por revisar.”

NO:

Cycle count completed successfully.

SÍ:

“🎯 Conteo perfecto. Físico = sistema.”

NO:

Inventory discrepancy detected.

SÍ:

“🔎 Buen ojo. Encontramos una diferencia antes de que se vuelva un problema.”

## Celebrar el trabajo bien hecho

Usar pequeñas recompensas visuales cuando realmente aporten.

Ejemplos:

✓ check animado;
✓ progreso que llega a 100%;
✓ transición suave;
✓ mensaje corto;
✓ pequeña vibración/haptic en móvil cuando sea apropiado;
✓ estados visuales satisfactorios.

Ejemplos:

“✓ Movimiento verificado.”

“📦 Pedido listo para despacho.”

“🎯 Conteo perfecto.”

“✨ No tienes recepciones pendientes.”

“Todo listo por aquí.”

No abusar.

Una celebración deja de ser especial si aparece después de cada clic.

## Visual Warehouse debe provocar explorar

El Visual Warehouse debe ser una de las partes más atractivas del producto.

Cuando alguien entre debería provocar:

hacer zoom;
buscar productos;
hacer clic en racks;
explorar ubicaciones;
cambiar capas;
entender qué ocurre.

Debe sentirse vivo.

Por ejemplo:

buscar:
DAPAGLIFLOZINA

El almacén se atenúa.

Tres ubicaciones se iluminan.

Aparece:

“Encontramos 72 unidades en 3 ubicaciones.”

Click A-10.2.

Panel:

📍 A-10.2

48 unidades

Lote ABC123
Vence Feb 2027

🟢 Aprobado · Listo para venta

Y acciones:

[Mover]
[Contar]
[Historial]

El usuario debe sentir:

“Ahhh, aquí está.”

## El sistema debe ser curioso

Cuando aporte valor, el sistema puede mostrar pequeños insights.

Ejemplo:

“👀 Esta ubicación tuvo 8 movimientos esta semana.”

“📦 Este producto ocupa 3 ubicaciones.”

“⏳ Este lote es el próximo en vencer.”

“🚶 Este producto se recoge mucho y está lejos de despacho.”

No convertir todo en alertas.

Diferenciar:

NECESITA ACCIÓN
de
INTERESANTE SABER.

## Personalidad, no infantilización

Joyfulness NO significa:

- caricaturas infantiles;
- confeti constante;
- sonidos molestos;
- puntos sin propósito;
- leaderboards tóxicos;
- emojis en cada línea;
- colores chillones;
- convertir cumplimiento regulatorio en un juego.

Sí significa:

- buen lenguaje;
- movimiento;
- feedback;
- personalidad;
- sorpresa pequeña;
- progresión;
- visualización;
- sensación de control;
- reconocimiento.

## Gamification solo si ayuda

No agregar XP, puntos, badges o rankings automáticamente.

Gamification debe nacer del trabajo real.

Ejemplos útiles:

“3 de 5 tareas terminadas.”

“Recepción 100% identificada.”

“0 diferencias abiertas.”

“Ruta preparada.”

“Almacén revisado ✓”

El progreso REAL ya es una forma de gamification.

## Empty states

Los estados vacíos deben sentirse bien.

Ejemplo:

No:

“No records found.”

Sí:

“✨ Todo limpio.
No tienes movimientos pendientes.”

o:

“📦 Todavía no hay recepciones por trabajar.”

o:

“🎯 Cero diferencias abiertas.”

## Error ≠ castigo

Cuando alguien comete un error, el sistema no debe hacerlo sentir incompetente.

Debe explicar:

qué ocurrió;
por qué;
cómo resolverlo.

Ejemplo:

“No podemos confirmar todavía.

Compras registró 20 unidades
y aquí hemos identificado 18.

Faltan 2 unidades por identificar.”

[Revisar lotes]

## Exception-driven UX

Cuando todo está bien:

el sistema se aparta.

Cuando algo necesita atención:

el sistema ayuda.

No pedir confirmaciones innecesarias.

No hacer que el usuario demuestre veinte veces que sabe lo que está haciendo.

Rigor debe estar incorporado en el diseño y en las reglas del sistema.

## PC debe sentirse poderoso

En PC quiero una sensación de:

CONTROL.

Que el usuario pueda:

ver el almacén;
abrir un drawer;
buscar;
filtrar;
comparar;
actuar;
volver al mapa;

sin sentirse atrapado en una secuencia de pantallas.

Debe sentirse rápido.

Casi como un “command center”.

## Móvil debe sentirse fluido

En móvil quiero una sensación de:

FLOW.

No mini-PC.

Ejemplo:

📍 Ve a A-10.2

↓

Llegué

↓

Recoge 12

↓

Escanea / confirma lote

↓

12 de 12 ✓

↓

“Siguiente parada → F-4.3”

Debe sentirse casi como seguir indicaciones.

## Joyful reporting

Los reportes tampoco deben sentirse como contabilidad gris.

Ejemplo:

EXACTITUD DE INVENTARIO

98.7%

↑ 1.4% vs mes anterior

“Vamos mejorando.”

Pero siempre permitir abrir:

¿Cómo se calculó?

→ fórmula
→ datos
→ diferencias
→ conteos.

Joyfulness arriba.

Rigor debajo.

## Reportes deben contar historias

No mostrar solamente:

1,342
98%
43
21

Mostrar contexto.

Ejemplo:

“Esta semana hicimos 15 conteos.

13 coincidieron a la primera.
2 necesitaron reconteo.
1 terminó en ajuste.”

Después:

[Ver los 2 casos]

## El producto puede reconocer buenas prácticas

Ejemplos:

“Buen ojo.
Detectaste una diferencia antes del despacho.”

“Todo coincide.
Eso es trazabilidad.”

“Recepción limpia:
cantidad física = lotes identificados.”

“Ruta lista.
7 despachos · 12 paradas.”

No usar lenguaje moralizante.

## Design quality bar

Antes de considerar terminada una pantalla, preguntar:

1. ¿Una persona nueva entiende qué debe hacer?

2. ¿Una persona experta puede hacerlo rápido?

3. ¿Está claro qué es importante?

4. ¿La pantalla responde qué pasó después de una acción?

5. ¿Hay algún dato que estamos pidiendo dos veces?

6. ¿Hay algo que podamos automatizar?

7. ¿El flujo se siente pesado?

8. ¿Existe una forma más visual de explicarlo?

9. ¿La experiencia provoca usarla otra vez?

10. ¿Seguimos manteniendo el rigor del dominio?

Si la respuesta a 9 es “no”:
todavía no hemos terminado el diseño.

## Product benchmark emocional

No quiero que el benchmark emocional sea:

SAP
Oracle
un ERP tradicional.

Esos productos pueden ser benchmarks de profundidad funcional.

Pero la experiencia debería inspirarse conceptualmente en productos que hacen tareas complejas sentirse simples:

- Linear;
- Notion;
- Stripe;
- Apple;
- Duolingo en feedback/progress, sin infantilizar;
- videojuegos de gestión en visualización y sentido de progreso.

No copiar interfaces.

Tomar principios:

claridad;
feedback;
motion;
progress;
exploration;
direct manipulation;
personality.

## North star de experiencia

No quiero escuchar:

“El sistema funciona.”

Quiero escuchar:

“Está buenazo usarlo.”

“Es facilísimo.”

“Ya entendí.”

“Ahí está.”

“Me avisa solo.”

“Antes tenía que preguntarle a alguien.”

“Qué chévere ver el almacén así.”

Y al mismo tiempo necesito que un auditor pueda decir:

“Puedo reconstruir exactamente qué ocurrió.”

Ese es el producto.
