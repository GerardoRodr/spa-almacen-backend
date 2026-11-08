import { Injectable, BadRequestException } from '@nestjs/common';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { S10ResourceItemDto } from './dto/ingest-s10.dto.js';

export interface S10BudgetSummaryDto {
  totalDirectCost: number;
  materialsTotal: number;
  equipmentTotal: number;
  laborTotal: number;
  subcontractsTotal: number;
  location?: string;
  ubigeo?: string;
  budgetDate?: Date;
}

export interface S10ProjectMetadata {
  code?: string;
  name?: string;
  location?: string;
  ubigeo?: string;
  budgetDate?: Date;
}

export interface ParsedS10Result {
  resources: S10ResourceItemDto[];
  totalRowsParsed: number;
  materialsAndEquipmentRows: number;
  discardedRows: number;
  s10ProjectCode?: string;
  s10ProjectName?: string;
  projectMetadata?: S10ProjectMetadata;
  budgetSummary: S10BudgetSummaryDto;
}

export type S10ParseResult = ParsedS10Result;

@Injectable()
export class S10ParserService {
  // Expresion regular para firma unica de codigo S10 de 10 a 14 digitos iniciando en 01, 02, 03 o 04
  private static readonly S10_CODE_REGEX = /^(01|02|03|04)\d{8,12}$/;

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

  // Normalizar valor numerico de cantidad o precio
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

  // Evaluar si una celda contiene un porcentaje textual
  isPercentageValue(rawVal: unknown): boolean {
    return typeof rawVal === 'string' && rawVal.includes('%');
  }

  // Evaluar si una partida debe ser descartada basandose en los dos primeros digitos del codigo
  isDiscardedResource(code?: string, rawName?: string, groupOrType?: string): boolean {
    const cleanCode = (code ?? '').trim();
    if (cleanCode) {
      // Descarte estricto de Mano de Obra (01) y Subcontratos (04)
      if (cleanCode.startsWith('01') || cleanCode.startsWith('04')) {
        return true;
      }
      // Admision exclusiva de Materiales (02) y Equipos/Herramientas (03)
      if (cleanCode.startsWith('02') || cleanCode.startsWith('03')) {
        return false;
      }
      return true;
    }

    // Compatibilidad en caso de ausencia de codigo numerico en payload directo
    const cleanName = (rawName ?? '').trim().toUpperCase();
    const cleanType = (groupOrType ?? '').trim().toUpperCase();

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

  // Parsear fecha proveniente de cabecera S10 (DD/MM/YYYY o YYYY-MM-DD)
  parseS10Date(rawDate?: string): Date | undefined {
    if (!rawDate) return undefined;
    const trimmed = rawDate.trim();
    if (!trimmed) return undefined;

    // DD/MM/YYYY o DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      const date = new Date(Date.UTC(year, month, day));
      return isNaN(date.getTime()) ? undefined : date;
    }

    // YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      const date = new Date(Date.UTC(year, month, day));
      return isNaN(date.getTime()) ? undefined : date;
    }

    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? undefined : parsed;
  }

  // Resolver importe parcial segun estructura de reporte (clasico con precio en +4 y parcial en +5, o con incidencia con parcial en +4)
  resolvePartialAmount(
    row: string[],
    codeIdx: number,
    isIncidenceRow: boolean,
    quantity: number,
  ): number {
    const rawCellAfter1 = row[codeIdx + 4];
    const rawCellAfter2 = row[codeIdx + 5];

    const val1 = this.parseQuantity(rawCellAfter1);
    const isCell2Percentage = this.isPercentageValue(rawCellAfter2);
    const isCell2Empty =
      rawCellAfter2 === undefined ||
      rawCellAfter2 === null ||
      (typeof rawCellAfter2 === 'string' && rawCellAfter2.trim() === '');

    // En reporte con incidencia o cuando la celda posterior es porcentaje o esta vacia:
    // +4 es el importe parcial acumulado
    if (isIncidenceRow || isCell2Percentage || isCell2Empty) {
      return val1;
    }

    const val2 = this.parseQuantity(rawCellAfter2);
    if (val2 > 0) {
      // Caso especial herramientas manuales u otros donde cantidad es 0 pero celda +5 contiene el parcial
      if (val1 === 0 && val2 > 0) {
        return val2;
      }

      // En reporte clasico se cumple que Cantidad * Celda1 (Precio) ≈ Celda2 (Parcial)
      if (quantity > 0) {
        const expectedTotal = val1 * quantity;
        const diff = Math.abs(expectedTotal - val2);
        if (diff <= Math.max(1, val2 * 0.05)) {
          return val2;
        }
      }

      // Si no coincide la multiplicacion, celda1 es parcial y celda2 es porcentaje plano sin signo %
      return val1;
    }

    return val1;
  }

  // Calculo resiliente del precio unitario segun estructura de celdas adyacentes (+4 y +5)
  resolveUnitPrice(
    quantity: number,
    rawCellAfter1: unknown,
    rawCellAfter2: unknown,
    isIncidence = false,
  ): number | undefined {
    if (quantity <= 0) return undefined;

    const val1 = this.parseQuantity(rawCellAfter1);
    if (val1 <= 0) return undefined;

    const isCell2Percentage = this.isPercentageValue(rawCellAfter2);
    const isCell2Empty =
      rawCellAfter2 === undefined ||
      rawCellAfter2 === null ||
      (typeof rawCellAfter2 === 'string' && rawCellAfter2.trim() === '');
    const val2 = !isCell2Percentage && !isCell2Empty ? this.parseQuantity(rawCellAfter2) : 0;

    // Si la fila corresponde a un reporte con incidencia o la celda posterior es porcentaje:
    // +4 es siempre el importe Parcial acumulado y el precio se calcula como Parcial / Cantidad
    if (isIncidence || isCell2Percentage) {
      const calculatedPrice = Number((val1 / quantity).toFixed(4));
      return calculatedPrice > 0 ? calculatedPrice : undefined;
    }

    // Caso 1: Ambas celdas posteriores contienen valores numericos positivos
    if (val2 > 0) {
      // Validacion matematica: en un reporte clasico se cumple que Cantidad * Celda1 ≈ Celda2
      const expectedTotal = val1 * quantity;
      const diff = Math.abs(expectedTotal - val2);
      // Tolerancia por redondeo de decimales (hasta 5% del parcial o 1 sol)
      if (diff <= Math.max(1, val2 * 0.05)) {
        return Number(val1.toFixed(4));
      }

      // Si no se cumple la relacion, Celda1 es el monto parcial y Celda2 es incidencia plana
      const calculatedPrice = Number((val1 / quantity).toFixed(4));
      return calculatedPrice > 0 ? calculatedPrice : undefined;
    }

    // Caso 2: Solo la primera celda contiene valor positivo y la siguiente esta vacia -> +4 es Parcial
    const calculatedPrice = Number((val1 / quantity).toFixed(4));
    return calculatedPrice > 0 ? calculatedPrice : undefined;
  }

  // Parsear contenido de archivo exportado de S10 mediante matriz cruda y deteccion heuristica
  parseS10Buffer(buffer: Buffer): ParsedS10Result {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('El archivo de presupuesto S10 esta vacio');
    }

    const decodedText = this.decodeBuffer(buffer);
    const delimiter = this.detectDelimiter(decodedText);

    // Lectura en matriz cruda bidimensional sin asumir encabezados
    const parseResult = Papa.parse<string[]>(decodedText, {
      delimiter,
      header: false,
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
    let s10ProjectCode: string | undefined;
    let s10ProjectName: string | undefined;
    let s10Location: string | undefined;
    let s10Ubigeo: string | undefined;
    let s10BudgetDate: Date | undefined;
    let capturedTotalDirectCost: number | undefined;

    let laborBudget = 0;
    let materialsBudget = 0;
    let equipmentBudget = 0;
    let subcontractsBudget = 0;

    let nonBlankRowsCount = 0;
    let isFileIncidenceReport = false;

    // Evaluacion previa de cabeceras globales para detectar si el archivo es con incidencia
    for (const r of rows) {
      if (Array.isArray(r)) {
        const text = r.map((c) => String(c ?? '').toUpperCase()).join(' | ');
        if (text.includes('(CON INCIDENCIA)') || text.includes('% INC')) {
          isFileIncidenceReport = true;
          break;
        }
      }
    }

    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) {
        continue;
      }

      const hasContent = row.some((c) => (c ?? '').trim() !== '');
      if (!hasContent) {
        continue;
      }

      nonBlankRowsCount++;

      // Deteccion de reporte de incidencia en las etiquetas de la fila actual
      const rowUpperText = row.map((c) => String(c ?? '').toUpperCase()).join(' | ');
      const hasIncidenceTag =
        rowUpperText.includes('% INC') ||
        rowUpperText.includes('(CON INCIDENCIA)');
      const isIncidenceRow = isFileIncidenceReport || hasIncidenceTag;

      // 1. Escaneo de metadatos de Obra, Fecha y Lugar en las primeras posiciones de la fila
      let obraIndex = -1;
      const searchLimit = Math.min(row.length, 30);
      for (let i = 0; i < searchLimit; i++) {
        const cellText = (row[i] ?? '').trim().toLowerCase().replace(/:$/, '');
        if (cellText === 'obra') {
          obraIndex = i;
          if (!s10ProjectCode) {
            // Extraer las dos celdas no vacias contiguas como codigo y nombre de proyecto S10
            const adjacent: string[] = [];
            for (let j = i + 1; j < Math.min(row.length, i + 6); j++) {
              const val = (row[j] ?? '').trim();
              if (val) {
                adjacent.push(val);
                if (adjacent.length === 2) break;
              }
            }
            if (adjacent.length > 0) {
              s10ProjectCode = adjacent[0];
            }
            if (adjacent.length > 1) {
              s10ProjectName = adjacent[1];
            }
          }
          break;
        }
      }

      // Deteccion de Fecha del presupuesto en la fila
      if (!s10BudgetDate) {
        for (let i = 0; i < searchLimit; i++) {
          const cellText = (row[i] ?? '').trim().toLowerCase().replace(/:$/, '');
          if (cellText === 'fecha') {
            for (let j = i + 1; j < Math.min(row.length, i + 4); j++) {
              const val = (row[j] ?? '').trim();
              if (val) {
                const parsedDate = this.parseS10Date(val);
                if (parsedDate) {
                  s10BudgetDate = parsedDate;
                  break;
                }
              }
            }
            if (s10BudgetDate) break;
          }
        }
      }

      // Deteccion de Ubicacion y Ubigeo (Lugar) en la fila
      if (!s10Location) {
        for (let i = 0; i < searchLimit; i++) {
          const cellText = (row[i] ?? '').trim().toLowerCase().replace(/:$/, '');
          if (cellText === 'lugar') {
            const adjacentLugar: string[] = [];
            for (let j = i + 1; j < Math.min(row.length, i + 5); j++) {
              const val = (row[j] ?? '').trim();
              if (val) {
                adjacentLugar.push(val);
                if (adjacentLugar.length === 2) break;
              }
            }
            if (adjacentLugar.length >= 2) {
              if (/^\d{6}$/.test(adjacentLugar[0])) {
                s10Ubigeo = adjacentLugar[0];
                s10Location = adjacentLugar[1];
              } else {
                s10Location = adjacentLugar.join(' - ');
              }
            } else if (adjacentLugar.length === 1) {
              if (/^\d{6}$/.test(adjacentLugar[0])) {
                s10Ubigeo = adjacentLugar[0];
              } else {
                s10Location = adjacentLugar[0];
              }
            }
            if (s10Location) break;
          }
        }
      }

      // Deteccion de celda TOTAL (Pie de pagina o columna de reporte repetida)
      if (capturedTotalDirectCost === undefined) {
        for (let i = 0; i < row.length; i++) {
          const cellText = (row[i] ?? '').trim().toUpperCase().replace(/:$/, '');
          if (cellText === 'TOTAL') {
            for (let j = i + 1; j < Math.min(row.length, i + 5); j++) {
              const val = (row[j] ?? '').trim();
              if (!val) continue;
              if (val.toUpperCase() === 'S/.' || val.toUpperCase() === 'S/') continue;
              const num = this.parseQuantity(val);
              if (num > 0) {
                capturedTotalDirectCost = num;
                break;
              }
            }
            if (capturedTotalDirectCost !== undefined) break;
          }
        }
      }

      // 2. Busqueda heuristica del codigo de insumo S10 (10 a 14 digitos iniciando en 01, 02, 03 o 04)
      let codeIdx = -1;
      let s10Code: string | undefined;

      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        // Evitar colisionar con la celda del codigo de obra
        if (obraIndex !== -1 && colIdx > obraIndex && colIdx <= obraIndex + 2) {
          continue;
        }

        const cellVal = (row[colIdx] ?? '').trim();
        if (S10ParserService.S10_CODE_REGEX.test(cellVal)) {
          codeIdx = colIdx;
          s10Code = cellVal;
          break;
        }
      }

      // Si la fila no contiene una celda con firma de codigo S10, omitirla
      if (codeIdx === -1 || !s10Code) {
        continue;
      }

      totalRowsParsed++;

      // Extraer cantidad cruda y resolver importe parcial para acumulacion presupuestal
      const rawQuantity = row[codeIdx + 3];
      const quantity = this.parseQuantity(rawQuantity);
      const partialAmount = this.resolvePartialAmount(
        row,
        codeIdx,
        isIncidenceRow,
        quantity,
      );

      // Acumulacion presupuestal por categoria segun prefijo S10
      if (s10Code.startsWith('01')) {
        laborBudget += partialAmount;
      } else if (s10Code.startsWith('02')) {
        materialsBudget += partialAmount;
      } else if (s10Code.startsWith('03')) {
        equipmentBudget += partialAmount;
      } else if (s10Code.startsWith('04')) {
        subcontractsBudget += partialAmount;
      }

      // 3. Filtrar recursos descartados para almacen (Mano de Obra 01 y Subcontratos 04)
      if (this.isDiscardedResource(s10Code)) {
        discardedRows++;
        continue;
      }

      // 4. Extraccion por adyacencia relativa (+1 descripcion, +2 unidad, +3 cantidad)
      const s10RawName = (row[codeIdx + 1] ?? '').trim();
      const s10Unit = (row[codeIdx + 2] ?? '').trim();

      if (!s10RawName) {
        continue;
      }

      if (quantity <= 0) {
        continue;
      }

      // 5. Calculo resiliente del precio unitario (+4 y +5)
      const rawCellAfter1 = row[codeIdx + 4];
      const rawCellAfter2 = row[codeIdx + 5];
      const unitPrice = this.resolveUnitPrice(
        quantity,
        rawCellAfter1,
        rawCellAfter2,
        isIncidenceRow,
      );

      // Determinar clasificacion sugerida segun el prefijo del codigo S10
      let suggestedType: 'CONSUMABLE' | 'ASSET_TOOL' | undefined;
      if (s10Code.startsWith('02')) {
        suggestedType = 'CONSUMABLE';
      } else if (s10Code.startsWith('03')) {
        suggestedType = 'ASSET_TOOL';
      }

      materialsAndEquipmentRows++;
      resources.push({
        s10Code,
        s10RawName,
        s10Unit: s10Unit || undefined,
        quantity,
        unitPrice,
        suggestedType,
      });
    }

    // 6. Rechazo explicito de archivos de S10 sin insumos validos (ej. Presupuesto de Partidas)
    if (resources.length === 0 && (totalRowsParsed > 0 || nonBlankRowsCount > 0)) {
      throw new BadRequestException(
        'El archivo no contiene materiales (02) ni equipos (03) validos. Asegurese de exportar desde S10 el reporte de "Precios y cantidades de recursos requeridos" y no la hoja de presupuesto de partidas.',
      );
    }

    // Normalizar redondeos a dos decimales
    laborBudget = Number(laborBudget.toFixed(2));
    materialsBudget = Number(materialsBudget.toFixed(2));
    equipmentBudget = Number(equipmentBudget.toFixed(2));
    subcontractsBudget = Number(subcontractsBudget.toFixed(2));

    const calculatedTotal = Number(
      (laborBudget + materialsBudget + equipmentBudget + subcontractsBudget).toFixed(2),
    );

    const totalDirectCost =
      capturedTotalDirectCost !== undefined && capturedTotalDirectCost > 0
        ? capturedTotalDirectCost
        : calculatedTotal;

    const budgetSummary: S10BudgetSummaryDto = {
      totalDirectCost,
      materialsTotal: materialsBudget,
      equipmentTotal: equipmentBudget,
      laborTotal: laborBudget,
      subcontractsTotal: subcontractsBudget,
      location: s10Location,
      ubigeo: s10Ubigeo,
      budgetDate: s10BudgetDate,
    };

    const projectMetadata: S10ProjectMetadata = {
      code: s10ProjectCode,
      name: s10ProjectName,
      location: s10Location,
      ubigeo: s10Ubigeo,
      budgetDate: s10BudgetDate,
    };

    return {
      resources,
      totalRowsParsed,
      materialsAndEquipmentRows,
      discardedRows,
      s10ProjectCode,
      s10ProjectName,
      projectMetadata,
      budgetSummary,
    };
  }
}
