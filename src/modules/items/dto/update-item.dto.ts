import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType, MeterType } from '@prisma/client';

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
    enum: MeterType,
    example: MeterType.HOUR_METER,
    description:
      'Tipo de medidor para maquinaria (HOUR_METER | KILOMETER). Solo aplica cuando type es MACHINERY.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(MeterType, { message: 'El tipo de medidor (meterType) no es valido' })
  meterType?: MeterType | null;

  @ApiPropertyOptional({
    example: true,
    description: 'Indica si el insumo es perecible y esta sujeto a caducidad',
  })
  @IsOptional()
  @IsBoolean({ message: 'isPerishable debe ser un valor booleano' })
  isPerishable?: boolean;

  @ApiPropertyOptional({
    example: 60,
    description: 'Umbral minimo para alertas de reposicion',
  })
  @IsOptional()
  @IsNumber({}, { message: 'minStockAlert debe ser un numero' })
  @Min(0, { message: 'minStockAlert no puede ser negativo' })
  minStockAlert?: number;

  @ApiPropertyOptional({
    example: 'd9b2d63d-a233-4f9e-8c33-875f56b060d1',
    description: 'Identificador UUID de la clasificacion personalizada asignada, o null para desvincular',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID('4', { message: 'El categoryId debe ser un UUID valido o null' })
  categoryId?: string | null;
}
