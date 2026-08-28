// Ya no es un placeholder — ver README.md.
// El preset de Tailwind se consume por su propio subpath
// (`@logisalud/design-system/tailwind-preset`, un module.exports plano de
// CommonJS que lee tailwind.config.js), no desde acá.
export { BrandMark } from './componentes'
export type { BrandMarkLayout, BrandMarkColorway } from './componentes'
