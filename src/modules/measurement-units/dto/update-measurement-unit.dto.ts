import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMeasurementUnitDto {
  @ApiPropertyOptional({
    example: 'Litro Metrico',
    description: 'Nombre descriptivo completo de la unidad de medida',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    example: 'Unidad estandar de volumen de liquidos',
    description: 'Descripcion o uso recomendado de la unidad de medida',
  })
  @IsOptional()
  @IsString({ message: 'La descripcion debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La descripcion no puede exceder 500 caracteres' })
  description?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Estado activo o inactivo de la unidad de medida',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un valor booleano' })
  isActive?: boolean;
}
