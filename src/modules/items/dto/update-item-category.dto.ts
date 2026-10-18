import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateItemCategoryDto {
  @ApiPropertyOptional({
    example: 'Arrendamiento de Maquinaria',
    description: 'Nombre de la clasificacion',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name?: string;

  @ApiPropertyOptional({
    example: 'CAT-ARREND-MAQ',
    description: 'Codigo o prefijo interno de la clasificacion',
  })
  @IsOptional()
  @IsString({ message: 'El codigo debe ser una cadena de texto' })
  @MaxLength(30, { message: 'El codigo no puede exceder 30 caracteres' })
  code?: string;

  @ApiPropertyOptional({
    example: 'Actualizacion de descripcion del grupo',
    description: 'Descripcion de la clasificacion',
  })
  @IsOptional()
  @IsString({ message: 'La descripcion debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La descripcion no puede exceder 500 caracteres' })
  description?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Estado activo de la clasificacion',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un valor booleano' })
  isActive?: boolean;
}
