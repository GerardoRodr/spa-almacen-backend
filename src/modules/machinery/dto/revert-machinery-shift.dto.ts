import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RevertMachineryShiftDto {
  @ApiProperty({
    example: 'Turno registrado por error en maquina equivocada',
    description: 'Motivo obligatorio de anulacion de la jornada de maquinaria',
  })
  @IsString({ message: 'El motivo de anulacion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de anulacion es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de anulacion debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de anulacion no puede exceder 500 caracteres',
  })
  reason: string;
}
