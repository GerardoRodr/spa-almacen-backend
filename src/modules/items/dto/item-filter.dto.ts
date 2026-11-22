import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';

export class ItemFilterDto {
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
    example: 'cemento',
    description: 'Termino de busqueda por SKU o nombre del insumo',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsString({ message: 'El parametro de busqueda debe ser una cadena' })
  search?: string;

  @ApiPropertyOptional({
    enum: ItemType,
    example: ItemType.CONSUMABLE,
    description: 'Filtrar por tipo de item',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && (value.trim() === '' || value === 'ALL')
      ? undefined
      : value,
  )
  @IsEnum(ItemType, { message: 'El tipo de item no es valido' })
  type?: ItemType;

  @ApiPropertyOptional({
    example: true,
    description: 'Filtrar por insumos perecibles (true) o no perecibles (false)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean({ message: 'isPerishable debe ser un valor booleano' })
  isPerishable?: boolean;

  @ApiPropertyOptional({
    example: 'd9b2d63d-a233-4f9e-8c33-875f56b060d1',
    description: 'Filtrar por identificador de clasificacion personalizada',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && (value.trim() === '' || value === 'ALL')
      ? undefined
      : value,
  )
  @IsUUID('4', { message: 'El categoryId debe ser un UUID valido' })
  categoryId?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Incluir items desactivados logicamente (por defecto false)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean({ message: 'includeInactive debe ser un valor booleano' })
  includeInactive?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Filtrar unicamente insumos en estado critico (stock fisico <= minStockAlert)',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean({ message: 'lowStockOnly debe ser un valor booleano' })
  lowStockOnly?: boolean;

  @ApiPropertyOptional({
    example: 'b0000000-0000-4000-8000-000000000001',
    description: 'Almacen de referencia cuando se filtra por lowStockOnly',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && (value.trim() === '' || value === 'ALL')
      ? undefined
      : value,
  )
  @IsUUID('4', { message: 'El warehouseId debe ser un UUID valido' })
  warehouseId?: string;
}
