# ADR-006 — El cambio de estado ocurre en el lugar; Aprobado "por trasladar"

**Contexto.** Las reglas dicen (a) "mover no cambia el estado", (b) la zona de Cuarentena admite solo Cuarentena y
(c) "salir de Cuarentena hacia un rack: solo si está Aprobado con acta organoléptica firmada". Para salir de Cuarentena la
unidad ya debe estar Aprobada, es decir, hay un momento en que está Aprobada dentro de la zona de Cuarentena.

**Decisión.** `CAMBIO_ESTADO` se registra **en el mismo lugar** y no se valida contra la matriz de zonas; la matriz se valida
al **entrar** unidades a una posición (ingreso, movimiento, carga, ajuste). Esas unidades se muestran como
"Aprobado · por trasladar" (inicio, mapa, drawer) hasta que se muevan a un rack de su propietario. Entrar un Aprobado a
la zona de Cuarentena por un movimiento sigue bloqueado.

**Pendiente de confirmar** (D-28): que Katia y Charlie vean bien este estado intermedio, o prefieran un traslado atómico.
