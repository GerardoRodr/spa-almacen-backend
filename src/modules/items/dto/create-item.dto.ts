import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType, MeterType } from '@prisma/client';

export class InitialStockOnCreateDto {
  @ApiProperty({
    example: 'b0000000-0000-4000-8000-000000000001',
    description: 'Identificador UUID del almacen donde ingresa el stock fisico inicial',
  })
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  warehouseId: string;

  @ApiProperty({
    example: 10,
    description: 'Cantidad fisica inicial a registrar en inventario',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad inicial debe ser numerica' })
  @Min(0.0001, { message: 'La cantidad inicial debe ser mayor a cero' })
  quantity: number;

  @ApiPropertyOptional({
    example: 28.5,
    description: 'Costo unitario en Soles (solo computable para ADMIN, almaceneros forzaran 0)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El costo unitario debe ser numerico' })
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  unitCost?: number;

  @ApiPropertyOptional({
    example: 'Conteo fisico inicial en caseta de obra',
    description: 'Observacion del ajuste inicial',
  })
  @IsOptional()
  @IsString({ message: 'La observacion debe ser texto' })
  @MaxLength(500, { message: 'La observacion no puede superar 500 caracteres' })
  observation?: string;
}

export class CreateItemDto {
  @ApiPropertyOptional({
    example: 'CEM-PORT-T1',
    description: 'Codigo SKU unico del insumo. Si se omite, se autogenera segun el tipo',
  })
  @IsOptional()
  @IsString({ message: 'El SKU debe ser una cadena de texto' })
  @MaxLength(50, { message: 'El SKU no puede superar 50 caracteres' })
  sku?: string;

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

  @ApiPropertyOptional({
    type: () => InitialStockOnCreateDto,
    description: 'Registro opcional de stock fisico inicial en un solo paso',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialStockOnCreateDto)
  initialStock?: InitialStockOnCreateDto;
}
