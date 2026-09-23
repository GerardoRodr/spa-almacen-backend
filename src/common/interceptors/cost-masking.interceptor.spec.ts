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
    };

    const context = createMockContext(Role.ADMIN);
    const handler = createMockHandler(rawData);

    interceptor.intercept(context, handler).subscribe((result: any) => {
      expect(result.averageCost).toBe(45.5);
      expect(result.physicalQty).toBe(100);
    });
  });
});
