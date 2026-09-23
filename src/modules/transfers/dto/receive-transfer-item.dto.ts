import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveTransferItemDto {
  @ApiProperty({
    description: 'Identificador unico del renglon de transferencia (TransferItem.id)',
    example: 'd0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El transferItemId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El transferItemId es obligatorio' })
  transferItemId: string;

  @ApiProperty({
    description: 'Cantidad fisica conforme verificada en la recepcion en obra',
    example: 95,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad recibida debe ser un valor numerico' })
  @Min(0, { message: 'La cantidad recibida no puede ser negativa' })
  receivedQty: number;
}
