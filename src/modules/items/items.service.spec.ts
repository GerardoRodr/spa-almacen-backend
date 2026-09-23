import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { ItemsService } from './items.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('ItemsService', () => {
  let service: ItemsService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      item: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      itemAlias: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as PrismaService;

    service = new ItemsService(prisma);
  });

  it('debe listar items con paginacion y metadatos correctos', async () => {
    vi.spyOn(prisma.item, 'count').mockResolvedValue(25);
    vi.spyOn(prisma.item, 'findMany').mockResolvedValue([
      { id: '1', sku: 'CEM-01', name: 'Cemento' },
    ] as any);

    const result = await service.findAll({ page: 2, limit: 10 });

    expect(result.data.length).toBe(1);
    expect(result.meta.total).toBe(25);
    expect(result.meta.totalPages).toBe(3);
    expect(result.meta.page).toBe(2);
  });

  it('debe lanzar ConflictException si el SKU ya existe al crear item', async () => {
    vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({ id: '1' } as any);

    await expect(
      service.create({
        sku: 'cem-01',
        name: 'Cemento',
        baseUnit: 'BOLSA',
        type: ItemType.CONSUMABLE,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('debe calcular totales consolidados de stock en findOne', async () => {
    vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({
      id: 'item-1',
      sku: 'CEM-01',
      name: 'Cemento',
      aliases: [],
      stocks: [
        {
          warehouseId: 'wh-central',
          physicalQty: 100,
          reservedQty: 30,
          loanedQty: 0,
          warehouse: { id: 'wh-central', name: 'Central', type: 'CENTRAL' },
        },
        {
          warehouseId: 'wh-obra',
          physicalQty: 25,
          reservedQty: 0,
          loanedQty: 0,
          warehouse: { id: 'wh-obra', name: 'Obra', type: 'PROJECT_SITE' },
        },
      ],
    } as any);

    const result = await service.findOne('item-1');

    expect(result.totals.totalPhysicalQty).toBe(125);
    expect(result.totals.totalReservedQty).toBe(30);
    expect(result.totals.netAvailableCentralQty).toBe(70);
  });

  it('debe lanzar ConflictException si el alias S10 ya existe al registrar', async () => {
    vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({ id: 'item-1', stocks: [] } as any);
    vi.spyOn(prisma.itemAlias, 'findUnique').mockResolvedValue({ id: 'alias-1' } as any);

    await expect(
      service.createAlias({
        itemId: 'item-1',
        s10RawName: 'CEMENTO PORTLAND TIPO I',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
