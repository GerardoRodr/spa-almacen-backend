import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MovementType } from '@prisma/client';

export class MovementFilterDto {
  @ApiPropertyOptional({
    description: 'Numero de pagina para paginacion',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un numero entero' })
  @Min(1, { message: 'La pagina minima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por pagina',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El limite debe ser un numero entero' })
  @Min(1, { message: 'El limite minimo es 1' })
  @Max(100, { message: 'El limite maximo es 100' })
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filtrar por identificador de almacen (origen o destino)',
    example: 'b0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  warehouseId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por identificador de item especifico',
    example: 'a0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por proyecto civil imputado',
    example: 'c0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El projectId debe ser un UUID valido' })
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de transaccion en Kardex',
    enum: MovementType,
  })
  @IsOptional()
  @IsEnum(MovementType, { message: 'Tipo de movimiento no valido' })
  type?: MovementType;

  @ApiPropertyOptional({
    description: 'Fecha inicial para filtrar movimientos (ISO 8601)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha inicial debe tener un formato ISO 8601 valido' },
  )
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Fecha final para filtrar movimientos (ISO 8601)',
    example: '2026-09-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha final debe tener un formato ISO 8601 valido' },
  )
  endDate?: string;
}
