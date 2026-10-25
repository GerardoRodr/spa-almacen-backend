import { describe, it, expect } from 'vitest';
import { parseCorsOrigins } from './cors.util.js';

describe('parseCorsOrigins', () => {
  it('debe retornar true si no se proporciona origen', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins('')).toBe(true);
    expect(parseCorsOrigins('   ')).toBe(true);
  });

  it('debe retornar true para comodines * y true con o sin comillas', () => {
    expect(parseCorsOrigins('*')).toBe(true);
    expect(parseCorsOrigins('"*"')).toBe(true);
    expect(parseCorsOrigins("'*'")).toBe(true);
    expect(parseCorsOrigins('true')).toBe(true);
    expect(parseCorsOrigins('"true"')).toBe(true);
  });

  it('debe limpiar comillas dobles y simples en origen unico', () => {
    expect(parseCorsOrigins('"https://almacen.paloje.cloud"')).toBe('https://almacen.paloje.cloud');
    expect(parseCorsOrigins("'https://almacen.paloje.cloud'")).toBe('https://almacen.paloje.cloud');
  });

  it('debe limpiar slashes finales', () => {
    expect(parseCorsOrigins('https://almacen.paloje.cloud/')).toBe('https://almacen.paloje.cloud');
    expect(parseCorsOrigins('"https://almacen.paloje.cloud///"')).toBe('https://almacen.paloje.cloud');
  });

  it('debe parsear listas con comillas globales o individuales', () => {
    const res1 = parseCorsOrigins('"https://almacen.paloje.cloud,http://localhost:4200"');
    expect(res1).toEqual(['https://almacen.paloje.cloud', 'http://localhost:4200']);

    const res2 = parseCorsOrigins('"https://almacen.paloje.cloud", "http://localhost:4200"');
    expect(res2).toEqual(['https://almacen.paloje.cloud', 'http://localhost:4200']);

    const res3 = parseCorsOrigins("'https://almacen.paloje.cloud/', 'http://localhost:4200/'");
    expect(res3).toEqual(['https://almacen.paloje.cloud', 'http://localhost:4200']);
  });

  it('debe retornar true si la lista queda vacia tras filtrar comillas o espacios', () => {
    expect(parseCorsOrigins('""')).toBe(true);
    expect(parseCorsOrigins("''")).toBe(true);
    expect(parseCorsOrigins('"", "  "')).toBe(true);
  });
});
