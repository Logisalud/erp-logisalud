# WMS — Decisiones pendientes

Cada decisión bloquea **solo su pieza**; el resto sigue. Tipo: N = negocio, S = sanitaria,
R = regulatoria, D = datos, O = operativa/permiso.
Actualizado: 2026-10-07 (respuestas al Gate 0).

**Ninguna decisión abierta impide empezar el Batch 1.** Dos deben resolverse **antes de cerrar**
el Batch 1 (URL de Preview): D-21 y D-27. D-24 y D-16 se verifican durante el Batch 1.

## Abiertas

| ID | Tipo | Tema | Pieza que bloquea | ¿Bloquea Batch 1? | Propuesta mientras tanto | Decide |
|---|---|---|---|---|---|---|
| D-01 | S | Compra a Diphasac de stock ya guardado: ¿nace en Cuarentena o conserva Aprobado? | Ingreso de compra a Diphasac (Batch 2) | No | Cuarentena (supuesto de reglas) | Katia |
| D-04 | N | Recepciones de Compras en estado `con_discrepancia`: ¿entran al WMS? | Ingreso de compra local (Batch 2) | No | Entran, con la cantidad física como referencia | Sebas / Katia |
| D-06 | D | E-9.1 y E-10.1 de Logissa | Carga de posiciones | No | Se crean de Logissa, "por verificar" | Charlie |
| D-07 | D | I-8.1..I-8.4 y J-12.4: dibujadas y en Odoo, sin propietario | Carga de posiciones y stock inicial | No | Libres, "por verificar" | Sebas / Charlie |
| D-08 | S | A-13.1, J-11.1, J-11.3, J-13.4: Odoo las trae en Stock; topología las pone en otra área | Carga inicial (Batch 3) | No | Área de topología; stock existente sin confirmar | Katia |
| D-09 | S | Estado sanitario del stock inicial de Odoo (supuesto: Aprobado) | Carga inicial en real (Batch 3) | No | La herramienta no confirma sin decisión | Katia |
| D-10 | R | Adenda AJR: solo se ve la firma de Logissa; el punto SEGUNDO no tiene contenido | Vigencia de AJR | No | Se registra "por confirmar firma" | Sebas |
| D-11 | R | Validez ante DIGEMID de la firma electrónica simple (usuario + hash) y de la firma táctil del transportista | Firma de actas (Batch 2) | No | Firma simple con hash; modelo abierto a firma digital | Katia / Sebas |
| D-12 | R | Cambios al formato controlado LS-FR.03.05 (agregar DNI del transportista; "Ingreso de cliente" no tiene casillero) y a LS-FR.05.05 | PDF del Acta de Recepción (Batch 2) | No | DNI como línea adicional; "Ingreso de cliente" en OTROS con texto | Katia (control documental) |
| D-13 | N | Numeración del Acta de Evaluación Organoléptica (LS-FR.55.02 no la tiene) | Acta organoléptica (Batch 2) | No | Correlativo interno `O-AAAAMM-NNNN` | Katia |
| D-15 | N | Movimientos: ¿el que prepara puede verificar? Roberto y Jasury no aparecen en los mapeos | Verificación de movimientos (Batch 3) | No (la regla verificador ≠ ejecutor sí se construye en la base del ledger) | Verificador ≠ ejecutor; el preparador puede verificar si no ejecutó | Charlie |
| D-16 | D | Unidades: `unidad_medida` es texto; Compras guarda `numeric(14,3)` | Invariante de lotes (Batch 2); el ledger entero se crea en Batch 1 | Parcial: reversible | Cantidades enteras; decimales bloquean con mensaje | Sebas |
| D-17 | S | Pendientes 2–7 de reglas-negocio.md (destino de rechazados, hold, documentos de baja, contramuestra, muestreo, "Calidad") | Cada pieza respectiva (Batch 2/3) | No | No se implementan; muestreo parametrizado | Katia |
| D-18 | N | Ajustes: reglas dice solo Katia; el mapeo INV-05 nombra además a Mariela Casiano | Ajustes (Batch 3) | No | Solo Katia | Katia |
| D-19 | N | Si la cantidad física cambia en Compras después del ingreso | Divergencia Compras ↔ WMS (Batch 2) | No | El WMS conserva su copia y marca la divergencia | Sebas |
| D-21 | O | Crear el proyecto Vercel `erp-logisalud-wms`. **Verificado: genera costo** (ver abajo) → **no creado** | URL de Preview del PR (cierre de Batch 1) | No para empezar; **sí antes del cierre** | No se crea | Sebas |
| D-22 | O | Exponer el schema `wms` en Data API y registrarlo en `schemas_compras_y_pagos()` | Pruebas contra Supabase real | No (con Postgres local no hace falta) | Pendiente | Sebas |
| D-23 | O | Fila en `public.modulos` y rewrite `/wms` en cobranzas | Acceso desde erp.logisalud.com | No | No se toca | Sebas |
| D-24 | D | Confirmar que Sandra, Katia, Charlie, etc. existen en `public.perfiles` y su área (¿Sandra = `direccion_tecnica`?) | Alta de productos por Sandra | Parcial: se verifica en Batch 1 | Lectura de solo `area` y `rol` (sin nombres) en producción, o que me lo confirmes | Sebas |
| D-25 | N | Transportista: DNI o brevete (el mapeo AS-IS dice "DNI o brevete"; reglas dice DNI) | Firma del transportista (Batch 2) | No | DNI | Sebas |
| D-26 | N | Exportación de Odoo con stock real (producto, lote, vencimiento, cantidad por ubicación): no está en el repo; el Excel de `layouts/` es solo el árbol de ubicaciones | Carga inicial en real (Batch 3) | No | Herramienta con datos de prueba | Sebas |
| D-27 | O | **Nueva.** Preview sin base de datos de pruebas: con Postgres local y sin Supabase de pruebas, la URL de Preview no tiene backend | Preview del PR (cierre de Batch 1) | No para empezar; **sí antes del cierre** | Modo demostración (`WMS_DEMO=1`): datos de prueba en memoria, solo en Preview, apagado en producción | Sebas |

## Resueltas (2026-10-07)

| ID | Resolución | Dónde quedó |
|---|---|---|
| D-02 | Quien registra Aprobado o Bajas/Rechazados es Katia, al firmar el acta organoléptica en el WMS. Charlie no ejecuta ese cambio. | reglas-negocio.md (Estado sanitario) |
| D-03 | Una OC puede tener varias recepciones; cada recepción de Compras es un ingreso distinto en el WMS. | reglas-negocio.md (Tipos de ingreso); gate-0.md C.6 |
| D-05 | El rack A llega a A-27 (los planos lo dibujan). Se corrige `topologia.md` en la rama; llega a `main` con el PR del Batch 1. | topologia.md |
| D-14 | El cargo es "Jefe de Almacén" en la interfaz y en el acta. | reglas-negocio.md (Roles) |
| D-20 | Base de pruebas: Postgres local, sin costo adicional (ni branch de Supabase ni servicios pagos). | gate-0.md §G |
| — | Vencimiento: se registra la fecha completa del producto físico; solo si el producto muestra mes y año se usa el último día del mes. | reglas-negocio.md (Recepción 2) |

## D-21 — por qué no creé el proyecto de Vercel

Condición del usuario: crearlo solo si no genera costo adicional. Verificación (solo lectura, facturación del equipo `logisalud`, un día de muestra):
- El equipo tiene **facturación por consumo**: el día de muestra se facturó **USD 0.40** (costo efectivo USD 1.07, lo demás cubierto por créditos incluidos). **"Build CPU Minutes" fue lo más caro: USD 0.308**. También hay un renglón "Additional Team Seats". No pude leer el nombre del plan.
- Un proyecto nuevo enlazado a Git construye en cada push de la rama (Preview) y **cada build consume "Build CPU Minutes"**, que se factura. Crear el proyecto en sí no mostró un cargo propio, pero **sí sumaría builds**. Con el repo en un monorepo, cada push a `feat/wms-batch-1` ya dispara builds de los otros proyectos; este sería uno más.
- Por eso, al haber un costo (aunque pequeño), **no lo creé**.
- Opciones para decidir: (a) aceptar el costo de builds (estimado de unos centavos de dólar por build; no lo puedo precisar); (b) crearlo con "Ignored Build Step" para que solo construya cuando cambie `apps/wms` y con Preview solo en el PR; (c) no crearlo todavía: durante el Batch 1 todo se verifica con Playwright en local y el proyecto se crea al cierre, cuando decidas.
