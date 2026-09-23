import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ItemType } from '@prisma/client';

export class WarehouseStockFilterDto {
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
    description: 'Filtro por tipo de item: CONSUMABLE o ASSET_TOOL',
  })
  @IsOptional()
  @IsEnum(ItemType, { message: 'El tipo de item no es valido' })
  type?: ItemType;
}
