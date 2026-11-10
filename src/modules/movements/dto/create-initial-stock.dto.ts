import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InitialStockItemInputDto {
  @ApiProperty({
    description: 'Identificador UUID del item a ingresar en inventario',
    example: 'a0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El itemId es obligatorio' })
  itemId: string;

  @ApiProperty({
    description: 'Cantidad fisica inicial a registrar en la unidad base del insumo',
    example: 25.5,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'La cantidad debe ser un valor numerico' })
  @Min(0.0001, { message: 'La cantidad inicial debe ser mayor a cero' })
  quantity: number;

  @ApiPropertyOptional({
    description: 'Costo unitario referencial en Soles (solo procesado para ADMIN)',
    example: 28.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El costo unitario debe ser un valor numerico' })
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  unitCost?: number;
}

export class CreateInitialStockDto {
  @ApiProperty({
    description: 'Identificador UUID del almacen donde se realiza la toma fisica inicial',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  @IsNotEmpty({ message: 'El warehouseId es obligatorio' })
  warehouseId: string;

  @ApiPropertyOptional({
    description: 'Justificacion o acta breve de toma fisica de inventario',
    example: 'Levantamiento de inventario fisico en caseta de obra',
  })
  @IsOptional()
  @IsString({ message: 'La observacion debe ser una cadena de texto' })
  @MaxLength(500, { message: 'La observacion no puede exceder 500 caracteres' })
  observation?: string;

  @ApiProperty({
    description: 'Listado de insumos y cantidades fisicas a registrar',
    type: [InitialStockItemInputDto],
  })
  @IsArray({ message: 'Los items deben enviarse como un arreglo' })
  @ArrayMinSize(1, { message: 'Debe incluir al menos un item para registrar' })
  @ValidateNested({ each: true })
  @Type(() => InitialStockItemInputDto)
  items: InitialStockItemInputDto[];
}
