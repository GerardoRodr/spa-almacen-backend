import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Role, WarehouseType } from '@prisma/client';
import { WarehousesService } from './warehouses.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('WarehousesService', () => {
  let service: WarehousesService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      warehouse: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      stock: {
        findMany: vi.fn(),
      },
    } as unknown as PrismaService;

    service = new WarehousesService(prisma);
  });

  it('debe listar todos los almacenes si el usuario es ADMIN', async () => {
    const findManySpy = vi.spyOn(prisma.warehouse, 'findMany').mockResolvedValue([
      { id: 'wh-1', name: 'Central' },
      { id: 'wh-2', name: 'Obra 1' },
    ] as any);

    const result = await service.findAll({ id: 'admin-1', role: Role.ADMIN });

    expect(result.length).toBe(2);
    expect(findManySpy).toHaveBeenCalledWith({
      include: expect.any(Object),
      orderBy: expect.any(Object),
    });
  });

  it('debe filtrar almacenes por usuario si el rol es WAREHOUSE_KEEPER', async () => {
    const findManySpy = vi.spyOn(prisma.warehouse, 'findMany').mockResolvedValue([
      { id: 'wh-1', name: 'Central' },
    ] as any);

    const result = await service.findAll({
      id: 'keeper-1',
      role: Role.WAREHOUSE_KEEPER,
    });

    expect(result.length).toBe(1);
    expect(findManySpy).toHaveBeenCalledWith({
      where: {
        users: { some: { userId: 'keeper-1' } },
        isActive: true,
      },
      include: expect.any(Object),
      orderBy: expect.any(Object),
    });
  });

  it('debe lanzar ConflictException si el nombre del almacen ya existe al crear', async () => {
    vi.spyOn(prisma.warehouse, 'findFirst').mockResolvedValue({ id: 'wh-1' } as any);

    await expect(
      service.create({
        name: 'Almacen Repetido',
        type: WarehouseType.CENTRAL,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('debe calcular alertas de stock critico correctamente', async () => {
    vi.spyOn(prisma.warehouse, 'findUnique').mockResolvedValue({ id: 'wh-1' } as any);
    vi.spyOn(prisma.stock, 'findMany').mockResolvedValue([
      {
        id: 's-1',
        warehouseId: 'wh-1',
        itemId: 'item-1',
        physicalQty: 5,
        item: {
          id: 'item-1',
          sku: 'CEM-01',
          name: 'Cemento',
          baseUnit: 'BOLSA',
          type: 'CONSUMABLE',
          minStockAlert: 10,
        },
      },
      {
        id: 's-2',
        warehouseId: 'wh-1',
        itemId: 'item-2',
        physicalQty: 25,
        item: {
          id: 'item-2',
          sku: 'ARE-01',
          name: 'Arena',
          baseUnit: 'M3',
          type: 'CONSUMABLE',
          minStockAlert: 10,
        },
      },
    ] as any);

    const alerts = await service.getAlerts('wh-1');

    expect(alerts.length).toBe(1);
    expect(alerts[0].sku).toBe('CEM-01');
    expect(alerts[0].deficitQty).toBe(5);
  });
});
