import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type PurchaseVoidFilter = 'ACTIVE_ONLY' | 'ALL' | 'VOIDED_ONLY';

export class PurchaseFilterDto {
  @ApiPropertyOptional({
    default: 1,
    description: 'Numero de pagina para paginacion',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un entero' })
  @Min(1, { message: 'La pagina minima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    description: 'Cantidad de registros por pagina',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El limite debe ser un entero' })
  @Min(1, { message: 'El limite minimo es 1' })
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'sup-uuid-aceros-arequipa',
    description: 'Filtrar por identificador de proveedor',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && (value.trim() === '' || value === 'ALL')
      ? undefined
      : value,
  )
  @IsUUID('4', { message: 'El supplierId debe ser un UUID valido' })
  supplierId?: string;

  @ApiPropertyOptional({
    example: 'b0000000-0000-4000-8000-000000000001',
    description: 'Filtrar por almacen o caseta de obra de destino (o "ALL")',
  })
  @IsOptional()
  @IsString({ message: 'El warehouseId debe ser una cadena' })
  warehouseId?: string;

  @ApiPropertyOptional({
    example: 'F001',
    description: 'Filtrar por serie o numero de comprobante',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString({ message: 'La serie de factura debe ser una cadena' })
  invoiceSeries?: string;

  @ApiPropertyOptional({
    example: 'item-uuid-cemento',
    description: 'Filtrar compras que incluyan un insumo o producto especifico por ID',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && (value.trim() === '' || value === 'ALL')
      ? undefined
      : value,
  )
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId?: string;

  @ApiPropertyOptional({
    example: 'cemento',
    description: 'Filtrar compras por nombre o SKU del insumo adquirido',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString({ message: 'El termino de busqueda de producto debe ser una cadena' })
  itemSearch?: string;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Fecha minima de emision',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha ISO valida' })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59.999Z',
    description: 'Fecha maxima de emision',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha ISO valida' })
  endDate?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Si es false, excluye comprobantes de compra anulados (isReverted = true)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false' || value === false || value === '0' || value === 0) {
      return false;
    }
    if (value === 'true' || value === true || value === '1' || value === 1) {
      return true;
    }
    return undefined;
  })
  @IsBoolean({ message: 'includeReverted debe ser un valor booleano' })
  includeReverted?: boolean = true;

  @ApiPropertyOptional({
    enum: ['ACTIVE_ONLY', 'ALL', 'VOIDED_ONLY'],
    description: 'Filtro explicito de anulacion: ACTIVE_ONLY, ALL o VOIDED_ONLY',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsIn(['ACTIVE_ONLY', 'ALL', 'VOIDED_ONLY'], {
    message: 'voidFilter debe ser ACTIVE_ONLY, ALL o VOIDED_ONLY',
  })
  voidFilter?: PurchaseVoidFilter;

  @ApiPropertyOptional({
    example: false,
    description: 'Si es true, filtra unicamente compras editadas/modificadas (isEdited = true)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'false' || value === false || value === '0' || value === 0) {
      return false;
    }
    if (value === 'true' || value === true || value === '1' || value === 1) {
      return true;
    }
    return undefined;
  })
  @IsBoolean({ message: 'onlyEdited debe ser un valor booleano' })
  onlyEdited?: boolean;

  @ApiPropertyOptional({
    example: 450.5,
    description:
      'Monto aproximado en PEN (totalAmountPEN) para ordenar comprobantes por cercania al importe',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  })
  @IsNumber({}, { message: 'El monto aproximado debe ser un numero valido' })
  @Min(0, { message: 'El monto aproximado no puede ser negativo' })
  approximateAmount?: number;
}
