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
      'Lectura numerica final del horometro al finalizar la jornada (debe ser >= startHourMeter)',
  })
  @IsNotEmpty({ message: 'endHourMeter es requerido' })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'endHourMeter debe ser un numero con maximo 2 decimales' },
  )
  @Min(0, { message: 'endHourMeter no puede ser negativo' })
  endHourMeter: number;

  @ApiProperty({
    example: 'f0000000-0000-4000-8000-000000000002',
    description:
      'Identificador de la fotografia del horometro final cargada en /documents/upload',
  })
  @IsNotEmpty({ message: 'endPhotoId es obligatorio para validar el horometro final' })
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
