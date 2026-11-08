import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectStatus, WarehouseType, ItemType } from '@prisma/client';

export class ProjectWarehouseDto {
  @ApiProperty({ example: '44444444-4444-4444-4444-444444444444' })
  id: string;

  @ApiProperty({ example: 'Almacen Obra Yanivilca' })
  name: string;

  @ApiProperty({ enum: WarehouseType, example: WarehouseType.PROJECT_SITE })
  type: WarehouseType;

  @ApiPropertyOptional({ example: true })
  isTemporary?: boolean;

  @ApiPropertyOptional({ example: true })
  isActive?: boolean;
}

export class ProjectItemDto {
  @ApiProperty({ example: 'item-uuid-cemento' })
  id: string;

  @ApiProperty({ example: 'CEM-PORT-T1' })
  sku: string;

  @ApiProperty({ example: 'Cemento Portland Tipo I (Bolsa 42.5 kg)' })
  name: string;

  @ApiProperty({ example: 'BOLSA' })
  baseUnit: string;

  @ApiProperty({ enum: ItemType, example: ItemType.CONSUMABLE })
  type: ItemType;
}

export class ProjectRequirementDetailDto {
  @ApiProperty({ example: 'req-uuid-1' })
  id: string;

  @ApiProperty({ example: 'proj-uuid-1' })
  projectId: string;

  @ApiProperty({ example: 'item-uuid-cemento' })
  itemId: string;

  @ApiProperty({ example: '2500.0000' })
  requiredQty: string;

  @ApiProperty({ example: '500.0000' })
  allocatedQty: string;

  @ApiProperty({ example: '1200.0000' })
  consumedQty: string;

  @ApiPropertyOptional({ example: '26.5000' })
  s10UnitPrice?: string | null;

  @ApiProperty({ type: ProjectItemDto })
  item: ProjectItemDto;
}

export class ProjectCountsDto {
  @ApiPropertyOptional({ example: 12 })
  transfers?: number;

  @ApiPropertyOptional({ example: 45 })
  movements?: number;

  @ApiPropertyOptional({ example: 48 })
  requirements?: number;
}

export class ProjectDetailResponseDto {
  @ApiProperty({ example: '77777777-7777-7777-7777-777777777777' })
  id: string;

  @ApiProperty({ example: 'Mejoramiento de Agua Potable y Alcantarillado Yanivilca' })
  name: string;

  @ApiPropertyOptional({ example: '1101024' })
  budgetCode?: string | null;

  @ApiProperty({ enum: ProjectStatus, example: ProjectStatus.PLANNING })
  status: ProjectStatus;

  @ApiPropertyOptional({ example: 'LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA' })
  s10Location?: string | null;

  @ApiPropertyOptional({ example: '131006' })
  s10Ubigeo?: string | null;

  @ApiPropertyOptional({ example: '2025-11-01T00:00:00.000Z' })
  s10BudgetDate?: Date | null;

  @ApiPropertyOptional({ example: '3479983.23' })
  s10TotalBudget?: string | number | null;

  @ApiPropertyOptional({ example: '1135524.35' })
  s10MaterialsBudget?: string | number | null;

  @ApiPropertyOptional({ example: '153599.14' })
  s10EquipmentBudget?: string | number | null;

  @ApiPropertyOptional({ example: '1587459.81' })
  s10LaborBudget?: string | number | null;

  @ApiPropertyOptional({ example: '603399.93' })
  s10SubcontractsBudget?: string | number | null;

  @ApiPropertyOptional({ type: ProjectWarehouseDto })
  warehouse?: ProjectWarehouseDto | null;

  @ApiPropertyOptional({ type: [ProjectRequirementDetailDto] })
  requirements?: ProjectRequirementDetailDto[];

  @ApiPropertyOptional({ type: ProjectCountsDto })
  _count?: ProjectCountsDto;

  @ApiProperty({ example: '2026-11-01T12:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-11-01T12:00:00.000Z' })
  updatedAt: Date;
}
