import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateMachineryShiftDto {
  @ApiPropertyOptional({
    example: 'Roberto Carlos Quispe',
    description: 'Nombre corregido del operador de la maquinaria',
  })
  @IsOptional()
  @IsString({ message: 'operatorName debe ser texto' })
  @MaxLength(150, {
    message: 'operatorName no puede exceder 150 caracteres',
  })
  operatorName?: string;

  @ApiPropertyOptional({
    example: '45678912',
    description: 'DNI corregido del operador',
  })
  @IsOptional()
  @IsString({ message: 'operatorDni debe ser texto' })
  @MaxLength(20, {
    message: 'operatorDni no puede exceder 20 caracteres',
  })
  operatorDni?: string;

  @ApiPropertyOptional({
    example: 'Lectura corregida por reflejo en pantalla LCD del horometro',
    description: 'Observaciones actualizadas de la jornada',
  })
  @IsOptional()
  @IsString({ message: 'notes debe ser texto' })
  @MaxLength(500, {
    message: 'notes no puede exceder 500 caracteres',
  })
  notes?: string;

  @ApiPropertyOptional({
    example: 1245.5,
    description: 'Lectura inicial corregida de horometro o kilometraje',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'startMeter debe ser numerico con hasta 2 decimales' },
  )
  @Min(0, { message: 'startMeter no puede ser negativo' })
  startMeter?: number;

  @ApiPropertyOptional({
    example: 1252.8,
    description: 'Lectura final corregida (solo jornadas cerradas)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'endMeter debe ser numerico con hasta 2 decimales' },
  )
  @Min(0, { message: 'endMeter no puede ser negativo' })
  endMeter?: number;

  @ApiPropertyOptional({
    example: 'doc-uuid-start-photo',
    description: 'ID de fotografia inicial actualizada',
  })
  @IsOptional()
  @IsUUID('4', { message: 'startPhotoId debe ser un UUID valido' })
  startPhotoId?: string;

  @ApiPropertyOptional({
    example: 'doc-uuid-end-photo',
    description: 'ID de fotografia final actualizada (solo jornadas cerradas)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'endPhotoId debe ser un UUID valido' })
  endPhotoId?: string;

  @ApiPropertyOptional({
    example: 'doc-uuid-fuel-photo',
    description: 'ID de fotografia de combustible actualizada (solo jornadas cerradas)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'fuelPhotoId debe ser un UUID valido' })
  fuelPhotoId?: string;
}
