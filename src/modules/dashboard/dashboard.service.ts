import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DashboardMetricsDto } from './dto/dashboard-metrics.dto.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Consulta metricas consolidadas o por sede para tarjetas de KPI
  async getMetrics(warehouseId?: string): Promise<DashboardMetricsDto> {
    let targetWarehouseName = 'Consolidado General (Todas las Sedes)';
    let targetWarehouseType = 'CONSOLIDATED';

    const isSpecificWarehouse =
      warehouseId !== undefined &&
      warehouseId !== null &&
      warehouseId !== '' &&
      warehouseId !== 'ALL';

    if (isSpecificWarehouse) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: warehouseId },
        select: { id: true, name: true, type: true },
      });

      if (!warehouse) {
        throw new NotFoundException('Almacen no encontrado');
      }

      targetWarehouseName = warehouse.name;
      targetWarehouseType = warehouse.type;
    }

    // Inversion y valorizacion calculada directamente en PostgreSQL
    let valuationRows: Array<{
      totalValuation: string | number;
      toolsValuation: string | number;
      totalActiveSkus: string | number;
    }>;

    if (isSpecificWarehouse) {
      valuationRows = await this.prisma.$queryRaw`
        SELECT 
          COALESCE(SUM(s."physicalQty" * s."averageCost"), 0)::numeric AS "totalValuation",
          COALESCE(SUM(CASE WHEN i."type" IN ('TOOL', 'EQUIPMENT', 'MACHINERY') THEN s."physicalQty" * s."averageCost" ELSE 0 END), 0)::numeric AS "toolsValuation",
          COUNT(DISTINCT s."itemId")::int AS "totalActiveSkus"
        FROM "Stock" s
        JOIN "Item" i ON s."itemId" = i."id"
        WHERE s."physicalQty" > 0 AND s."warehouseId" = ${warehouseId}
      `;
    } else {
      valuationRows = await this.prisma.$queryRaw`
        SELECT 
          COALESCE(SUM(s."physicalQty" * s."averageCost"), 0)::numeric AS "totalValuation",
          COALESCE(SUM(CASE WHEN i."type" IN ('TOOL', 'EQUIPMENT', 'MACHINERY') THEN s."physicalQty" * s."averageCost" ELSE 0 END), 0)::numeric AS "toolsValuation",
          COUNT(DISTINCT s."itemId")::int AS "totalActiveSkus"
        FROM "Stock" s
        JOIN "Item" i ON s."itemId" = i."id"
        WHERE s."physicalQty" > 0
      `;
    }

    const valuation = valuationRows[0];
    const totalValuation = Number(valuation?.totalValuation ?? 0);
    const toolsValuation = Number(valuation?.toolsValuation ?? 0);
    const totalActiveSkus = Number(valuation?.totalActiveSkus ?? 0);

    // Conteo de insumos en nivel critico de existencias calculado en motor SQL
    let criticalItemsCount = 0;
    if (isSpecificWarehouse) {
      const critRows = await this.prisma.$queryRaw<
        Array<{ criticalCount: string | number }>
      >`
        SELECT COUNT(*)::int AS "criticalCount"
        FROM "Stock" s
        JOIN "Item" i ON s."itemId" = i."id"
        WHERE s."warehouseId" = ${warehouseId} AND i."minStockAlert" > 0 AND s."physicalQty" <= i."minStockAlert"
      `;
      criticalItemsCount = Number(critRows[0]?.criticalCount ?? 0);
    } else {
      const critRows = await this.prisma.$queryRaw<
        Array<{ criticalCount: string | number }>
      >`
        SELECT COUNT(*)::int AS "criticalCount"
        FROM (
          SELECT s."itemId"
          FROM "Stock" s
          JOIN "Item" i ON s."itemId" = i."id"
          WHERE i."minStockAlert" > 0
          GROUP BY s."itemId", i."minStockAlert"
          HAVING SUM(s."physicalQty") <= i."minStockAlert"
        ) sub
      `;
      criticalItemsCount = Number(critRows[0]?.criticalCount ?? 0);
    }

    // Cantidad de custodias pendientes de devolucion en campo
    const custodyWhere: Record<string, unknown> = {
      returnDate: null,
    };

    if (isSpecificWarehouse) {
      custodyWhere.warehouseId = warehouseId;
    }

    const toolsInField = await this.prisma.toolCustody.count({
      where: custodyWhere,
    });

    return {
      totalActiveSkus,
      inventoryValuationPEN: Number(totalValuation.toFixed(2)),
      toolsInvestmentPEN: Number(toolsValuation.toFixed(2)),
      toolsInField,
      criticalItemsCount,
      warehouseId: isSpecificWarehouse ? warehouseId : 'ALL',
      warehouseName: targetWarehouseName,
      warehouseType: targetWarehouseType,
    };
  }

  // Comparativa de volumen fisico entre Almacen Central y Almacenes de Obra (Top 8 en SQL nativo)
  async getStockComparison() {
    const rows = await this.prisma.$queryRaw<
      Array<{
        itemId: string;
        sku: string;
        name: string;
        baseUnit: string;
        centralQty: string | number;
        projectsQty: string | number;
      }>
    >`
      SELECT 
        i."id" AS "itemId",
        i."sku",
        i."name",
        i."baseUnit",
        COALESCE(SUM(CASE WHEN w."type" = 'CENTRAL' THEN s."physicalQty" ELSE 0 END), 0)::numeric AS "centralQty",
        COALESCE(SUM(CASE WHEN w."type" != 'CENTRAL' THEN s."physicalQty" ELSE 0 END), 0)::numeric AS "projectsQty"
      FROM "Item" i
      JOIN "Stock" s ON i."id" = s."itemId"
      JOIN "Warehouse" w ON s."warehouseId" = w."id"
      GROUP BY i."id", i."sku", i."name", i."baseUnit"
      HAVING SUM(s."physicalQty") > 0
      ORDER BY SUM(s."physicalQty") DESC
      LIMIT 8;
    `;

    return rows.map((r) => ({
      itemId: r.itemId,
      sku: r.sku,
      name: r.name,
      baseUnit: r.baseUnit,
      centralQty: Number(r.centralQty),
      projectsQty: Number(r.projectsQty),
    }));
  }

  // Lista de insumos con deficit o por debajo del umbral de reposicion urgente
  async getUrgentReplenishments(warehouseId?: string) {
    const isSpecificWarehouse =
      warehouseId !== undefined &&
      warehouseId !== null &&
      warehouseId !== '' &&
      warehouseId !== 'ALL';

    const stockWhere: Record<string, unknown> = {};
    if (isSpecificWarehouse) {
      stockWhere.warehouseId = warehouseId;
    }

    const stocks = await this.prisma.stock.findMany({
      where: stockWhere,
      include: {
        warehouse: { select: { id: true, name: true } },
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            baseUnit: true,
            type: true,
            minStockAlert: true,
          },
        },
      },
    });

    const urgentItems = [];

    for (const s of stocks) {
      const minAlert = Number(s.item.minStockAlert);
      const pQty = Number(s.physicalQty);

      if (minAlert > 0 && pQty <= minAlert) {
        urgentItems.push({
          stockId: s.id,
          warehouseId: s.warehouseId,
          warehouseName: s.warehouse.name,
          itemId: s.itemId,
          sku: s.item.sku,
          name: s.item.name,
          baseUnit: s.item.baseUnit,
          type: s.item.type,
          physicalQty: pQty,
          minStockAlert: minAlert,
          deficitQty: Math.max(0, minAlert - pQty),
        });
      }
    }

    return urgentItems;
  }

  // Lista de reservas logicas comprometidas para proyectos activos
  async getLogicalReservations() {
    const requirements = await this.prisma.projectRequirement.findMany({
      where: {
        allocatedQty: { gt: 0 },
        project: {
          status: { in: ['ACTIVE', 'PLANNING'] },
        },
      },
      include: {
        project: { select: { id: true, name: true } },
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            baseUnit: true,
          },
        },
      },
      orderBy: { allocatedQty: 'desc' },
    });

    return requirements.map((r) => ({
      projectId: r.projectId,
      projectName: r.project.name,
      itemId: r.itemId,
      sku: r.item.sku,
      name: r.item.name,
      baseUnit: r.item.baseUnit,
      allocatedQty: Number(r.allocatedQty),
      requiredQty: Number(r.requiredQty),
    }));
  }
}
