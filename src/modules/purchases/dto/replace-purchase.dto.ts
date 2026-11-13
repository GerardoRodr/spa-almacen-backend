import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { CreatePurchaseDto } from './create-purchase.dto.js';

export class ReplacePurchaseDto extends CreatePurchaseDto {
  @ApiProperty({
    example: 'Correccion de cantidades y precio unitario segun factura fisica',
    description: 'Motivo obligatorio de la anulacion y reemplazo de la compra original',
  })
  @IsString({ message: 'El motivo de reemplazo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de reemplazo es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de reemplazo debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de reemplazo no puede exceder 500 caracteres',
  })
  reversalReason: string;
}
