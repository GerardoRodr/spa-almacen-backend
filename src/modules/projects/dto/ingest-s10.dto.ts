import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class S10ResourceItemDto {
  @ApiPropertyOptional({
    example: '0204010001',
    description: 'Codigo del insumo en el presupuesto S10',
  })
  @IsOptional()
  @IsString({ message: 'El codigo S10 debe ser una cadena de texto' })
  s10Code?: string;

  @ApiProperty({
    example: 'CEMENTO PORTLAND TIPO I (BOLSA 42.5KG)',
    description: 'Descripcion literal del recurso en la exportacion S10',
  })
  @IsString({ message: 'La descripcion cruda debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La descripcion cruda no puede estar vacia' })
  s10RawName: string;

  @ApiPropertyOptional({
    example: 'BOL',
    description: 'Unidad de medida en el presupuesto S10',
  })
  @IsOptional()
  @IsString({ message: 'La unidad S10 debe ser una cadena de texto' })
  s10Unit?: string;

  @ApiProperty({
    example: 2500,
    description: 'Cantidad o metrado presupuestado en la partida',
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un valor numerico' })
  @IsPositive({ message: 'La cantidad presupuestada debe ser mayor a cero' })
  quantity: number;
}

export class IngestS10Dto {
  @ApiPropertyOptional({
    example: 'S10-OBRA-2026-01',
    description: 'Codigo de presupuesto S10 del proyecto',
  })
  @IsOptional()
  @IsString({ message: 'El codigo de presupuesto debe ser una cadena de texto' })
  budgetCode?: string;

  @ApiProperty({
    type: [S10ResourceItemDto],
    description: 'Lista de recursos y materiales extraidos del presupuesto S10',
  })
  @IsArray({ message: 'Los recursos deben enviarse como una lista' })
  @ValidateNested({ each: true })
  @Type(() => S10ResourceItemDto)
  resources: S10ResourceItemDto[];
}
