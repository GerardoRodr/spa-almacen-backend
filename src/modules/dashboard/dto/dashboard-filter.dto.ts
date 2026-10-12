import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// DTO para filtrado contextual de metricas en el dashboard
export class DashboardFilterDto {
  @ApiPropertyOptional({
    description: 'Identificador del almacen o ALL para consolidado corporativo',
    example: 'ALL',
  })
  @IsOptional()
  @IsString()
  warehouseId?: string;
}
