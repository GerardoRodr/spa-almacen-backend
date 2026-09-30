import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AllocateStockDto {
  @ApiProperty({
    example: '22222222-2222-2222-2222-222222222222',
    description: 'Identificador del Almacen Central donde se reservara el stock',
  })
  @IsUUID('4', { message: 'El centralWarehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El centralWarehouseId es obligatorio' })
  centralWarehouseId: string;

  @ApiProperty({
    example: '33333333-3333-3333-3333-333333333333',
    description: 'Identificador del item a reservar en favor del proyecto',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El itemId es obligatorio' })
  itemId: string;

  @ApiProperty({
    example: 300,
    description: 'Cantidad en unidad base a reservar logica y exclusivamente para este proyecto',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad a reservar debe ser un valor numerico' })
  @IsPositive({ message: 'La cantidad a reservar debe ser mayor a cero' })
  quantityToAllocate: number;
}
