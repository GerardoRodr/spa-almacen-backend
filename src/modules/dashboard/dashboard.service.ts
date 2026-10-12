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

    const stockWhere: Record<string, unknown> = {
      physicalQty: { gt: 0 },
    };

    if (isSpecificWarehouse) {
      stockWhere.warehouseId = warehouseId;
    }

    // Consulta de existencias activas con tipo de item y alertas de stock
    const stocks = await this.prisma.stock.findMany({
      where: stockWhere,
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            type: true,
            minStockAlert: true,
          },
        },
      },
    });

    // Total de SKUs unicos activos con existencia fisica positiva
    const activeItemIds = new Set<string>();
    let totalValuation = 0;
    let toolsValuation = 0;

    const toolTypes = new Set<ItemType>([
      ItemType.TOOL,
      ItemType.EQUIPMENT,
      ItemType.MACHINERY,
    ]);

    for (const s of stocks) {
      activeItemIds.add(s.itemId);
      const pQty = Number(s.physicalQty);
      const avgCost = Number(s.averageCost);
      const subtotal = pQty * avgCost;

      totalValuation += subtotal;

      // Inversion patrimonial exclusiva para herramientas, equipos y maquinaria
      if (toolTypes.has(s.item.type)) {
        toolsValuation += subtotal;
      }
    }

    // Calculo de insumos en nivel critico de existencias
    let criticalItemsCount = 0;

    if (isSpecificWarehouse) {
      criticalItemsCount = stocks.filter((s) => {
        const minAlert = Number(s.item.minStockAlert);
        return minAlert > 0 && Number(s.physicalQty) <= minAlert;
      }).length;
    } else {
      // Consolidar cantidades por insumo para evaluar alerta global
      const aggregatedQty = new Map<string, { qty: number; minAlert: number }>();
      for (const s of stocks) {
        const cur = aggregatedQty.get(s.itemId) ?? {
          qty: 0,
          minAlert: Number(s.item.minStockAlert),
        };
        cur.qty += Number(s.physicalQty);
        aggregatedQty.set(s.itemId, cur);
      }

      for (const { qty, minAlert } of aggregatedQty.values()) {
        if (minAlert > 0 && qty <= minAlert) {
          criticalItemsCount++;
        }
      }
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
      totalActiveSkus: activeItemIds.size,
      inventoryValuationPEN: Number(totalValuation.toFixed(2)),
      toolsInvestmentPEN: Number(toolsValuation.toFixed(2)),
      toolsInField,
      criticalItemsCount,
      warehouseId: isSpecificWarehouse ? warehouseId : 'ALL',
      warehouseName: targetWarehouseName,
      warehouseType: targetWarehouseType,
    };
  }

  // Comparativa de volumen fisico entre Almacen Central y Almacenes de Obra
  async getStockComparison() {
    const items = await this.prisma.item.findMany({
      include: {
        stocks: {
          include: {
            warehouse: {
              select: {
                id: true,
                name: true,
                type: true,
                isTemporary: true,
              },
            },
          },
        },
      },
    });

    const comparisons = [];

    for (const it of items) {
      let centralQty = 0;
      let projectsQty = 0;

      for (const s of it.stocks ?? []) {
        const pQty = Number(s.physicalQty);
        if (s.warehouse?.type === 'CENTRAL') {
          centralQty += pQty;
        } else {
          projectsQty += pQty;
        }
      }

      if (centralQty > 0 || projectsQty > 0) {
        comparisons.push({
          itemId: it.id,
          sku: it.sku,
          name: it.name,
          baseUnit: it.baseUnit,
          centralQty,
          projectsQty,
        });
      }
    }

    return comparisons
      .sort((a, b) => b.centralQty + b.projectsQty - (a.centralQty + a.projectsQty))
      .slice(0, 8);
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
