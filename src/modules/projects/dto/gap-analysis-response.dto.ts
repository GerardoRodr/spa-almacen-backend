import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GapAnalysisBudgetSummaryDto {
  @ApiPropertyOptional({ example: 3479983.23, description: 'Costo Directo Total presupuestado S10 en Soles' })
  totalBudgetPEN?: number;

  @ApiPropertyOptional({ example: 1135524.35, description: 'Subtotal presupuestado para Materiales (Grupo 02) en Soles' })
  materialsBudgetPEN?: number;

  @ApiPropertyOptional({ example: 153599.14, description: 'Subtotal presupuestado para Equipos y Herramientas (Grupo 03) en Soles' })
  equipmentBudgetPEN?: number;

  @ApiPropertyOptional({ example: 1587459.81, description: 'Subtotal presupuestado para Mano de Obra (Grupo 01) en Soles' })
  laborBudgetPEN?: number;

  @ApiPropertyOptional({ example: 603399.93, description: 'Subtotal presupuestado para Subcontratos (Grupo 04) en Soles' })
  subcontractsBudgetPEN?: number;

  @ApiProperty({ example: 48, description: 'Total de insumos unicos requeridos en la obra' })
  totalRequiredItemsCount: number;

  @ApiPropertyOptional({ example: 45280.5, description: 'Costo financiero proyectado del deficit de compra segun precio S10' })
  totalDeficitEstimatedCostPEN?: number;
}

export class GapAnalysisItemDto {
  @ApiProperty({ example: 'item-uuid-cemento' })
  itemId: string;

  @ApiProperty({ example: 'CEM-PORT-T1' })
  sku: string;

  @ApiProperty({ example: 'Cemento Portland Tipo I (Bolsa 42.5 kg)' })
  itemName: string;

  @ApiProperty({ example: 'BOLSA' })
  baseUnit: string;

  @ApiProperty({ example: '2500.0000' })
  requiredQty: string;

  @ApiProperty({ example: '500.0000' })
  allocatedQty: string;

  @ApiProperty({ example: '1200.0000' })
  consumedQty: string;

  @ApiProperty({ example: '800.0000' })
  pendingToSupply: string;

  @ApiProperty({ example: 68.0 })
  fulfillmentPercentage: number;

  @ApiProperty({ example: '700.0000' })
  centralAvailableStock: string;

  @ApiProperty({ example: '100.0000' })
  purchaseDeficit: string;

  @ApiPropertyOptional({ example: '26.2500' })
  minHistoricalUnitCost?: string | null;

  @ApiPropertyOptional({ example: '28.0000' })
  weightedAverageCost?: string | null;

  @ApiPropertyOptional({ example: '26.5000' })
  s10BudgetUnitPrice?: string | null;
}

export class GapAnalysisResponseDto {
  @ApiProperty({ example: '77777777-7777-7777-7777-777777777777' })
  projectId: string;

  @ApiProperty({ example: 'Mejoramiento de Agua Potable y Alcantarillado Yanivilca' })
  projectName: string;

  @ApiProperty({ type: GapAnalysisBudgetSummaryDto, description: 'KPIs y consolidado presupuestal S10' })
  budgetSummary: GapAnalysisBudgetSummaryDto;

  @ApiProperty({ type: [GapAnalysisItemDto], description: 'Matriz de brechas item por item' })
  analysis: GapAnalysisItemDto[];
}
