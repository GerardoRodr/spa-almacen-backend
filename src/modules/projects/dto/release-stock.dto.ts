import {
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ReleaseStockDto {
  @ApiProperty({
    example: '22222222-2222-2222-2222-222222222222',
    description: 'Identificador del Almacen Central donde se liberara el stock reservado',
  })
  @IsUUID('4', { message: 'El centralWarehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El centralWarehouseId es obligatorio' })
  centralWarehouseId: string;

  @ApiProperty({
    example: '33333333-3333-3333-3333-333333333333',
    description: 'Identificador del item cuya reserva se desea liberar',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El itemId es obligatorio' })
  itemId: string;

  @ApiProperty({
    example: 100,
    description: 'Cantidad en unidad base a descompromoter y devolver al stock disponible',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad a liberar debe ser un valor numerico' })
  @IsPositive({ message: 'La cantidad a liberar debe ser mayor a cero' })
  quantityToRelease: number;
}
