import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MovementItemInputDto } from './movement-item-input.dto.js';

export class CreateShrinkageExitDto {
  @ApiProperty({
    description: 'Identificador del almacen donde se produjo la merma o perdida',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El warehouseId es obligatorio' })
  warehouseId: string;

  @ApiProperty({
    description: 'Motivo o causa de la merma, rotura o desecho fisico',
    example: 'Bolsas de yeso humedecidas por lluvia intempestiva en caseta auxiliar',
  })
  @IsString({ message: 'El motivo de merma debe ser texto' })
  @IsNotEmpty({ message: 'El motivo de merma es obligatorio' })
  @MaxLength(255, {
    message: 'El motivo de merma no puede superar 255 caracteres',
  })
  shrinkageReason: string;

  @ApiPropertyOptional({
    description: 'Observaciones de autorizacion o acta levantada',
    example: 'Autorizado por residente de obra Ing. Morales',
  })
  @IsOptional()
  @IsString({ message: 'La observacion debe ser texto' })
  @MaxLength(500, {
    message: 'La observacion no puede exceder 500 caracteres',
  })
  observation?: string;

  @ApiProperty({
    description: 'Lista de items y cantidades mermadas',
    type: [MovementItemInputDto],
  })
  @IsArray({ message: 'Los items deben enviarse como un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item para registrar merma' })
  @ValidateNested({ each: true })
  @Type(() => MovementItemInputDto)
  items: MovementItemInputDto[];
}
