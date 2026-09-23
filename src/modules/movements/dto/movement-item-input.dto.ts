import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MovementItemInputDto {
  @ApiProperty({
    description: 'Identificador unico del item en el catalogo maestro',
    example: 'a0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El itemId es obligatorio' })
  itemId: string;

  @ApiProperty({
    description: 'Cantidad en unidad base a mover o descontar',
    example: 40,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un valor numerico' })
  @Min(0.0001, { message: 'La cantidad debe ser mayor a cero' })
  quantity: number;
}
