import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, DiscountType } from '@prisma/client';

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
    enum: DiscountType,
    default: DiscountType.NONE,
    description: 'Tipo de descuento aplicado a la linea',
  })
  @IsOptional()
  @IsEnum(DiscountType, { message: 'El tipo de descuento debe ser NONE, PERCENTAGE o FIXED' })
  discountType?: DiscountType;

  @ApiPropertyOptional({
    example: 0,
    description: 'Valor del descuento aplicado a la linea',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El valor de descuento debe ser un numero' })
  @Min(0, { message: 'El valor de descuento no puede ser negativo' })
  discountValue?: number;

  @ApiPropertyOptional({
    example: 'LOT-2026-A1',
    description: 'Numero de lote del insumo',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString({ message: 'El numero de lote debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'El numero de lote no puede exceder 100 caracteres',
  })
  lotNumber?: string;

  @ApiPropertyOptional({
    example: '2027-06-30T00:00:00.000Z',
    description: 'Fecha de caducidad del insumo',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsDateString({}, { message: 'La fecha de caducidad debe ser una fecha valida ISO' })
  expirationDate?: string;

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
    description: 'Serie y numero de factura comercial definitiva (opcional o null para limpiar)',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString({ message: 'La serie de factura debe ser una cadena de texto' })
  @MaxLength(100, {
    message: 'La serie de factura no puede exceder 100 caracteres',
  })
  invoiceSeries?: string | null;

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
