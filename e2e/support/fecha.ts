const relleno = (numero: number): string => String(numero).padStart(2, "0");

export const fechaLocal = (fecha: Date): string =>
  `${fecha.getFullYear()}-${relleno(fecha.getMonth() + 1)}-${relleno(fecha.getDate())}`;

export const claveDia = fechaLocal;
