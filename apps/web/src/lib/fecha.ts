export const formatFecha = (
  iso: string,
  locale: string,
  opciones: Intl.DateTimeFormatOptions = { dateStyle: "long", timeStyle: "short" },
): string => {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale, opciones).format(fecha);
};
