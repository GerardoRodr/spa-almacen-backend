import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AdjustmentDirection } from './inventory-adjustment-item.dto.js';

export class RevertAdjustmentItemDirectionDto {
  @ApiProperty({ example: 'item-uuid-cemento' })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId: string;

  @ApiProperty({ enum: AdjustmentDirection })
  @IsEnum(AdjustmentDirection, {
    message: 'direction debe ser INCREASE o DECREASE',
  })
  direction: AdjustmentDirection;
}

export class RevertMovementDto {
  @ApiProperty({
    example: 'Error al seleccionar proyecto o cantidad entregada a cuadrilla',
    description: 'Motivo obligatorio para revertir el movimiento en Kardex',
  })
  @IsString({ message: 'El motivo de reversion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de reversion es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de reversion debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de reversion no puede exceder 500 caracteres',
  })
  reason: string;

  @ApiPropertyOptional({
    type: [RevertAdjustmentItemDirectionDto],
    description:
      'Para INVENTORY_ADJUSTMENT mixto, direccion original por item (INCREASE o DECREASE)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RevertAdjustmentItemDirectionDto)
  adjustmentDirections?: RevertAdjustmentItemDirectionDto[];
}
