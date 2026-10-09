# Dos notas de crédito que la letra no reflejaba — 2026-10-09

Cobranzas (Mily) reportó que en `FFF1-906` de GRUPO KORMED la nota de
crédito no bajaba el saldo. La pantalla de desglose lo marcaba como
"Diferencia sin explicar", que es lo que tiene que hacer: no se la tragó.

## Por qué pasaba

El saldo de una factura **canjeada por letras** sale de sus letras
pendientes, no de "importe − notas de crédito" (segunda rama de
`v_cobros`). En los dos casos la letra se giró por el importe completo y la
nota de crédito llegó meses después, sin que nadie tocara la letra.

El sistema **no puede descontarla solo, y no debe**: una letra es un título
valor por un monto firmado. Si la pantalla bajara el saldo por su cuenta,
diría una cifra mientras el banco cobra otra. Por eso avisa y espera que
Administración decida contra qué letra se aplica.

## Qué se ajustó

Se bajó el `monto_aplicado` del vínculo `letra_documento` —cuánto de esa
letra se le imputa a esa factura— **sin tocar el importe de la letra**: el
papel sigue valiendo lo que dice.

| Factura | Cliente | Letra elegida | Antes | Ahora | Saldo factura |
|---|---|---|---:|---:|---:|
| FFF1-906 | GRUPO KORMED | L00031 (**protestada**, venció 09/07) | 3.750,63 | **1.150,19** | 3.750,63 → **1.150,19** |
| FFF1-1626 | DIST. DROGUERIA TRUJILLO | L00066 (**en cartera**, venció 02/10) | 1.801,92 | **1.277,58** | 3.603,84 → **3.079,50** |

Criterio de contra qué letra se aplica cada nota:

- **KORMED**: la única letra está protestada. Ya volvió del banco, así que
  la deuda es cuenta corriente otra vez y la NC FC01-206 (S/ 2.600,44 del
  22/09) se aplica entera contra ella.
- **TRUJILLO**: son dos letras de S/ 1.801,92. La **L00067 está en el BCP y
  vencía ese mismo día: no se tocó** — el banco cobra lo que dice el papel.
  La NC FC01-175 (S/ 524,34 del 08/09) se descontó de la **L00066**, que
  está en casa y ya había vencido.

Las dos letras quedaron con la explicación escrita en `observaciones`, para
que quien las re-gire sepa por cuánto: 1.150,19 y 1.277,58.

## Verificación

- Saldos: **1.150,19** y **3.079,50**, exactamente importe − nota de crédito.
- Facturas con una NC que sus letras no reflejan: **2 antes, 0 ahora**.
- Ninguna letra quedó con `monto_aplicado` mayor que su importe.
- `SUM(saldo_pendiente)` de `v_saldos`: 663.502,19 → **660.377,41**, o sea
  **−3.124,78**, que es la suma exacta de las dos notas de crédito. No se
  movió nada más.
- El vencido bajó lo mismo (218.288,04 → 215.163,26): las dos estaban en
  tramos vencidos.
- Impacto por vendedor: TITO MINGUILLO (LIMV01) queda en 33.716,13 y OMAR
  RUBIO (TRUM02) en 13.888,21.

## Lo que queda pendiente

1. **Re-girar las letras** si se van a seguir cobrando en letra: KORMED por
   S/ 1.150,19 y TRUJILLO por S/ 1.277,58. Mientras no se haga, el sistema
   muestra la deuda real; cuando se giren, se cargan como letras nuevas.
2. **La regla automática quedó en stand-by** por decisión del usuario: la
   idea era que, cuando **todas** las letras de una factura están
   protestadas, la nota de crédito se aplique sola (una letra protestada ya
   no la cobra nadie por su valor). Hay 7 letras protestadas por S/ 19.749
   en la cartera, así que el caso se va a repetir.
3. Ojo con KORMED: antes de la NC que quedó vigente se emitieron **dos
   notas de crédito sobre la misma factura el 21 y 22/09 y se anularon**
   (FC01-202 y FC01-205). Vale revisar que la que quedó sea la correcta.

## Cómo revertirlo

```sql
update letra_documento ld set monto_aplicado = b.monto_aplicado
  from letra_documento_backup_20261009 b
 where b.documento_id = ld.documento_id and b.letra_id = ld.letra_id;
update letras l set observaciones = b.observaciones
  from letras_backup_20261009 b where b.id = l.id;
```

Los respaldos completos de las dos tablas, tal como estaban antes, quedaron
en `letra_documento_backup_20261009` y `letras_backup_20261009`.
