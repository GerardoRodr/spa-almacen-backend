import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTransferMetadataDto {
  @ApiPropertyOptional({
    example: 'Despacho en camion placa XYZ-789 con chofer Luis Ramos',
    description: 'Observaciones de despacho actualizadas',
  })
  @IsOptional()
  @IsString({ message: 'Las notas de despacho deben ser texto' })
  @MaxLength(500, {
    message: 'Las notas de despacho no pueden exceder 500 caracteres',
  })
  dispatchNotes?: string;

  @ApiPropertyOptional({
    example: 'Recepcion verificada por maestro de obra',
    description: 'Observaciones de recepcion actualizadas',
  })
  @IsOptional()
  @IsString({ message: 'Las notas de recepcion deben ser texto' })
  @MaxLength(500, {
    message: 'Las notas de recepcion no pueden exceder 500 caracteres',
  })
  receptionNotes?: string;
}
