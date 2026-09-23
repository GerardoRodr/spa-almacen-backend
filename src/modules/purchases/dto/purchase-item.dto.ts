import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
