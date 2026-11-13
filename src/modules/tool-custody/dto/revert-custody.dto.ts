import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RevertCustodyDto {
  @ApiProperty({
    example: 'Error al seleccionar herramienta o DNI del operario',
    description: 'Motivo obligatorio de reversion del vale de custodia',
  })
  @IsString({ message: 'El motivo de reversion debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El motivo de reversion es obligatorio' })
  @MinLength(5, {
    message: 'El motivo de reversion debe tener al menos 5 caracteres',
  })
  @MaxLength(500, {
    message: 'El motivo de reversion no puede exceder 500 caracteres',
  })
  reason: string;
}
