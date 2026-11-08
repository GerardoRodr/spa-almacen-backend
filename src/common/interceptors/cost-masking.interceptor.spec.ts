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

  it('debe purgar totales y KPIs financieros de presupuesto S10 para WAREHOUSE_KEEPER preservando metadatos', async () => {
    const rawData = {
      id: 'proj-1',
      name: 'Obra Yanivilca',
      budgetCode: '1101024',
      s10Location: 'LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA',
      s10Ubigeo: '131006',
      s10BudgetDate: new Date('2025-11-01T00:00:00.000Z'),
      s10TotalBudget: 3479983.23,
      s10MaterialsBudget: 1135524.35,
      s10EquipmentBudget: 153599.14,
      s10LaborBudget: 1587459.81,
      s10SubcontractsBudget: 603399.93,
      budgetSummary: {
        totalBudgetPEN: 3479983.23,
        materialsBudgetPEN: 1135524.35,
        equipmentBudgetPEN: 153599.14,
        laborBudgetPEN: 1587459.81,
        subcontractsBudgetPEN: 603399.93,
        totalRequiredItemsCount: 48,
        totalDeficitEstimatedCostPEN: 45280.5,
      },
    };

    const context = createMockContext(Role.WAREHOUSE_KEEPER);
    const handler = createMockHandler(rawData);

    interceptor.intercept(context, handler).subscribe((result: any) => {
      // Metadatos preservados
      expect(result.name).toBe('Obra Yanivilca');
      expect(result.budgetCode).toBe('1101024');
      expect(result.s10Location).toBe('LA LIBERTAD - SANTIAGO DE CHUCO - QUIRUVILCA');
      expect(result.s10Ubigeo).toBe('131006');
      expect(result.s10BudgetDate).toBeInstanceOf(Date);
      expect(result.budgetSummary.totalRequiredItemsCount).toBe(48);

      // Campos financieros y montos S10 purgados
      expect(result.s10TotalBudget).toBeUndefined();
      expect(result.s10MaterialsBudget).toBeUndefined();
      expect(result.s10EquipmentBudget).toBeUndefined();
      expect(result.s10LaborBudget).toBeUndefined();
      expect(result.s10SubcontractsBudget).toBeUndefined();
      expect(result.budgetSummary.totalBudgetPEN).toBeUndefined();
      expect(result.budgetSummary.materialsBudgetPEN).toBeUndefined();
      expect(result.budgetSummary.equipmentBudgetPEN).toBeUndefined();
      expect(result.budgetSummary.laborBudgetPEN).toBeUndefined();
      expect(result.budgetSummary.subcontractsBudgetPEN).toBeUndefined();
      expect(result.budgetSummary.totalDeficitEstimatedCostPEN).toBeUndefined();
    });
  });

  it('debe mantener totales y KPIs financieros de presupuesto S10 intactos para ADMIN', async () => {
    const rawData = {
      id: 'proj-1',
      s10TotalBudget: 3479983.23,
      s10MaterialsBudget: 1135524.35,
      budgetSummary: {
        totalBudgetPEN: 3479983.23,
        totalDeficitEstimatedCostPEN: 45280.5,
      },
    };

    const context = createMockContext(Role.ADMIN);
    const handler = createMockHandler(rawData);

    interceptor.intercept(context, handler).subscribe((result: any) => {
      expect(result.s10TotalBudget).toBe(3479983.23);
      expect(result.s10MaterialsBudget).toBe(1135524.35);
      expect(result.budgetSummary.totalBudgetPEN).toBe(3479983.23);
      expect(result.budgetSummary.totalDeficitEstimatedCostPEN).toBe(45280.5);
    });
  });
});
