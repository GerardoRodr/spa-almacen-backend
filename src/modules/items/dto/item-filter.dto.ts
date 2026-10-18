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
  @IsString({ message: 'El parametro de busqueda debe ser una cadena' })
  search?: string;

  @ApiPropertyOptional({
    enum: ItemType,
    example: ItemType.CONSUMABLE,
    description: 'Filtrar por tipo de item',
  })
  @IsOptional()
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
  @IsUUID('4', { message: 'El categoryId debe ser un UUID valido' })
  categoryId?: string;
}
