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
import { TransferItemInputDto } from './transfer-item-input.dto.js';

export class DispatchTransferDto {
  @ApiProperty({
    description: 'Identificador del almacen emisor de la carga',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El originWarehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El originWarehouseId es obligatorio' })
  originWarehouseId: string;

  @ApiProperty({
    description: 'Identificador del almacen receptor en obra o destino',
    example: 'b0000000-0000-0000-0000-000000000002',
  })
  @IsUUID('4', { message: 'El destWarehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El destWarehouseId es obligatorio' })
  destWarehouseId: string;

  @ApiPropertyOptional({
    description: 'Identificador del proyecto civil de destino si corresponde',
    example: 'c0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El projectId debe ser un UUID valido' })
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Observaciones del despacho (vehiculo, placa, conductor)',
    example: 'Despacho en camioneta placa ABC-123 con chofer Juan Perez',
  })
  @IsOptional()
  @IsString({ message: 'Las notas de despacho deben ser texto' })
  @MaxLength(500, {
    message: 'Las notas de despacho no pueden exceder 500 caracteres',
  })
  dispatchNotes?: string;

  @ApiProperty({
    description: 'Lista de items y cantidades a despachar',
    type: [TransferItemInputDto],
  })
  @IsArray({ message: 'Los items deben enviarse como un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item para transferir' })
  @ValidateNested({ each: true })
  @Type(() => TransferItemInputDto)
  items: TransferItemInputDto[];
}
