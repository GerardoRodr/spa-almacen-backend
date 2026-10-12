import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// DTO de respuesta para metricas consolidadas y KPIs del dashboard
export class DashboardMetricsDto {
  @ApiProperty({
    description: 'Cantidad de insumos o SKUs con existencias fisicas mayores a cero',
    example: 45,
  })
  totalActiveSkus!: number;

  @ApiPropertyOptional({
    description: 'Valorizacion total neta del inventario en Soles (PEN) sin IGV (confidencial ADMIN)',
    example: 184500.5,
    nullable: true,
  })
  inventoryValuationPEN?: number | null;

  @ApiPropertyOptional({
    description: 'Inversion patrimonial en herramientas, equipos y maquinarias en Soles (PEN) (confidencial ADMIN)',
    example: 48900.0,
    nullable: true,
  })
  toolsInvestmentPEN?: number | null;

  @ApiProperty({
    description: 'Cantidad de herramientas o equipos actualmente prestados en campo (custodias pendientes)',
    example: 12,
  })
  toolsInField!: number;

  @ApiProperty({
    description: 'Cantidad de insumos en nivel critico o por debajo de su stock minimo de alerta',
    example: 3,
  })
  criticalItemsCount!: number;

  @ApiProperty({
    description: 'Identificador del almacen evaluado o ALL para consolidado general',
    example: 'ALL',
  })
  warehouseId!: string;

  @ApiProperty({
    description: 'Nombre descriptivo del almacen o consolidado',
    example: 'Consolidado General (Todas las Sedes)',
  })
  warehouseName!: string;

  @ApiPropertyOptional({
    description: 'Tipo de sede: CENTRAL, PROJECT_SITE o CONSOLIDATED',
    example: 'CONSOLIDATED',
  })
  warehouseType?: string;
}
