import { Injectable, BadRequestException } from '@nestjs/common';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { S10ResourceItemDto } from './dto/ingest-s10.dto.js';

export interface ParsedS10Result {
  resources: S10ResourceItemDto[];
  totalRowsParsed: number;
  materialsAndEquipmentRows: number;
  discardedRows: number;
}

@Injectable()
export class S10ParserService {
  // Decodificar buffer detectando si es Windows-1252 o UTF-8
  decodeBuffer(buffer: Buffer): string {
    const utf8Str = buffer.toString('utf-8');

    // Si la decodificacion UTF-8 genera caracter de reemplazo, usar Windows-1252
    if (utf8Str.includes('\uFFFD')) {
      return iconv.decode(buffer, 'win1252');
    }

    // Heuristica para bytes comunes de tildes o enies en Windows-1252
    // En Windows-1252: e1(a), e9(e), ed(i), f3(o), fa(u), f1(n), d1(N)
    let hasWin1252Byte = false;
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      // Si encontramos un byte alto tipico aislado no precedido por prefijo UTF-8
      if (
        (byte === 0xf1 || byte === 0xd1 || byte === 0xf3 || byte === 0xe1) &&
        (i === 0 || buffer[i - 1] < 0xc0 || buffer[i - 1] > 0xdf)
      ) {
        hasWin1252Byte = true;
        break;
      }
    }

    if (hasWin1252Byte) {
      return iconv.decode(buffer, 'win1252');
    }

    return utf8Str;
  }

  // Detectar delimitador predominante entre coma y punto y coma
  detectDelimiter(text: string): string {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return ',';

    const sample = lines.slice(0, 5).join('\n');
    const semicolonCount = (sample.match(/;/g) || []).length;
    const commaCount = (sample.match(/,/g) || []).length;

    return semicolonCount > commaCount ? ';' : ',';
  }

  // Normalizar valor numerico de cantidad
  parseQuantity(rawVal: unknown): number {
    if (typeof rawVal === 'number') return rawVal;
    if (typeof rawVal !== 'string') return 0;

    let val = rawVal.trim();
    if (!val) return 0;

    // Si tiene comas y puntos, ej 1,250.50 o 1.250,50
    if (val.includes(',') && val.includes('.')) {
      if (val.lastIndexOf(',') > val.lastIndexOf('.')) {
        // Formato europeo 1.250,50 -> 1250.50
        val = val.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato americano 1,250.50 -> 1250.50
        val = val.replace(/,/g, '');
      }
    } else if (val.includes(',')) {
      // Si solo tiene coma ej 2500,50
      val = val.replace(',', '.');
    }

    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  // Evaluar si una partida debe ser descartada (01 Mano de Obra o 04 Subcontratos)
  isDiscardedResource(code?: string, rawName?: string, groupOrType?: string): boolean {
    const cleanCode = (code ?? '').trim();
    const cleanName = (rawName ?? '').trim().toUpperCase();
    const cleanType = (groupOrType ?? '').trim().toUpperCase();

    // Descarte por codigo S10 de dos digitos iniciales
    if (cleanCode.startsWith('01') || cleanCode.startsWith('04')) {
      return true;
    }

    // Descarte por grupo o descripcion
    if (
      cleanType.includes('MANO DE OBRA') ||
      cleanType.includes('SUBCONTRATO') ||
      cleanName.startsWith('MANO DE OBRA') ||
      cleanName.startsWith('SUBCONTRATO')
    ) {
      return true;
    }

    return false;
  }

  // Parsear contenido de archivo exportado de S10
  parseS10Buffer(buffer: Buffer): ParsedS10Result {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('El archivo de presupuesto S10 esta vacio');
    }

    const decodedText = this.decodeBuffer(buffer);
    const delimiter = this.detectDelimiter(decodedText);

    const parseResult = Papa.parse<Record<string, string>>(decodedText, {
      delimiter,
      header: true,
      skipEmptyLines: 'greedy',
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      throw new BadRequestException(
        `Error al parsear el archivo CSV: ${parseResult.errors[0]?.message ?? 'formato invalido'}`,
      );
    }

    const rows = parseResult.data;
    const resources: S10ResourceItemDto[] = [];
    let totalRowsParsed = 0;
    let materialsAndEquipmentRows = 0;
    let discardedRows = 0;

    for (const row of rows) {
      totalRowsParsed++;

      // Extraer campos buscando nombres de columnas comunes en exportaciones S10
      let s10Code: string | undefined;
      let s10RawName: string | undefined;
      let s10Unit: string | undefined;
      let rawQuantity: unknown;
      let groupOrType: string | undefined;

      for (const [key, val] of Object.entries(row)) {
        const k = key.trim().toLowerCase();
        if (
          k === 'codigo' ||
          k === 'código' ||
          k === 's10code' ||
          k === 'cod_insumo' ||
          k === 'cod_recurso' ||
          k === 'recurso_cod'
        ) {
          s10Code = val?.trim();
        } else if (
          k === 'descripcion' ||
          k === 'descripción' ||
          k === 's10rawname' ||
          k === 'recurso' ||
          k === 'insumo' ||
          k === 'nombre' ||
          k === 'descripcion_recurso'
        ) {
          s10RawName = val?.trim();
        } else if (
          k === 'unidad' ||
          k === 'und' ||
          k === 's10unit' ||
          k === 'unidad_medida' ||
          k === 'unid'
        ) {
          s10Unit = val?.trim();
        } else if (
          k === 'cantidad' ||
          k === 'metrado' ||
          k === 'quantity' ||
          k === 'cant' ||
          k === 'total'
        ) {
          rawQuantity = val;
        } else if (
          k === 'tipo' ||
          k === 'grupo' ||
          k === 'clase' ||
          k === 'tipo_recurso'
        ) {
          groupOrType = val?.trim();
        }
      }

      // Si no hay descripcion del insumo, ignorar fila
      if (!s10RawName) {
        continue;
      }

      // Filtrar recursos descartados (Mano de Obra y Subcontratos)
      if (this.isDiscardedResource(s10Code, s10RawName, groupOrType)) {
        discardedRows++;
        continue;
      }

      const quantity = this.parseQuantity(rawQuantity);
      if (quantity <= 0) {
        continue;
      }

      materialsAndEquipmentRows++;
      resources.push({
        s10Code: s10Code || undefined,
        s10RawName,
        s10Unit: s10Unit || undefined,
        quantity,
      });
    }

    return {
      resources,
      totalRowsParsed,
      materialsAndEquipmentRows,
      discardedRows,
    };
  }
}
