# WMS — Decisiones pendientes

Cada decisión bloquea **solo su pieza**; el resto sigue. Tipo: N = negocio, S = sanitaria,
R = regulatoria, D = datos, O = operativa/técnica que requiere permiso tuyo.
Actualizado: 2026-10-07 (Gate 0).

| ID | Tipo | Tema | Pieza bloqueada | Propuesta mientras tanto | Decide |
|---|---|---|---|---|---|
| D-01 | S | Compra a Diphasac de stock ya guardado: ¿nace en Cuarentena o conserva Aprobado? (reglas, pendiente 1) | Ingreso de compra a Diphasac | Supuesto de reglas: Cuarentena | Katia |
| D-02 | N | Quién ejecuta el cambio a Aprobado: mapeos dicen Charlie; reglas dicen Katia | Pantalla de aprobación (Batch 2) | Solo `direccion_tecnica` aprueba | Katia / Sebas |
| D-03 | N | Una OC con varias recepciones: ¿1 recepción de Compras = 1 ingreso WMS? | Ingreso de compra local | 1:1 (`compra_recepcion_id` único) | Sebas |
| D-04 | N | Recepciones de Compras en estado `con_discrepancia`: ¿entran al WMS? | Ingreso de compra local | Entran, con la cantidad física como referencia | Sebas / Katia |
| D-05 | D | Rack A: A-22..A-27 (topologia.md dice que los planos 2026 llegan a A-21; los 4 planos 2026 sí dibujan A-27) | Carga de posiciones | Se crean "por verificar"; propongo corregir topologia.md en `main` | Charlie (sitio) |
| D-06 | D | E-9.1 y E-10.1 de Logissa | Carga de posiciones | Se crean a nombre de Logissa, "por verificar" | Charlie |
| D-07 | D | I-8.1..I-8.4 y J-12.4: dibujadas y en Odoo, sin propietario | Carga de posiciones y stock inicial | Libres, "por verificar" | Sebas / Charlie |
| D-08 | S | A-13.1, J-11.1, J-11.3, J-13.4: Odoo las trae en Stock, topología las pone en otra área | Carga inicial de esas posiciones | Se carga el área de topología; el stock existente queda sin confirmar | Katia |
| D-09 | S | Estado sanitario del stock inicial de Odoo (supuesto: Aprobado) | Carga inicial en real | La herramienta no confirma sin decisión | Katia |
| D-10 | R | Adenda AJR: solo se ve la firma de Logissa; SEGUNDO sin contenido | Vigencia de AJR | Se registra "por confirmar firma" | Sebas |
| D-11 | R | Validez ante DIGEMID de la firma electrónica simple (usuario + hash) y de la firma táctil del transportista | Firma de actas | Se implementa firma simple con hash; modelo abierto a proveedor de firma digital | Katia / Sebas |
| D-12 | R | Cambios al formato controlado LS-FR.03.05 (agregar DNI del transportista; "Ingreso de cliente" no está en los casilleros) y a LS-FR.05.05 | PDF del Acta de Recepción | DNI como línea adicional; "Ingreso de cliente" en OTROS con texto | Katia (control documental) |
| D-13 | N | Numeración del Acta de Evaluación Organoléptica (LS-FR.55.02 no tiene) | Acta organoléptica | Correlativo interno `O-AAAAMM-NNNN` | Katia |
| D-14 | N | Nombre del cargo: "Responsable de Almacén" (roles) vs "Jefe de Almacén" (acta) | Textos de UI y PDF | UI: Responsable; PDF: Jefe de Almacén | Sebas |
| D-15 | N | Movimientos: ¿el que prepara puede verificar? Roberto y Jasury no aparecen en los mapeos | Verificación de movimientos | Verificador ≠ ejecutor; el preparador puede ser cualquiera salvo el ejecutor | Charlie |
| D-16 | D | Unidades: `unidad_medida` es texto; Compras guarda `numeric(14,3)` | Ingreso (invariante) | Cantidades enteras; decimales bloquean con mensaje | Sebas |
| D-17 | S | Pendientes 2–7 de reglas-negocio.md (destino de rechazados, hold, documentos de baja, contramuestra, muestreo, "Calidad") | Cada pieza respectiva | No se implementan; muestreo parametrizado | Katia |
| D-18 | N | Ajustes de inventario: reglas dice solo Katia; mapeo INV-05 nombra además a Mariela Casiano | Ajustes (Batch 3) | Solo Katia | Katia |
| D-19 | N | Recepción parcial y reapertura cuando la cantidad física cambia en Compras después del ingreso | Divergencia Compras ↔ WMS | El WMS conserva su snapshot y marca divergencia | Sebas |
| D-20 | O | Base de pruebas: Postgres local (propuesto) o branch de Supabase (puede costar) | E2E contra Supabase real | Postgres local + adaptador de prueba | Sebas |
| D-21 | O | Crear el proyecto Vercel `erp-logisalud-wms` (solo Preview) | Preview del WMS | No se crea | Sebas |
| D-22 | O | Exponer el schema `wms` en Data API y registrarlo en `schemas_compras_y_pagos()` | Cualquier prueba contra Supabase real | Pendiente de que exista base de pruebas | Sebas |
| D-23 | O | Crear/actualizar `public.modulos` y el rewrite `/wms` en cobranzas | Acceso desde erp.logisalud.com | No se toca | Sebas |
| D-24 | D | Confirmar que Sandra, Katia, Charlie, etc. existen en `public.perfiles` y su área (¿Sandra = `direccion_tecnica`?) | Alta de productos | Se asume; se verifica en Batch 1 | Sebas |
| D-25 | N | Transportista: DNI o brevete (mapeo AS-IS dice "DNI o brevete", reglas dice DNI) | Firma del transportista | DNI | Sebas |
| D-26 | N | Exportación inicial de Odoo con stock (producto, lote, vencimiento, cantidad por ubicación): aún no está en el repo; el Excel de `layouts/` es solo el árbol de ubicaciones | Carga inicial en real | Herramienta con datos de prueba | Sebas |
