import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RevertPurchaseDto {
  @ApiProperty({
    example: 'Factura registrada por duplicado o error en cantidades ingresadas',
    description: 'Motivo obligatorio de la anulacion de la compra',
  })
  @IsString({ message: 'El motivo de anulacion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de anulacion es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de anulacion debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de anulacion no puede exceder 500 caracteres',
  })
  reversalReason: string;
}
