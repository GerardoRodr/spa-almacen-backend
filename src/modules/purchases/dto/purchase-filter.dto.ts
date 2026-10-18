import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
  @IsString({ message: 'La serie de factura debe ser una cadena' })
  invoiceSeries?: string;

  @ApiPropertyOptional({
    example: 'item-uuid-cemento',
    description: 'Filtrar compras que incluyan un insumo o producto especifico por ID',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId?: string;

  @ApiPropertyOptional({
    example: 'cemento',
    description: 'Filtrar compras por nombre o SKU del insumo adquirido',
  })
  @IsOptional()
  @IsString({ message: 'El termino de busqueda de producto debe ser una cadena' })
  itemSearch?: string;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Fecha minima de emision',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de inicio debe ser una fecha ISO valida' })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59.999Z',
    description: 'Fecha maxima de emision',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de fin debe ser una fecha ISO valida' })
  endDate?: string;
}
