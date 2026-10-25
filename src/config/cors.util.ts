// Funcion utilitaria para normalizar y sanear origenes CORS desde variables de entorno
export function parseCorsOrigins(rawOrigin?: string): boolean | string | string[] {
  if (!rawOrigin) {
    return true;
  }

  // Eliminar comillas envolventes de la cadena completa
  const unquoted = rawOrigin.replace(/^["']|["']$/g, '').trim();

  if (!unquoted || unquoted === '*' || unquoted === 'true') {
    return true;
  }

  const origins = unquoted
    .split(',')
    .map((item) =>
      item
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\/+$/, ''),
    )
    .filter((item) => item.length > 0);

  if (origins.length === 0) {
    return true;
  }

  return origins.length === 1 ? origins[0] : origins;
}
