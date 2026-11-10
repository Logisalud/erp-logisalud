// «Hoy» para la operación es el día de Lima (UTC-5, sin horario de verano), no el día UTC: entre las 19:00 y las 24:00 de Lima
// el día UTC ya es el siguiente. Un solo lugar para calcularlo evita que unas pantallas usen un día y otras otro.
export const hoyLima = (ahora: Date = new Date()): string => new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
