# Product

<!-- impeccable:product-schema 1 -->

> Registro inferido del brief y de `docs/wms/` (reglas-negocio, topología, experiencia, visión), que el usuario
> confirmó en el Gate 0 (2026-10-07). No hubo entrevista adicional: lo no confirmado está marcado "por decidir".

## Platform

web

## Stack
Next.js 14.2.29 (App Router) + React 18 + Tailwind 3, en el monorepo de Logisalud (zona `/wms`). Preset de marca de
`@logisalud/design-system`. Datos: schema `wms` del Supabase consolidado; en Preview, modo demostración con datos de prueba.

## Users
Equipo de almacén y de Dirección Técnica de Logisalud (almacén Lurín), con teléfonos personales en el piso y PC en oficina.
- **Dirección Técnica (Katia):** decide estados sanitarios, valida productos, aprueba ajustes.
- **Asistente DT (Sandra):** da de alta productos y registro sanitario; evaluación organoléptica y cierre documental.
- **Jefe de Almacén (Charlie)** y reemplazos (Roberto, Jasury): ubican, mueven, verifican.
- **Auxiliares** (Christians, Jose Carlos, Alberto, Milka): ejecutan movimientos y conteos desde el celular.
- Administración y Auditoría: configuración y lectura.

## Product Purpose
Que cualquier persona del almacén sepa **qué hay, dónde está y en qué estado sanitario**, sin preguntarle a Charlie; y que
el rigor BPA (DIGEMID) viva debajo: trazabilidad, ledger inmutable, estados sanitarios y propietarios validados en la base.
Éxito: una recepción, un movimiento o un conteo se hace sin duda y deja historia reconstruible.

## Positioning
Un WMS pequeño y propio del almacén de Logisalud que guarda mercadería de varios propietarios (Logissa y cuatro clientes) con
reglas por zona y propietario que un ERP genérico no modela. Alcance actual: entradas y movimientos internos.

## Operating Context
Almacén farmacéutico con racks y piso, posiciones con nomenclatura Rack-Posición.Nivel (A-10.2, E-8.1.3), áreas por estado
(Recepción, Cuarentena, Devoluciones, Aprobados, Bajas/Rechazados, Contramuestra). Transición en paralelo con Odoo. Los
documentos (actas) respetan formatos controlados LS-FR.03.05, LS-FR.05.05, LS-FR.55.02.

## Capabilities and Constraints
- Todo saldo tiene propietario; el estado sanitario vive en cada unidad, no en el lote. Aprobado nunca vuelve a Cuarentena.
- Mapa 2D completo en PC/tablet; en teléfono, búsqueda y ubicación en texto. Paridad funcional PC/teléfono.
- Español peruano con tuteo; nada en inglés. Estados con texto + ícono, nunca solo color.
- Fuera de alcance (puntos de extensión): salidas/picking/despacho, integración con Pedidos, importaciones, VERDE/ÁMBAR, hold.
- Por decidir: ver `docs/wms/decisiones-pendientes.md`.

## Brand Commitments
Marca Logisalud: verde `#4BB168`, teal `#4ABCC2`, Oswald para títulos, Poppins para cuerpo (preset del design-system). Fondo
`bg-gray-50`, tarjetas con borde sutil, sin gradientes ni sombras agresivas. Tono del ERP interno: cercano ("alegre en la superficie,
riguroso por debajo"), nunca moralizante, sin infantilizar.

## Evidence on Hand
Planos 2026 y adenda de AJR (`docs/wms/layouts/`), Excel de ubicaciones de Odoo, formatos controlados (`docs/wms/formatos/`),
8 mapeos TO-BE (`docs/wms/procesos/`). No existen fotos reales del almacén ni datos reales de stock: los datos de la demostración
son sintéticos y están rotulados.

## Product Principles
1. Cuando todo está bien, el sistema se aparta; cuando algo no cuadra, lo dice con palabras humanas y dice qué hacer.
2. Un dato se escribe una sola vez; el WMS enlaza, no duplica.
3. Nada se oculta ni se borra: lo que se corrige deja historia.
4. El rigor es invisible hasta que importa; la ubicación y el estado son siempre visibles juntos.
5. El teléfono es un instrumento de piso: una tarea, una decisión, el siguiente paso.

## Accessibility & Inclusion
Contraste AA, foco visible (teal de marca), objetivos táctiles ≥ 48 px en teléfono, navegación por teclado completa (Ctrl/Cmd+K),
el mapa siempre complementado por búsqueda y lista, estados nunca solo por color.
