import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';

export class CreateItemDto {
  @ApiProperty({
    example: 'CEM-PORT-T1',
    description: 'Codigo SKU unico del insumo o herramienta',
  })
  @IsString({ message: 'El SKU debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El SKU no puede estar vacio' })
  sku: string;

  @ApiProperty({
    example: 'Cemento Portland Tipo I (Bolsa 42.5 kg)',
    description: 'Nombre oficial del insumo',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  name: string;

  @ApiPropertyOptional({
    example: 'Cemento para obras generales y estructuras de concreto armado',
    description: 'Descripcion o especificaciones tecnicas del item',
  })
  @IsOptional()
  @IsString({ message: 'La descripcion debe ser una cadena de texto' })
  description?: string;

  @ApiProperty({
    example: 'BOLSA',
    description: 'Unidad de medida base (ej. UND, KG, M3, BOLSA, GLN, VARILLA)',
  })
  @IsString({ message: 'La unidad base debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La unidad base no puede estar vacia' })
  baseUnit: string;

  @ApiProperty({
    enum: ItemType,
    example: ItemType.CONSUMABLE,
    description: 'Clasificacion: CONSUMABLE (gasto en obra) o ASSET_TOOL (equipo/herramienta)',
  })
  @IsEnum(ItemType, { message: 'El tipo de item no es valido' })
  type: ItemType;

  @ApiPropertyOptional({
    example: 50,
    default: 0,
    description: 'Cantidad minima en almacen para disparar alertas de reposicion',
  })
  @IsOptional()
  @IsNumber({}, { message: 'minStockAlert debe ser un numero' })
  @Min(0, { message: 'minStockAlert no puede ser negativo' })
  minStockAlert?: number;
}
