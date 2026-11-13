import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { CreateConsumptionExitDto } from './create-consumption-exit.dto.js';

export class ReplaceConsumptionExitDto extends CreateConsumptionExitDto {
  @ApiProperty({
    example: 'Correccion de proyecto civil e insumos consumidos',
    description: 'Motivo obligatorio de reversion de la salida original',
  })
  @IsString({ message: 'El motivo de reversion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de reversion es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de reversion debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de reversion no puede exceder 500 caracteres',
  })
  reversalReason: string;
}
