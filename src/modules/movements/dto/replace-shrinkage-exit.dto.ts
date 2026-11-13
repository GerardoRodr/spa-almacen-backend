import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { CreateShrinkageExitDto } from './create-shrinkage-exit.dto.js';

export class ReplaceShrinkageExitDto extends CreateShrinkageExitDto {
  @ApiProperty({
    example: 'Correccion de cantidades y motivo de merma registrada',
    description: 'Motivo obligatorio de reversion de la merma original',
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
