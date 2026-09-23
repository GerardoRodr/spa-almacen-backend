import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum AdjustmentDirection {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export class InventoryAdjustmentItemDto {
  @ApiProperty({
    description: 'Identificador del item a regularizar',
    example: 'a0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El itemId es obligatorio' })
  itemId: string;

  @ApiProperty({
    description: 'Direccion del ajuste fisico: INCREASE (sobrante) o DECREASE (faltante)',
    enum: AdjustmentDirection,
    example: AdjustmentDirection.INCREASE,
  })
  @IsEnum(AdjustmentDirection, {
    message: 'La direccion del ajuste debe ser INCREASE o DECREASE',
  })
  direction: AdjustmentDirection;

  @ApiProperty({
    description: 'Cantidad en unidad base a ajustar',
    example: 10,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un valor numerico' })
  @Min(0.0001, { message: 'La cantidad a ajustar debe ser mayor a cero' })
  quantity: number;

  @ApiPropertyOptional({
    description: 'Costo unitario referencial para ingresos en caso de stock cero previo',
    example: 28.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El costo unitario debe ser un valor numerico' })
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  unitCost?: number;
}
