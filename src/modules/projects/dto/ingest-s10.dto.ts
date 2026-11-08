import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class S10ResourceItemDto {
  @ApiPropertyOptional({
    example: '0204010001',
    description: 'Codigo del insumo en el presupuesto S10',
  })
  @IsOptional()
  @IsString({ message: 'El codigo S10 debe ser una cadena de texto' })
  s10Code?: string;

  @ApiProperty({
    example: 'CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)',
    description: 'Descripcion literal del recurso en la exportacion S10',
  })
  @IsString({ message: 'La descripcion cruda debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La descripcion cruda no puede estar vacia' })
  s10RawName: string;

  @ApiPropertyOptional({
    example: 'BOL',
    description: 'Unidad de medida en el presupuesto S10',
  })
  @IsOptional()
  @IsString({ message: 'La unidad S10 debe ser una cadena de texto' })
  s10Unit?: string;

  @ApiProperty({
    example: 2500,
    description: 'Cantidad o metrado presupuestado en la partida',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un valor numerico' })
  @IsPositive({ message: 'La cantidad presupuestada debe ser mayor a cero' })
  quantity: number;

  @ApiPropertyOptional({
    example: 24.5,
    description: 'Precio unitario presupuestado en el expediente S10',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El precio unitario debe ser un valor numerico' })
  @Min(0, { message: 'El precio unitario no puede ser negativo' })
  unitPrice?: number;

  @ApiPropertyOptional({
    example: 24.5,
    description: 'Alias opcional para el precio unitario del expediente S10',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El precio unitario S10 debe ser un valor numerico' })
  @Min(0, { message: 'El precio unitario S10 no puede ser negativo' })
  s10UnitPrice?: number;

  @ApiPropertyOptional({
    enum: ['CONSUMABLE', 'ASSET_TOOL'],
    example: 'CONSUMABLE',
    description:
      'Tipo de insumo sugerido para catalogo maestro segun prefijo S10 (02 -> CONSUMABLE, 03 -> ASSET_TOOL)',
  })
  @IsOptional()
  @IsEnum(['CONSUMABLE', 'ASSET_TOOL'], {
    message: 'El tipo sugerido debe ser CONSUMABLE o ASSET_TOOL',
  })
  suggestedType?: 'CONSUMABLE' | 'ASSET_TOOL';
}

export class IngestS10Dto {
  @ApiPropertyOptional({
    enum: ['REPLACE', 'ACCUMULATE'],
    default: 'REPLACE',
    description:
      'Estrategia de actualizacion en base de datos: REPLACE (idempotente) o ACCUMULATE (suma a requerimientos existentes)',
  })
  @IsOptional()
  @IsEnum(['REPLACE', 'ACCUMULATE'], {
    message: 'El modo de ingesta debe ser REPLACE o ACCUMULATE',
  })
  mode?: 'REPLACE' | 'ACCUMULATE';

  @ApiPropertyOptional({
    example: 'S10-OBRA-2026-01',
    description: 'Codigo de presupuesto S10 del proyecto',
  })
  @IsOptional()
  @IsString({ message: 'El codigo de presupuesto debe ser una cadena de texto' })
  budgetCode?: string;

  @ApiPropertyOptional({
    example: 'LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA',
    description: 'Ubicacion geografica del proyecto segun expediente S10',
  })
  @IsOptional()
  @IsString({ message: 'La ubicacion debe ser una cadena de texto' })
  s10Location?: string;

  @ApiPropertyOptional({
    example: '131006',
    description: 'Codigo Ubigeo segun expediente S10',
  })
  @IsOptional()
  @IsString({ message: 'El ubigeo debe ser una cadena de texto' })
  s10Ubigeo?: string;

  @ApiPropertyOptional({
    example: '2025-11-01T00:00:00.000Z',
    description: 'Fecha original del presupuesto S10',
  })
  @IsOptional()
  s10BudgetDate?: string | Date;

  @ApiPropertyOptional({
    example: 3479983.23,
    description: 'Costo Directo Total presupuestado S10 en PEN',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El presupuesto total S10 debe ser un numero' })
  s10TotalBudget?: number;

  @ApiPropertyOptional({
    example: 1135524.35,
    description: 'Subtotal Grupo 02 (Materiales) S10 en PEN',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El subtotal de materiales debe ser un numero' })
  s10MaterialsBudget?: number;

  @ApiPropertyOptional({
    example: 153599.14,
    description: 'Subtotal Grupo 03 (Equipos y Herramientas) S10 en PEN',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El subtotal de equipos debe ser un numero' })
  s10EquipmentBudget?: number;

  @ApiPropertyOptional({
    example: 1587459.81,
    description: 'Subtotal Grupo 01 (Mano de Obra) S10 en PEN',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El subtotal de mano de obra debe ser un numero' })
  s10LaborBudget?: number;

  @ApiPropertyOptional({
    example: 603399.93,
    description: 'Subtotal Grupo 04 (Subcontratos) S10 en PEN',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El subtotal de subcontratos debe ser un numero' })
  s10SubcontractsBudget?: number;

  @ApiProperty({
    type: [S10ResourceItemDto],
    description: 'Lista de recursos y materiales extraidos del presupuesto S10',
  })
  @IsArray({ message: 'Los recursos deben enviarse como una lista' })
  @ValidateNested({ each: true })
  @Type(() => S10ResourceItemDto)
  resources: S10ResourceItemDto[];
}
