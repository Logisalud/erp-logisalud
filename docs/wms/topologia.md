# Topología — Almacén Lurín (Panamericana Sur km 29.5)
Fuente: planos en docs/wms/layouts/.
Nomenclatura:
- Rack-Posición.Nivel (A-10.2); niveles 1–4.
- Subrack: Rack-Posición.Nivel.Sub (E-8.1.3).
- Piso: Rack-Posición (B-1).

## Áreas compartidas (varios propietarios por posición)
- Recepción: A-1 a A-5 (pallets) y A-M1 (mesa). Tránsito.
- Cuarentena: A-6 a A-9.
- Embalaje K-M2; Despacho K-1 a K-7. Fuera de alcance, pero se crean.

## Por propietario
| Propietario (plano) | Aprobados | Contramuestra | Bajas/Rech. | Devoluciones |
|---|---|---|---|---|
| Logissa (2026) | E-8 a E-10 niveles 2–4; F-1 a F-10, G-1 a G-6, H-1 a H-10, I-9 a I-10 niveles 1–4; piso B-1..B-7, C-1..C-7, D-1..D-7, E-1..E-7; E-8.1.4 | E-8.1.3 | E-8.1.2 | E-8.1.1 |
| Diphasac (2026) | A-14 a A-27 nivel 1; A-10 a A-27 niveles 2–4; J-1 a J-10 niveles 1 y 3; J-1 a J-11 niveles 2 y 4 | J-12.3, J-13.4 | J-12.1, J-12.2, J-13.2 | A-10.1, A-12.1 |
| Triamed (2026) | I-1.1.4 | I-1.1.3 | I-1.1.2 | I-1.1.1 |
| Medic Pharma Lab (2026) | I-2 a I-7 nivel 1; I-1 a I-7 niveles 2–4 | J-11.1 | J-11.3 | A-13.1 |
| AJR Labs (2023) | G-1 a G-10 niveles 1–4 | J-13.3 | J-13.1 | A-11.1 |
Las posiciones no asignadas en ningún plano quedan libres.

## Conflictos por verificar en físico (no inventar)
1. Rack A: los planos 2026 dibujan hasta A-21; el plano AJR 2023, la tabla de Diphasac y Odoo llegan a A-27. Charlie verifica en sitio.
2. G-1 a G-6: asignadas a Logissa (2026) y a AJR Labs (2023). Confirmar la asignación vigente.
3. E-9.1 y E-10.1 no figuran en la tabla de Logissa 2026.
Todo esto debe ser configurable, no fijo en código. Los planos no tienen escala exacta: usar un layout aproximado marcado como tal, con herramienta de calibración.
