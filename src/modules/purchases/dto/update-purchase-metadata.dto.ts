import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class PurchaseDetailNoteInputDto {
  @ApiProperty({
    example: 'd0000000-0000-4000-8000-000000000001',
    description: 'Identificador UUID del renglon de compra (PurchaseDetail)',
  })
  @IsUUID('4', { message: 'El detailId debe ser un UUID valido' })
  detailId: string;

  @ApiPropertyOptional({
    example: 'Lote 2026-10 / Vence 30/12/2026',
    description: 'Nota del renglon',
  })
  @IsOptional()
  @IsString({ message: 'Las notas del renglon deben ser una cadena de texto' })
  @MaxLength(1000, {
    message: 'Las notas del renglon no pueden exceder 1000 caracteres',
  })
  notes?: string;

  @ApiPropertyOptional({
    example: 'LOT-2026-10',
    description: 'Numero de lote actualizado',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString({ message: 'El numero de lote debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'El numero de lote no puede exceder 100 caracteres',
  })
  lotNumber?: string | null;

  @ApiPropertyOptional({
    example: '2026-12-30T00:00:00.000Z',
    description: 'Fecha de caducidad actualizada (ISO 8601 o null)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? null : value,
  )
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsDateString({}, { message: 'La fecha de caducidad debe ser una fecha ISO valida' })
  expirationDate?: string | null;
}

export class UpdatePurchaseMetadataDto {
  @ApiPropertyOptional({
    example: 'sup-uuid-aceros-arequipa',
    description: 'Nuevo identificador UUID del proveedor',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El supplierId debe ser un UUID valido' })
  supplierId?: string;

  @ApiPropertyOptional({
    example: 'F001-0004524',
    description: 'Serie y numero de comprobante corregido',
  })
  @IsOptional()
  @IsString({ message: 'La serie de factura debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La serie de factura no puede estar vacia' })
  @MaxLength(100, {
    message: 'La serie de factura no puede exceder 100 caracteres',
  })
  invoiceSeries?: string;

  @ApiPropertyOptional({
    example: 'FACTURA',
    description: 'Tipo de comprobante (FACTURA, BOLETA, GUIA, RECIBO)',
  })
  @IsOptional()
  @IsString({ message: 'El tipo de comprobante debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El tipo de comprobante no puede estar vacio' })
  @MaxLength(50, {
    message: 'El tipo de comprobante no puede exceder 50 caracteres',
  })
  voucherType?: string;

  @ApiPropertyOptional({
    example: '2026-09-22T10:00:00.000Z',
    description: 'Fecha de emision corregida (ISO 8601)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'La fecha de emision debe ser una fecha ISO valida' })
  issueDate?: string;

  @ApiPropertyOptional({
    example: 'Factura regularizada con entrega parcial en caseta',
    description: 'Observaciones generales de la compra',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  @MaxLength(1000, {
    message: 'Las observaciones no pueden exceder 1000 caracteres',
  })
  notes?: string;

  @ApiPropertyOptional({
    type: [PurchaseDetailNoteInputDto],
    description: 'Actualizacion de notas o lotes por renglon sin modificar cantidades ni costos',
  })
  @IsOptional()
  @IsArray({ message: 'itemNotes debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseDetailNoteInputDto)
  itemNotes?: PurchaseDetailNoteInputDto[];
}
