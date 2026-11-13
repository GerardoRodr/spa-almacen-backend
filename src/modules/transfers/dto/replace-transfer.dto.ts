import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { DispatchTransferDto } from './dispatch-transfer.dto.js';

export class ReplaceTransferDto extends DispatchTransferDto {
  @ApiProperty({
    example: 'Correccion de cantidades y almacenes en guia de despacho',
    description: 'Motivo obligatorio de cancelacion de la guia original y emision de reemplazo',
  })
  @IsString({ message: 'El motivo de reemplazo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de reemplazo es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de reemplazo debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de reemplazo no puede exceder 500 caracteres',
  })
  cancellationReason: string;
}
