/**
 * Set de íconos propio, dibujado en una sola gramática: grilla de 24,
 * trazo 1.75, extremos y uniones redondeados, `currentColor` siempre.
 *
 * Existe porque la interfaz venía usando glifos Unicode (`⚠`, `✕`) como si
 * fueran íconos: cada uno se renderiza con la fuente del sistema, cambia de
 * peso y de alineación entre Android e iOS, y nunca combina con el resto.
 * Un ícono es un dibujo, no un carácter.
 */

type IconProps = {
  className?: string;
  /** Los íconos son decorativos salvo que se les dé un título. */
  title?: string;
};

function Svg({ children, className, title }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z" />
      <path d="m13.5 6.5 4 4" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 13 4.5 4.5L19 7" />
    </Svg>
  );
}

/** Triángulo de advertencia: bloqueo del flujo, no error del sistema. */
export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </Svg>
  );
}

/** Círculo con exclamación: algo salió mal, no algo que falta completar. */
export function IconError(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v4.5" />
      <path d="M12 15.8v.1" />
    </Svg>
  );
}

export function IconSpinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`animate-spin ${className ?? "h-5 w-5"}`}
      aria-hidden={true}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Descarga: flecha hacia una bandeja. */
export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v10" />
      <path d="m8 11 4 4 4-4" />
      <path d="M5 18h14" />
    </Svg>
  );
}
