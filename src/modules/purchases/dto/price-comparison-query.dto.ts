import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PriceComparisonQueryDto {
  @ApiPropertyOptional({
    example: 'e0000000-0000-4000-8000-000000000001',
    description: 'Identificador UUID del insumo a consultar',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El itemId debe ser un UUID valido' })
  itemId?: string;

  @ApiPropertyOptional({
    example: 'cemento',
    description: 'Nombre o SKU del insumo para busqueda si no se envia itemId',
  })
  @IsOptional()
  @IsString({ message: 'El termino de busqueda debe ser una cadena de texto' })
  search?: string;

  @ApiPropertyOptional({
    example: 'b0000000-0000-4000-8000-000000000001',
    description:
      'Identificador UUID del almacen/obra para filtrar el costo promedio o compras (opcional)',
  })
  @IsOptional()
  @IsString({ message: 'El warehouseId debe ser una cadena' })
  warehouseId?: string;
}
