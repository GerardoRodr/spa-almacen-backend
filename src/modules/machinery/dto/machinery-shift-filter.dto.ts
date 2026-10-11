import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MachineryShiftFilterDto {
  @ApiPropertyOptional({
    description: 'Numero de pagina para paginacion',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un numero entero' })
  @Min(1, { message: 'page minima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Cantidad de registros por pagina',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un numero entero' })
  @Min(1, { message: 'limit minimo es 1' })
  @Max(100, { message: 'limit maximo es 100' })
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'e0000000-0000-4000-8000-000000000020',
    description: 'Filtrar jornadas por identificador de maquinaria',
  })
  @IsOptional()
  @IsUUID('4', { message: 'itemId debe ser un UUID valido' })
  itemId?: string;

  @ApiPropertyOptional({
    example: 'b0000000-0000-4000-8000-000000000002',
    description: 'Filtrar jornadas por almacen u obra',
  })
  @IsOptional()
  @IsUUID('4', { message: 'warehouseId debe ser un UUID valido' })
  warehouseId?: string;

  @ApiPropertyOptional({
    example: '45678912',
    description: 'Filtrar por DNI del operador',
  })
  @IsOptional()
  @IsString({ message: 'operatorDni debe ser una cadena de texto' })
  operatorDni?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar solo jornadas que permanecen activas / abiertas (endDateTime null)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean({ message: 'onlyOpen debe ser un valor booleano' })
  onlyOpen?: boolean;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Fecha inicial de apertura de turno para filtrado cronologico',
  })
  @IsOptional()
  @IsDateString({}, { message: 'startDate debe ser una fecha ISO valida' })
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-31T23:59:59.999Z',
    description: 'Fecha final de apertura de turno para filtrado cronologico',
  })
  @IsOptional()
  @IsDateString({}, { message: 'endDate debe ser una fecha ISO valida' })
  endDate?: string;
}
