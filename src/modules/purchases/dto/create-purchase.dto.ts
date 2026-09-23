import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { PurchaseItemDto } from './purchase-item.dto.js';

export class CreatePurchaseDto {
  @ApiProperty({
    example: 'sup-uuid-aceros-arequipa',
    description: 'Identificador UUID del proveedor emisor del comprobante',
  })
  @IsUUID('4', { message: 'El supplierId debe ser un UUID valido' })
  supplierId: string;

  @ApiProperty({
    example: '22222222-2222-2222-2222-222222222222',
    description: 'Identificador UUID del Almacen Central receptor de los materiales',
  })
  @IsUUID('4', { message: 'El centralWarehouseId debe ser un UUID valido' })
  centralWarehouseId: string;

  @ApiProperty({
    example: 'F001-0004523',
    description: 'Serie y numero de comprobante de pago autorizado por SUNAT',
  })
  @IsString({ message: 'La serie de factura debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La serie de factura no puede estar vacia' })
  invoiceSeries: string;

  @ApiPropertyOptional({
    enum: Currency,
    default: Currency.PEN,
    description: 'Moneda de la transaccion: PEN (Soles) o USD (Dolares)',
  })
  @IsOptional()
  @IsEnum(Currency, { message: 'La moneda debe ser PEN o USD' })
  currency?: Currency = Currency.PEN;

  @ApiPropertyOptional({
    example: 1.0,
    default: 1.0,
    description: 'Tipo de cambio oficial a Soles (obligatorio > 0 si la moneda es USD)',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El tipo de cambio debe ser un numero' })
  @Min(0.0001, { message: 'El tipo de cambio debe ser estrictamente positivo' })
  exchangeRate?: number = 1.0;

  @ApiProperty({
    example: '2026-09-22T10:00:00.000Z',
    description: 'Fecha de emision del comprobante de pago',
  })
  @IsDateString({}, { message: 'La fecha de emision debe ser una fecha valida ISO' })
  issueDate: string;

  @ApiProperty({
    example: 28500.0,
    description: 'Subtotal en Soles (Base imponible neta sin IGV)',
  })
  @IsNumber({}, { message: 'El subtotal en PEN debe ser un numero' })
  @Min(0, { message: 'El subtotal en PEN no puede ser negativo' })
  subtotalPEN: number;

  @ApiPropertyOptional({
    example: 5130.0,
    default: 0,
    description: 'Monto del IGV (18%) en Soles para cotejo tributario',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El monto de IGV debe ser un numero' })
  @Min(0, { message: 'El monto de IGV no puede ser negativo' })
  igvAmountPEN?: number = 0;

  @ApiProperty({
    example: 33630.0,
    description: 'Monto total de la factura con IGV en Soles',
  })
  @IsNumber({}, { message: 'El monto total en PEN debe ser un numero' })
  @Min(0, { message: 'El monto total en PEN no puede ser negativo' })
  totalAmountPEN: number;

  @ApiProperty({
    type: [PurchaseItemDto],
    description: 'Listado de renglones o items incluidos en la compra',
  })
  @IsArray({ message: 'Los items deben ser un arreglo' })
  @ArrayMinSize(1, { message: 'La compra debe contener al menos un item' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}
