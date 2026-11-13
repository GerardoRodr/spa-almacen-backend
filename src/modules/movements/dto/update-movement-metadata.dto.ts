import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMovementMetadataDto {
  @ApiPropertyOptional({
    example: 'Juan Carlos Perez',
    description: 'Nombre corregido del receptor (solo CONSUMPTION_EXIT)',
  })
  @IsOptional()
  @IsString({ message: 'recipientName debe ser texto' })
  @MaxLength(150, {
    message: 'recipientName no puede exceder 150 caracteres',
  })
  recipientName?: string;

  @ApiPropertyOptional({
    example: '45678912',
    description: 'DNI corregido del receptor (solo CONSUMPTION_EXIT)',
  })
  @IsOptional()
  @IsString({ message: 'recipientDni debe ser texto' })
  @MaxLength(20, {
    message: 'recipientDni no puede exceder 20 caracteres',
  })
  recipientDni?: string;

  @ApiPropertyOptional({
    example: 'Rotura accidental de sacos durante descarga en lluvia',
    description: 'Motivo corregido de la merma (solo SHRINKAGE_EXIT)',
  })
  @IsOptional()
  @IsString({ message: 'shrinkageReason debe ser texto' })
  @MaxLength(300, {
    message: 'shrinkageReason no puede exceder 300 caracteres',
  })
  shrinkageReason?: string;

  @ApiPropertyOptional({
    example: 'Observacion actualizada de control interno',
    description: 'Observacion corregida del movimiento',
  })
  @IsOptional()
  @IsString({ message: 'observation debe ser texto' })
  @MaxLength(500, {
    message: 'observation no puede exceder 500 caracteres',
  })
  observation?: string;
}
