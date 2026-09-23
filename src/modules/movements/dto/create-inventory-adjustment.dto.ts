import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryAdjustmentItemDto } from './inventory-adjustment-item.dto.js';

export class CreateInventoryAdjustmentDto {
  @ApiProperty({
    description: 'Identificador del almacen donde se aplica la regularizacion de inventario',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El warehouseId es obligatorio' })
  warehouseId: string;

  @ApiProperty({
    description: 'Justificacion formal, acta de inventario ciclico o resolucion',
    example: 'Ajuste por inventario fisico general de fin de mes segun Acta INF-2026-004',
  })
  @IsString({ message: 'La observacion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La justificacion del ajuste es obligatoria' })
  @MaxLength(500, {
    message: 'La justificacion no puede exceder 500 caracteres',
  })
  observation: string;

  @ApiProperty({
    description: 'Lista de items y direcciones de ajuste a procesar',
    type: [InventoryAdjustmentItemDto],
  })
  @IsArray({ message: 'Los items deben enviarse como un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item para ajustar' })
  @ValidateNested({ each: true })
  @Type(() => InventoryAdjustmentItemDto)
  items: InventoryAdjustmentItemDto[];
}
