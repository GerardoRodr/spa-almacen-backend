import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MovementItemInputDto } from './movement-item-input.dto.js';

export class CreateConsumptionExitDto {
  @ApiProperty({
    description: 'Identificador del almacen de obra de donde sale el material',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El warehouseId es obligatorio' })
  warehouseId: string;

  @ApiProperty({
    description: 'Identificador del proyecto civil al que se imputa el consumo',
    example: 'c0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El projectId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El projectId es obligatorio' })
  projectId: string;

  @ApiProperty({
    description: 'Nombre y apellido del capataz o responsable receptor',
    example: 'Manuel Flores Huaman',
  })
  @IsString({ message: 'El nombre del receptor debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre del receptor es obligatorio' })
  @MaxLength(150, {
    message: 'El nombre del receptor no puede superar 150 caracteres',
  })
  recipientName: string;

  @ApiProperty({
    description: 'Documento Nacional de Identidad (DNI) del receptor (8 digitos numericos)',
    example: '45892314',
  })
  @IsString({ message: 'El DNI debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El DNI del receptor es obligatorio' })
  @Matches(/^[0-9]{8}$/, {
    message: 'El DNI debe contener exactamente 8 digitos numericos',
  })
  recipientDni: string;

  @ApiPropertyOptional({
    description: 'Observacion del destino, frente de obra o partida presupuestal',
    example: 'Vaciado de columnas sector B - Tercer piso',
  })
  @IsOptional()
  @IsString({ message: 'La observacion debe ser texto' })
  @MaxLength(500, {
    message: 'La observacion no puede exceder 500 caracteres',
  })
  observation?: string;

  @ApiProperty({
    description: 'Lista de insumos consumibles entregados a la cuadrilla',
    type: [MovementItemInputDto],
  })
  @IsArray({ message: 'Los items deben enviarse como un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item para salida' })
  @ValidateNested({ each: true })
  @Type(() => MovementItemInputDto)
  items: MovementItemInputDto[];
}
