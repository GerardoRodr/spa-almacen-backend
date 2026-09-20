import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignWarehousesDto {
  @ApiProperty({
    type: [String],
    description: 'Arreglo de identificadores de almacenes autorizados',
    example: ['uuid-almacen-1', 'uuid-almacen-2'],
  })
  @IsArray({ message: 'Los almacenes deben ser un arreglo de identificadores' })
  @IsString({ each: true, message: 'Cada identificador debe ser una cadena' })
  @IsNotEmpty({ message: 'El arreglo de almacenes no puede estar vacio' })
  warehouseIds: string[];

  @ApiPropertyOptional({
    description: 'Identificador del almacen activo por defecto para la sesion',
    example: 'uuid-almacen-1',
  })
  @IsOptional()
  @IsString({ message: 'El identificador predeterminado debe ser una cadena' })
  defaultWarehouseId?: string;
}
