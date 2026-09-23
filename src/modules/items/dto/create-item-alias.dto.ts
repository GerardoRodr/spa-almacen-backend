import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemAliasDto {
  @ApiProperty({
    example: 'uuid-item-maestro',
    description: 'Identificador del SKU maestro vinculado a este alias',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId: string;

  @ApiProperty({
    example: 'CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)',
    description: 'Cadena cruda y literal extraida del archivo de presupuesto S10',
  })
  @IsString({ message: 'El nombre crudo de S10 debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre crudo de S10 no puede estar vacio' })
  s10RawName: string;

  @ApiPropertyOptional({
    example: '0204010001',
    description: 'Codigo de recurso o partida en el catalogo del S10',
  })
  @IsOptional()
  @IsString({ message: 'El codigo de S10 debe ser una cadena de texto' })
  s10Code?: string;

  @ApiPropertyOptional({
    example: 'BOL',
    description: 'Unidad de medida asignada en el S10',
  })
  @IsOptional()
  @IsString({ message: 'La unidad de S10 debe ser una cadena de texto' })
  s10Unit?: string;

  @ApiPropertyOptional({
    example: 1.0,
    default: 1.0,
    description: 'Factor multiplicador para convertir la cantidad de S10 a la unidad base del item',
  })
  @IsOptional()
  @IsNumber({}, { message: 'El factor de conversion debe ser un numero' })
  @Min(0.0001, { message: 'El factor de conversion debe ser estrictamente positivo' })
  conversionFactor?: number;
}
