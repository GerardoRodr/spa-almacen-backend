import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ItemType, WarehouseType } from '@prisma/client';
import { DashboardService } from './dashboard.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      warehouse: {
        findUnique: vi.fn(),
      },
      stock: {
        findMany: vi.fn(),
      },
      toolCustody: {
        count: vi.fn(),
      },
      item: {
        findMany: vi.fn(),
      },
      projectRequirement: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    } as unknown as PrismaService;

    service = new DashboardService(prisma);
  });

  describe('getMetrics', () => {
    it('debe calcular metricas consolidadas separando inversion patrimonial de consumibles', async () => {
      vi.spyOn(prisma, '$queryRaw')
        .mockResolvedValueOnce([
          {
            totalValuation: 154500,
            toolsValuation: 152500,
            totalActiveSkus: 3,
          },
        ])
        .mockResolvedValueOnce([
          {
            criticalCount: 0,
          },
        ]);
      vi.spyOn(prisma.toolCustody, 'count').mockResolvedValue(4);

      const metrics = await service.getMetrics('ALL');

      // 3 SKUs unicos activos
      expect(metrics.totalActiveSkus).toBe(3);

      // Valorizacion total de inventario: (100*20) + (5*500) + (1*150000) = 2000 + 2500 + 150000 = 154500
      expect(metrics.inventoryValuationPEN).toBe(154500);

      // Inversion patrimonial (TOOL + MACHINERY): 2500 + 150000 = 152500 (el cemento no se suma)
      expect(metrics.toolsInvestmentPEN).toBe(152500);

      // Herramientas en campo
      expect(metrics.toolsInField).toBe(4);

      // Metadatos consolidados
      expect(metrics.warehouseId).toBe('ALL');
      expect(metrics.warehouseName).toBe('Consolidado General (Todas las Sedes)');
      expect(metrics.warehouseType).toBe('CONSOLIDATED');
    });

    it('debe filtrar metricas por un almacen especifico', async () => {
      vi.spyOn(prisma.warehouse, 'findUnique').mockResolvedValue({
        id: 'wh-1',
        name: 'Almacen Obra San Isidro',
        type: WarehouseType.PROJECT_SITE,
      } as any);

      vi.spyOn(prisma, '$queryRaw')
        .mockResolvedValueOnce([
          {
            totalValuation: 600,
            toolsValuation: 600,
            totalActiveSkus: 1,
          },
        ])
        .mockResolvedValueOnce([
          {
            criticalCount: 1,
          },
        ]);
      vi.spyOn(prisma.toolCustody, 'count').mockResolvedValue(1);

      const metrics = await service.getMetrics('wh-1');

      expect(metrics.warehouseId).toBe('wh-1');
      expect(metrics.warehouseName).toBe('Almacen Obra San Isidro');
      expect(metrics.warehouseType).toBe(WarehouseType.PROJECT_SITE);
      expect(metrics.totalActiveSkus).toBe(1);
      expect(metrics.inventoryValuationPEN).toBe(600);
      expect(metrics.toolsInvestmentPEN).toBe(600);
      expect(metrics.criticalItemsCount).toBe(1);
    });

    it('debe lanzar NotFoundException si el almacen solicitado no existe', async () => {
      vi.spyOn(prisma.warehouse, 'findUnique').mockResolvedValue(null);

      await expect(service.getMetrics('wh-inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStockComparison', () => {
    it('debe comparar existencias entre Central y Obra ordenadas por volumen', async () => {
      vi.spyOn(prisma, '$queryRaw').mockResolvedValueOnce([
        {
          itemId: 'item-1',
          sku: 'CEM-01',
          name: 'Cemento',
          baseUnit: 'BOLSA',
          centralQty: 200,
          projectsQty: 50,
        },
      ]);

      const result = await service.getStockComparison();

      expect(result.length).toBe(1);
      expect(result[0].sku).toBe('CEM-01');
      expect(result[0].centralQty).toBe(200);
      expect(result[0].projectsQty).toBe(50);
    });
  });

  describe('getUrgentReplenishments', () => {
    it('debe listar insumos con deficit respecto al umbral minimo', async () => {
      vi.spyOn(prisma.stock, 'findMany').mockResolvedValue([
        {
          id: 'stock-1',
          warehouseId: 'wh-1',
          itemId: 'item-1',
          physicalQty: 3,
          warehouse: { id: 'wh-1', name: 'Almacen Obra' },
          item: {
            id: 'item-1',
            sku: 'CLA-01',
            name: 'Clavos 3"',
            baseUnit: 'KG',
            type: ItemType.CONSUMABLE,
            minStockAlert: 10,
          },
        },
      ] as any);

      const result = await service.getUrgentReplenishments('wh-1');

      expect(result.length).toBe(1);
      expect(result[0].sku).toBe('CLA-01');
      expect(result[0].deficitQty).toBe(7); // 10 - 3 = 7
    });
  });

  describe('getLogicalReservations', () => {
    it('debe listar reservas logicas de proyectos activos', async () => {
      vi.spyOn(prisma.projectRequirement, 'findMany').mockResolvedValue([
        {
          projectId: 'p-1',
          itemId: 'it-1',
          allocatedQty: 150,
          requiredQty: 500,
          project: { id: 'p-1', name: 'Torre San Isidro' },
          item: { id: 'it-1', sku: 'ACE-01', name: 'Acero Corrugado', baseUnit: 'VARILLA' },
        },
      ] as any);

      const result = await service.getLogicalReservations();

      expect(result.length).toBe(1);
      expect(result[0].projectName).toBe('Torre San Isidro');
      expect(result[0].allocatedQty).toBe(150);
      expect(result[0].requiredQty).toBe(500);
    });
  });
});
