import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({
    example: false,
    description: 'Filtrar unicamente insumos con multiples alias S10',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean({ message: 'onlyMultiple debe ser un valor booleano' })
  onlyMultiple?: boolean;
}
