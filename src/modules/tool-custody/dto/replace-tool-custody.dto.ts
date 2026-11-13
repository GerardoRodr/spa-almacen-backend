import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { DispatchToolCustodyDto } from './dispatch-tool-custody.dto.js';

export class ReplaceToolCustodyDto extends DispatchToolCustodyDto {
  @ApiProperty({
    example: 'Correccion de operario y cantidad de herramientas prestadas',
    description: 'Motivo obligatorio de anulacion del vale original',
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
