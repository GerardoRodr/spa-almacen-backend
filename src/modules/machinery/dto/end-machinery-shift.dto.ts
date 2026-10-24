import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EndMachineryShiftDto {
  @ApiProperty({
    example: 1258.75,
    description:
      'Lectura numerica final del medidor (horometro o kilometraje) al finalizar la jornada (debe ser >= startMeter)',
  })
  @IsNotEmpty({ message: 'endMeter es requerido' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'endMeter debe ser un numero con maximo 2 decimales' },
  )
  @Min(0, { message: 'endMeter no puede ser negativo' })
  endMeter: number;

  @ApiProperty({
    example: 'f0000000-0000-4000-8000-000000000002',
    description:
      'Identificador de la fotografia del medidor final cargada en /documents/upload',
  })
  @IsNotEmpty({ message: 'endPhotoId es obligatorio para validar la lectura final' })
  @IsUUID('4', { message: 'endPhotoId debe ser un UUID valido' })
  endPhotoId: string;

  @ApiPropertyOptional({
    example: 'f0000000-0000-4000-8000-000000000003',
    description:
      'Identificador opcional de la fotografia del comprobante o nivel de combustible',
  })
  @IsOptional()
  @IsUUID('4', { message: 'fuelPhotoId debe ser un UUID valido' })
  fuelPhotoId?: string;

  @ApiPropertyOptional({
    example:
      'Operacion en zanja este concluida. Se detecto leve fuga en manguera hidraulica secundaria.',
  })
  @IsOptional()
  @IsString({ message: 'notes debe ser una cadena de texto' })
  @MaxLength(1000, { message: 'notes no puede exceder 1000 caracteres' })
  notes?: string;
}
