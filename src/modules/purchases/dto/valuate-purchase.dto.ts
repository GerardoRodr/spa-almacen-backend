import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';

export class ValuatePurchaseItemDto {
  @ApiProperty({
    example: 'd290f1ee-6c54-4b01-90e6-d701748f0851',
    description: 'Identificador UUID del detalle de compra (PurchaseDetail) a valorizar',
  })
  @IsUUID('4', { message: 'El detailId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El detailId no puede estar vacio' })
  detailId: string;

  @ApiProperty({
    example: 28.5,
    description: 'Precio unitario neto en la moneda original de compra (sin IGV) mayor a cero',
  })
  @IsNumber({}, { message: 'El precio unitario original debe ser un numero' })
  @Min(0.0001, { message: 'El precio unitario original debe ser mayor a cero' })
  unitPriceOriginal: number;

  @ApiPropertyOptional({
    example: 'Ajustado segun factura comercial definitiva',
    description: 'Observaciones de linea actualizadas (opcional)',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  @MaxLength(1000, {
    message: 'Las observaciones de linea no pueden exceder 1000 caracteres',
  })
  notes?: string;
}

export class ValuatePurchaseDto {
  @ApiPropertyOptional({
    example: 'F001-0004523',
    description: 'Serie y numero de factura comercial definitiva',
  })
  @IsOptional()
  @IsString({ message: 'La serie de factura debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La serie de factura no puede estar vacia' })
  invoiceSeries?: string;

  @ApiPropertyOptional({
    example: 'FACTURA',
    default: 'FACTURA',
    description: 'Tipo de comprobante de pago emitido (ej. FACTURA, BOLETA)',
  })
  @IsOptional()
  @IsString({ message: 'El tipo de comprobante debe ser una cadena de texto' })
  voucherType?: string;

  @ApiPropertyOptional({
    enum: Currency,
    default: Currency.PEN,
    description: 'Moneda de la transaccion: PEN (Soles) o USD (Dolares)',
  })
  @IsOptional()
  @IsEnum(Currency, { message: 'La moneda debe ser PEN o USD' })
  currency?: Currency;

  @ApiPropertyOptional({
    example: 1.0,
    default: 1.0,
    description: 'Tipo de cambio oficial a Soles',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El tipo de cambio debe ser un numero' })
  @Min(0.0001, { message: 'El tipo de cambio debe ser estrictamente positivo' })
  exchangeRate?: number;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Indica si la compra incluye IGV (18%) o si es exonerada/sin IGV (0%)',
  })
  @IsOptional()
  @IsBoolean({ message: 'hasIgv debe ser un valor booleano' })
  hasIgv?: boolean;

  @ApiProperty({
    example: 2850.0,
    description: 'Subtotal en Soles (Base imponible neta sin IGV)',
  })
  @IsNumber({}, { message: 'El subtotal en PEN debe ser un numero' })
  @Min(0.01, { message: 'El subtotal en PEN debe ser mayor a cero' })
  subtotalPEN: number;

  @ApiPropertyOptional({
    example: 513.0,
    default: 0,
    description: 'Monto del IGV (18%) en Soles para cotejo tributario',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El monto de IGV debe ser un numero' })
  @Min(0, { message: 'El monto de IGV no puede ser negativo' })
  igvAmountPEN?: number;

  @ApiProperty({
    example: 3363.0,
    description: 'Monto total facturado en Soles con IGV incluido',
  })
  @IsNumber({}, { message: 'El monto total en PEN debe ser un numero' })
  @Min(0.01, { message: 'El monto total en PEN debe ser mayor a cero' })
  totalAmountPEN: number;

  @ApiPropertyOptional({
    example: 'Valorizacion formal con factura fisica recibida',
    description: 'Observaciones generales del comprobante',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  @MaxLength(1000, {
    message: 'Las observaciones generales no pueden exceder 1000 caracteres',
  })
  notes?: string;

  @ApiProperty({
    type: [ValuatePurchaseItemDto],
    description: 'Listado de insumos a valorizar con precio unitario original mayor a cero',
  })
  @IsArray({ message: 'Los items deben ser proporcionados en un arreglo' })
  @ArrayMinSize(1, { message: 'Debe valorizar al menos un item de la compra' })
  @ValidateNested({ each: true })
  @Type(() => ValuatePurchaseItemDto)
  items: ValuatePurchaseItemDto[];
}
