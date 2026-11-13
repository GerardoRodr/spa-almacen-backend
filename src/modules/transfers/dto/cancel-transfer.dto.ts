import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CancelTransferDto {
  @ApiProperty({
    example: 'Error en guia de despacho: camion no salio de almacen central',
    description: 'Motivo obligatorio de la cancelacion de la transferencia',
  })
  @IsString({ message: 'El motivo de cancelacion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de cancelacion es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de cancelacion debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de cancelacion no puede exceder 500 caracteres',
  })
  cancellationReason: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Si es true y la transferencia estaba vinculada a un proyecto, restaura la reserva logica (allocatedQty y reservedQty)',
  })
  @IsOptional()
  @IsBoolean({ message: 'restoreProjectAllocation debe ser booleano' })
  restoreProjectAllocation?: boolean = true;
}
