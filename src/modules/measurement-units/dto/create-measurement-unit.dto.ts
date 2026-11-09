import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMeasurementUnitDto {
  @ApiProperty({
    example: 'LITRO',
    description: 'Codigo abreviado o identificador unico de la unidad de medida (ej. UND, KG, M3, BOLSA, LITRO)',
  })
  @IsString({ message: 'El codigo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El codigo no puede estar vacio' })
  @MaxLength(30, { message: 'El codigo no puede exceder 30 caracteres' })
  code: string;

  @ApiProperty({
    example: 'Litro',
    description: 'Nombre descriptivo completo de la unidad de medida',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres' })
  name: string;

  @ApiPropertyOptional({
    example: 'Unidad de volumen para liquidos, aditivos o aceites',
    description: 'Descripcion o uso recomendado de la unidad de medida',
  })
  @IsOptional()
  @IsString({ message: 'La descripcion debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La descripcion no puede exceder 500 caracteres' })
  description?: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description: 'Indica si la unidad de medida esta disponible para su uso en catalogo',
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser un valor booleano' })
  isActive?: boolean = true;
}
