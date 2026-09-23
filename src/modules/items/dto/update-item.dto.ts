import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';

export class UpdateItemDto {
  @ApiPropertyOptional({
    example: 'Cemento Portland Tipo I Especial',
    description: 'Nombre oficial del insumo',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  name?: string;

  @ApiPropertyOptional({
    description: 'Descripcion o especificaciones tecnicas',
  })
  @IsOptional()
  @IsString({ message: 'La descripcion debe ser una cadena de texto' })
  description?: string;

  @ApiPropertyOptional({
    example: 'BOLSA',
    description: 'Unidad de medida base',
  })
  @IsOptional()
  @IsString({ message: 'La unidad base debe ser una cadena de texto' })
  baseUnit?: string;

  @ApiPropertyOptional({
    enum: ItemType,
    description: 'Tipo de insumo',
  })
  @IsOptional()
  @IsEnum(ItemType, { message: 'El tipo de item no es valido' })
  type?: ItemType;

  @ApiPropertyOptional({
    example: 60,
    description: 'Umbral minimo para alertas de reposicion',
  })
  @IsOptional()
  @IsNumber({}, { message: 'minStockAlert debe ser un numero' })
  @Min(0, { message: 'minStockAlert no puede ser negativo' })
  minStockAlert?: number;
}
