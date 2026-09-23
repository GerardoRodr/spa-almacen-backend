import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ToolCustodyFilterDto {
  @ApiPropertyOptional({
    default: 1,
    description: 'Numero de pagina para paginacion',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un entero' })
  @Min(1, { message: 'La pagina minima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    default: 20,
    description: 'Cantidad de registros por pagina',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El limite debe ser un entero' })
  @Min(1, { message: 'El limite minimo es 1' })
  limit?: number = 20;

  @ApiPropertyOptional({
    example: '44444444-4444-4444-4444-444444444444',
    description: 'Filtrar por identificador de almacen o caseta de obra',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  warehouseId?: string;

  @ApiPropertyOptional({
    example: '70123456',
    description: 'Filtrar por DNI del trabajador asignado',
  })
  @IsOptional()
  @IsString({ message: 'El DNI debe ser una cadena' })
  assignedToDni?: string;

  @ApiPropertyOptional({
    example: 'item-uuid-rotomartillo',
    description: 'Filtrar por SKU o identificador del item',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId?: string;

  @ApiPropertyOptional({
    example: true,
    default: false,
    description: 'Si es true, lista unicamente herramientas aun no devueltas (returnDate nulo)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean({ message: 'onlyPending debe ser un booleano' })
  onlyPending?: boolean;
}
