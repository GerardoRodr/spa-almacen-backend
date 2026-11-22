import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class ItemAliasFilterDto {
  @ApiPropertyOptional({ default: 1, description: 'Numero de pagina' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La pagina debe ser un numero entero' })
  @Min(1, { message: 'La pagina minima es 1' })
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, description: 'Registros por pagina' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El limite debe ser un numero entero' })
  @Min(1, { message: 'El limite minimo es 1' })
  @Max(100, { message: 'El limite maximo es 100' })
  limit?: number = 20;

  @ApiPropertyOptional({
    example: 'CEMENTO',
    description: 'Buscar por codigo S10, nombre crudo S10, unidad o insumo maestro',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString({ message: 'El parametro de busqueda debe ser una cadena' })
  search?: string;

  @ApiPropertyOptional({
    example: 'item-uuid-cemento',
    description: 'Filtrar alias vinculados a un insumo maestro especifico',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && (value.trim() === '' || value === 'ALL')
      ? undefined
      : value,
  )
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId?: string;
}
