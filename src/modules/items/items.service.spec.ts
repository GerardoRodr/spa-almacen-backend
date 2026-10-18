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
      itemCategory: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
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

  it('debe registrar un nuevo item exitosamente con isPerishable y tipo TOOL', async () => {
    vi.spyOn(prisma.item, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.item, 'create').mockResolvedValue({
      id: 'tool-1',
      sku: 'HER-PAL-01',
      name: 'Pala Tramontina',
      baseUnit: 'UNIDAD',
      type: ItemType.TOOL,
      minStockAlert: 5,
      isPerishable: false,
    } as any);

    const result = await service.create({
      sku: 'her-pal-01',
      name: 'Pala Tramontina',
      baseUnit: 'UNIDAD',
      type: ItemType.TOOL,
      minStockAlert: 5,
      isPerishable: false,
    });

    expect(result.id).toBe('tool-1');
    expect(prisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sku: 'HER-PAL-01',
        type: ItemType.TOOL,
        isPerishable: false,
      }),
      include: {
        category: true,
      },
    });
  });

  it('debe aplicar filtro por isPerishable en findAll', async () => {
    vi.spyOn(prisma.item, 'count').mockResolvedValue(3);
    vi.spyOn(prisma.item, 'findMany').mockResolvedValue([] as any);

    await service.findAll({ isPerishable: true });

    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPerishable: true,
        }),
      }),
    );
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

  it('debe obtener alertas de insumos perecibles con stock activo y metadatos de compra', async () => {
    const mockPerishableItem = {
      id: 'item-perishable-1',
      sku: 'ADI-01',
      name: 'Aditivo Plastificante Acelerante',
      baseUnit: 'GLN',
      type: ItemType.CONSUMABLE,
      minStockAlert: 10,
      isPerishable: true,
      stocks: [
        {
          id: 'stock-1',
          warehouseId: 'wh-1',
          physicalQty: 25,
          averageCost: 45.0,
          warehouse: { id: 'wh-1', name: 'Almacen Central', type: 'CENTRAL' },
        },
      ],
      purchaseDetails: [
        {
          purchase: {
            id: 'purch-1',
            invoiceSeries: 'F001-0001',
            issueDate: new Date('2026-09-01T00:00:00Z'),
            supplier: { id: 'sup-1', businessName: 'Quimicos de la Construccion SAC' },
          },
        },
      ],
    };

    vi.spyOn(prisma.item, 'findMany').mockResolvedValue([mockPerishableItem] as any);

    const alerts = await service.getPerishableAlerts('wh-1');

    expect(alerts.length).toBe(1);
    expect(alerts[0].sku).toBe('ADI-01');
    expect(alerts[0].isPerishable).toBe(true);
    expect(alerts[0].totalPhysicalQty).toBe(25);
    expect(alerts[0].lastSupplier).toBe('Quimicos de la Construccion SAC');
    expect(alerts[0].lastInvoiceSeries).toBe('F001-0001');
    expect(alerts[0].daysInStorage).toBeGreaterThan(0);
    expect(alerts[0].stocks.length).toBe(1);
    expect(alerts[0].stocks[0].physicalQty).toBe(25);
  });

  describe('ItemCategory CRUD y vinculo con Items', () => {
    it('debe filtrar items por categoryId en findAll', async () => {
      vi.spyOn(prisma.item, 'count').mockResolvedValue(2);
      vi.spyOn(prisma.item, 'findMany').mockResolvedValue([
        { id: '1', sku: 'CEM-01', categoryId: 'cat-1' },
      ] as any);

      await service.findAll({ categoryId: 'cat-1' });

      expect(prisma.item.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 'cat-1',
          }),
        }),
      );
    });

    it('debe listar clasificaciones activas por defecto', async () => {
      const mockCategories = [
        { id: 'cat-1', name: 'Agregados', isActive: true, _count: { items: 5 } },
      ];
      vi.spyOn(prisma.itemCategory, 'findMany').mockResolvedValue(mockCategories as any);

      const result = await service.findAllCategories();

      expect(result).toEqual(mockCategories);
      expect(prisma.itemCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
        }),
      );
    });

    it('debe listar todas las clasificaciones cuando includeInactive es true', async () => {
      vi.spyOn(prisma.itemCategory, 'findMany').mockResolvedValue([] as any);

      await service.findAllCategories(true);

      expect(prisma.itemCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('debe crear una clasificacion exitosamente', async () => {
      vi.spyOn(prisma.itemCategory, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.itemCategory, 'create').mockResolvedValue({
        id: 'cat-1',
        name: 'Arrendamiento',
        code: 'CAT-ARREND',
        description: 'Servicios de maquinaria',
        isActive: true,
      } as any);

      const result = await service.createCategory({
        name: 'Arrendamiento',
        code: 'cat-arrend',
        description: 'Servicios de maquinaria',
      });

      expect(result.id).toBe('cat-1');
      expect(prisma.itemCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Arrendamiento',
          code: 'CAT-ARREND',
        }),
      });
    });

    it('debe lanzar ConflictException al crear clasificacion con nombre duplicado', async () => {
      vi.spyOn(prisma.itemCategory, 'findUnique').mockResolvedValue({
        id: 'cat-existente',
        name: 'Arrendamiento',
      } as any);

      await expect(
        service.createCategory({
          name: 'Arrendamiento',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('debe eliminar fisicamente clasificacion si no tiene items asociados', async () => {
      vi.spyOn(prisma.itemCategory, 'findUnique').mockResolvedValue({
        id: 'cat-1',
        _count: { items: 0 },
      } as any);
      vi.spyOn(prisma.itemCategory, 'delete').mockResolvedValue({ id: 'cat-1' } as any);

      const result = await service.removeCategory('cat-1');

      expect(result.action).toBe('DELETED');
      expect(prisma.itemCategory.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
    });

    it('debe desactivar logicamente clasificacion si tiene items asociados', async () => {
      vi.spyOn(prisma.itemCategory, 'findUnique').mockResolvedValue({
        id: 'cat-1',
        _count: { items: 3 },
      } as any);
      vi.spyOn(prisma.itemCategory, 'update').mockResolvedValue({
        id: 'cat-1',
        isActive: false,
      } as any);

      const result = await service.removeCategory('cat-1');

      expect(result.action).toBe('DEACTIVATED');
      expect(prisma.itemCategory.update).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        data: { isActive: false },
      });
    });
  });
});
