import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemCategoryDto {
  @ApiProperty({
    example: 'Arrendamiento',
    description: 'Nombre unico de la clasificacion de insumos o herramientas',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name: string;

  @ApiPropertyOptional({
    example: 'CAT-ARREND',
    description: 'Codigo o prefijo interno opcional de la clasificacion',
  })
  @IsOptional()
  @IsString({ message: 'El codigo debe ser una cadena de texto' })
  @MaxLength(30, { message: 'El codigo no puede exceder 30 caracteres' })
  code?: string;

  @ApiPropertyOptional({
    example: 'Insumos correspondientes a alquiler de equipos y servicios de obra',
    description: 'Descripcion opcional de la clasificacion',
  })
  @IsOptional()
  @IsString({ message: 'La descripcion debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La descripcion no puede exceder 500 caracteres' })
  description?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Estado activo o inactivo de la clasificacion',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un valor booleano' })
  isActive?: boolean = true;
}
