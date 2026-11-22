import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';

export class PurchaseItemDto {
  @ApiProperty({
    example: 'item-uuid-cemento',
    description: 'Identificador UUID del SKU maestro que ingresa',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId: string;

  @ApiProperty({
    example: 'BOLSA',
    description: 'Unidad de medida de compra (ej. BOLSA, PALLET, MILLAR, KG)',
  })
  @IsString({ message: 'La unidad de compra debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La unidad de compra no puede estar vacia' })
  purchaseUnit: string;

  @ApiPropertyOptional({
    example: 1.0,
    default: 1.0,
    description: 'Factor multiplicador para convertir purchaseQty a la baseUnit del item',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El factor de conversion debe ser un numero' })
  @Min(0.0001, { message: 'El factor de conversion debe ser estrictamente positivo' })
  conversionFactor?: number = 1.0;

  @ApiProperty({
    example: 1000,
    description: 'Cantidad comprada en la unidad de compra indicada',
  })
  @IsNumber({}, { message: 'La cantidad comprada debe ser un numero' })
  @Min(0.0001, { message: 'La cantidad comprada debe ser mayor a cero' })
  purchaseQty: number;

  @ApiProperty({
    example: 28.5,
    description: 'Precio unitario neto en la moneda original de compra (sin IGV)',
  })
  @IsNumber({}, { message: 'El precio unitario original debe ser un numero' })
  @Min(0, { message: 'El precio unitario original no puede ser negativo' })
  unitPriceOriginal: number;

  @ApiPropertyOptional({
    enum: DiscountType,
    default: DiscountType.NONE,
    description: 'Tipo de descuento comercial aplicado a la linea (NONE, PERCENTAGE o FIXED)',
  })
  @IsOptional()
  @IsEnum(DiscountType, { message: 'El tipo de descuento debe ser NONE, PERCENTAGE o FIXED' })
  discountType?: DiscountType = DiscountType.NONE;

  @ApiPropertyOptional({
    example: 10,
    default: 0,
    description: 'Valor del descuento: porcentaje (0-100) o monto fijo en moneda original',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El valor de descuento debe ser un numero' })
  @Min(0, { message: 'El valor de descuento no puede ser negativo' })
  discountValue?: number = 0;

  @ApiPropertyOptional({
    example: 'LOT-2026-A1',
    description: 'Numero de lote del insumo adquirido (cuando aplica trazabilidad de lote)',
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
    description: 'Fecha de caducidad del insumo (cuando aplica trazabilidad de vencimiento)',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsDateString({}, { message: 'La fecha de caducidad debe ser una fecha valida ISO' })
  expirationDate?: string;

  @ApiPropertyOptional({
    example: 'Lote CEM-2026-X vence: 20/12/2026',
    description: 'Observaciones especificas por linea (ej. lote o caducidad de perecible)',
  })
  @IsOptional()
  @IsString({ message: 'Las observaciones deben ser una cadena de texto' })
  @MaxLength(1000, {
    message: 'Las observaciones de linea no pueden exceder 1000 caracteres',
  })
  notes?: string;
}
