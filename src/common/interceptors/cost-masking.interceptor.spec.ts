import { describe, it, expect } from 'vitest';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { Role } from '@prisma/client';
import { CostMaskingInterceptor } from './cost-masking.interceptor.js';

describe('CostMaskingInterceptor', () => {
  const interceptor = new CostMaskingInterceptor();

  const createMockContext = (role?: Role): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user: role ? { role } : undefined,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  const createMockHandler = (data: unknown): CallHandler => {
    return {
      handle: () => of(data),
    };
  };

  it('debe eliminar campos de costo si el usuario es WAREHOUSE_KEEPER', async () => {
    const rawData = {
      id: 'stock-1',
      physicalQty: 100,
      reservedQty: 20,
      averageCost: 45.5,
      item: {
        sku: 'CEM-01',
        name: 'Cemento Portland',
        unitPriceOriginal: 42.0,
      },
      movements: [
        {
          id: 'mov-1',
          quantity: 10,
          unitCostSnapshot: 45.5,
          totalCostSnapshot: 455.0,
        },
      ],
    };

    const context = createMockContext(Role.WAREHOUSE_KEEPER);
    const handler = createMockHandler(rawData);

    interceptor.intercept(context, handler).subscribe((result: any) => {
      expect(result.averageCost).toBeUndefined();
      expect(result.item.unitPriceOriginal).toBeUndefined();
      expect(result.movements[0].unitCostSnapshot).toBeUndefined();
      expect(result.movements[0].totalCostSnapshot).toBeUndefined();
      expect(result.physicalQty).toBe(100);
      expect(result.reservedQty).toBe(20);
      expect(result.item.sku).toBe('CEM-01');
    });
  });

  it('debe mantener campos de costo intactos si el usuario es ADMIN', async () => {
    const rawData = {
      id: 'stock-1',
      physicalQty: 100,
      averageCost: 45.5,
      inventoryValuationPEN: 4550.0,
      toolsInvestmentPEN: 1200.0,
      igvAmountPEN: 819.0,
    };

    const context = createMockContext(Role.ADMIN);
    const handler = createMockHandler(rawData);

    interceptor.intercept(context, handler).subscribe((result: any) => {
      expect(result.averageCost).toBe(45.5);
      expect(result.inventoryValuationPEN).toBe(4550.0);
      expect(result.toolsInvestmentPEN).toBe(1200.0);
      expect(result.igvAmountPEN).toBe(819.0);
      expect(result.physicalQty).toBe(100);
    });
  });

  it('debe purgar metricas de valorizacion e inversion en dashboard para WAREHOUSE_KEEPER', async () => {
    const rawData = {
      totalActiveSkus: 42,
      inventoryValuationPEN: 98500.5,
      toolsInvestmentPEN: 25400.0,
      igvAmountPEN: 15000.0,
      toolsInField: 8,
      criticalItemsCount: 3,
      warehouseId: 'ALL',
      warehouseName: 'Consolidado General (Todas las Sedes)',
    };

    const context = createMockContext(Role.WAREHOUSE_KEEPER);
    const handler = createMockHandler(rawData);

    interceptor.intercept(context, handler).subscribe((result: any) => {
      expect(result.inventoryValuationPEN).toBeUndefined();
      expect(result.toolsInvestmentPEN).toBeUndefined();
      expect(result.igvAmountPEN).toBeUndefined();
      expect(result.totalActiveSkus).toBe(42);
      expect(result.toolsInField).toBe(8);
      expect(result.criticalItemsCount).toBe(3);
      expect(result.warehouseId).toBe('ALL');
    });
  });

  it('debe purgar precios de Matriz de Brechas e insumos S10 para WAREHOUSE_KEEPER', async () => {
    const rawData = {
      projectId: 'proj-1',
      projectName: 'Obra 1',
      analysis: [
        {
          itemId: 'item-1',
          sku: 'CEM-01',
          requiredQty: '1000.0000',
          allocatedQty: '200.0000',
          consumedQty: '300.0000',
          pendingToSupply: '500.0000',
          fulfillmentPercentage: 50.0,
          centralAvailableStock: '400.0000',
          purchaseDeficit: '100.0000',
          minHistoricalUnitCost: '25.5000',
          weightedAverageCost: '26.0000',
          s10BudgetUnitPrice: '27.0000',
        },
      ],
      requirements: [
        {
          id: 'req-1',
          requiredQty: '1000.0000',
          s10UnitPrice: '27.0000',
        },
      ],
    };

    const context = createMockContext(Role.WAREHOUSE_KEEPER);
    const handler = createMockHandler(rawData);

    interceptor.intercept(context, handler).subscribe((result: any) => {
      expect(result.analysis[0].requiredQty).toBe('1000.0000');
      expect(result.analysis[0].minHistoricalUnitCost).toBeUndefined();
      expect(result.analysis[0].weightedAverageCost).toBeUndefined();
      expect(result.analysis[0].s10BudgetUnitPrice).toBeUndefined();
      expect(result.requirements[0].s10UnitPrice).toBeUndefined();
    });
  });
});
