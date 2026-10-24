import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType, MeterType } from '@prisma/client';

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
    description:
      'Clasificacion: CONSUMABLE (consumo en obra), TOOL (herramienta menor), EQUIPMENT (equipo), MACHINERY (maquinaria)',
  })
  @IsEnum(ItemType, { message: 'El tipo de item no es valido' })
  type: ItemType;

  @ApiPropertyOptional({
    enum: MeterType,
    example: MeterType.HOUR_METER,
    description:
      'Tipo de medidor para maquinaria (HOUR_METER: horometro en horas, KILOMETER: odometro en kilometros). Solo aplica cuando type es MACHINERY.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsEnum(MeterType, { message: 'El tipo de medidor (meterType) no es valido' })
  meterType?: MeterType | null;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Indica si el insumo es perecible y esta sujeto a caducidad',
  })
  @IsOptional()
  @IsBoolean({ message: 'isPerishable debe ser un valor booleano' })
  isPerishable?: boolean = false;

  @ApiPropertyOptional({
    example: 50,
    default: 0,
    description: 'Cantidad minima en almacen para disparar alertas de reposicion',
  })
  @IsOptional()
  @IsNumber({}, { message: 'minStockAlert debe ser un numero' })
  @Min(0, { message: 'minStockAlert no puede ser negativo' })
  minStockAlert?: number;

  @ApiPropertyOptional({
    example: 'd9b2d63d-a233-4f9e-8c33-875f56b060d1',
    description: 'Identificador UUID de la clasificacion personalizada asignada',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El categoryId debe ser un UUID valido' })
  categoryId?: string | null;
}
