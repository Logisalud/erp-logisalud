// Fichas de los 6 indicadores — texto oficial de las láminas 3 a 9 del
// PPT de Finanzas (pegado por Sebastián, corte 26/10/2026). No se inventa
// nada acá; es texto, no afecta ningún cálculo.

export type FichaIndicador = {
  titulo: string;
  comoSeCalcula: string;
  mejorSi: string;
  meta: string;
  alerta: string;
  responsable: string;
  queDebeHacer: string;
};

export const FICHAS: Record<string, FichaIndicador> = {
  efectividad_cobranza: {
    titulo: 'Efectividad de cobranza — ¿Cobramos lo que vence?',
    comoSeCalcula: 'Lo cobrado de las facturas que vencieron en los últimos 30 días ÷ el total que venció en ese periodo. Compara siempre las mismas facturas, sin mezclar deuda antigua con venta nueva.',
    mejorSi: 'Sube es mejor. Mide dinero que sí entró.',
    meta: '≥ 85%',
    alerta: 'Ámbar: 75% a 85%. Rojo: menos de 75% (lista semanal de impagos y llamada a cada cliente esa semana).',
    responsable: 'Cobrador, con apoyo del vendedor',
    queDebeHacer: 'Recordar el pago 7 días antes del vencimiento; confirmar fecha y monto con el cliente; llamar el mismo día que vence; visita del vendedor a quien no pagó.',
  },
  dso: {
    titulo: 'DSO frente al plazo otorgado — ¿Nos pagan dentro del plazo que dimos?',
    comoSeCalcula: 'DSO = saldo por cobrar ÷ venta promedio por día (ventas de 90 días ÷ 90). Brecha = DSO − plazo promedio otorgado. Plazo otorgado = promedio de días entre emisión y vencimiento de esas ventas (contado = 0), ponderado por monto.',
    mejorSi: 'Baja es mejor. Brecha 0 o negativa = pagan dentro del plazo; positiva = días de atraso real.',
    meta: 'Brecha ≤ 0',
    alerta: 'Brecha > 10 días en un vendedor, o DSO que sube 2 meses seguidos.',
    responsable: 'Jefe de créditos y cobranzas',
    queDebeHacer: 'Priorizar deudas grandes y antiguas; dar solo el plazo que corresponde a la categoría del cliente; revisar cada mes la brecha por vendedor; descuento por pronto pago si la empresa lo aprueba.',
  },
  morosidad_dura: {
    titulo: 'Morosidad dura (más de 60 días) — ¿Cuánta deuda está en riesgo de no cobrarse?',
    comoSeCalcula: 'Deuda con más de 60 días de vencida ÷ saldo total por cobrar.',
    mejorSi: 'Baja es mejor. Es dinero en riesgo.',
    meta: '≤ 5%',
    alerta: 'Más de 7.5%. > 60 días: carta notarial y reporte a Equifax (Infocorp). > 90 días: pase a legal.',
    responsable: 'Jefe de cobranzas',
    queDebeHacer: 'Acordar pago con letras o cronograma; enviar carta notarial a los 61 días; reportar a Equifax y bloquear crédito; vendedor: visitar y no vender hasta regularizar.',
  },
  venta_deuda_vencida: {
    titulo: 'Venta a clientes con deuda vencida — ¿Seguimos vendiendo a quien no nos paga?',
    comoSeCalcula: 'Ventas del mes a clientes que, el día de la venta, tenían una factura vencida hace más de 30 días ÷ ventas del mes.',
    mejorSi: 'Baja es mejor. Lo ideal es 0%.',
    meta: '≤ 5%',
    alerta: 'Más de 5%, o cualquier venta a un cliente con deuda > 60 días.',
    responsable: 'Vendedor y área de créditos',
    queDebeHacer: 'Revisar la deuda del cliente antes de tomar el pedido; si tiene deuda vencida, cobrar primero o vender al contado; excepciones solo con aprobación de créditos; cobranzas envía cada semana la lista de bloqueados.',
  },
  cobro_vendido: {
    titulo: 'Cobro de lo vendido (anti-trampa, piloto) — ¿Lo que se vende se convierte en dinero?',
    comoSeCalcula: 'De lo vendido por cada vendedor, cuánto se cobró dentro de los 60 días desde la emisión (120 si el cliente tiene plazo autorizado de 90). Se cuenta desde la emisión, no desde el vencimiento.',
    mejorSi: 'Sube es mejor. Si se alarga plazos para no verse moroso, este número baja y lo delata.',
    meta: '≥ 85%',
    alerta: 'Ámbar: 75% a 85%. Rojo: < 75%.',
    responsable: 'Vendedor',
    queDebeHacer: 'Vender a clientes que pagan; respetar el plazo autorizado por créditos; cobrar en la siguiente visita. Informativo por ahora — todavía no es base de comisión.',
  },
  registro_oportuno: {
    titulo: 'Registro oportuno de cobranzas (apoyo) — ¿Los pagos se registran a tiempo en el ERP?',
    comoSeCalcula: 'Pagos registrados en 1 día hábil o menos ÷ total de pagos del mes. Días hábiles entre la fecha del depósito y la fecha de registro, sin sábados ni domingos.',
    mejorSi: 'Sube es mejor. Un pago registrado tarde deja al cliente como deudor cuando ya pagó.',
    meta: '≥ 95%',
    alerta: 'Menos de 90%, o un pago con más de 5 días hábiles.',
    responsable: 'Tesorería / quien registra pagos',
    queDebeHacer: 'Registrar a diario los depósitos del extracto bancario; lo del fin de semana, el lunes a primera hora; siempre con la fecha del depósito y el banco.',
  },
};
