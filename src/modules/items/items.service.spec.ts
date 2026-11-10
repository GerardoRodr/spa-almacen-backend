import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { ItemType, MeterType } from '@prisma/client';
import { ItemsService } from './items.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SequenceGeneratorService } from '../../common/services/sequence-generator.service.js';

describe('ItemsService', () => {
  let service: ItemsService;
  let prisma: PrismaService;
  let sequenceGenerator: SequenceGeneratorService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn((cb: any) => cb(prisma)),
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
      measurementUnit: {
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ code: 'BOLSA', name: 'Bolsa', isActive: true }),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      stock: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      movement: {
        create: vi.fn(),
      },
      movementItem: {
        count: vi.fn().mockResolvedValue(0),
      },
      purchaseDetail: {
        count: vi.fn().mockResolvedValue(0),
      },
      transferItem: {
        count: vi.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;

    sequenceGenerator = {
      previewNextItemSku: vi.fn().mockResolvedValue({ sku: 'MAT-0001', prefix: 'MAT' }),
      getNextItemSku: vi.fn().mockResolvedValue('MAT-0001'),
    } as unknown as SequenceGeneratorService;

    service = new ItemsService(prisma, sequenceGenerator);
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
        meterType: null,
        isPerishable: false,
      }),
      include: {
        category: true,
      },
    });
  });

  it('debe asignar meterType HOUR_METER por defecto al crear una MACHINERY sin meterType explicito', async () => {
    vi.spyOn(prisma.item, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.item, 'create').mockResolvedValue({
      id: 'maq-1',
      sku: 'MAQ-RET-01',
      name: 'Retroexcavadora',
      baseUnit: 'UNIDAD',
      type: ItemType.MACHINERY,
      meterType: MeterType.HOUR_METER,
      minStockAlert: 1,
      isPerishable: false,
    } as any);

    const result = await service.create({
      sku: 'maq-ret-01',
      name: 'Retroexcavadora',
      baseUnit: 'UNIDAD',
      type: ItemType.MACHINERY,
      minStockAlert: 1,
    });

    expect(result.meterType).toBe(MeterType.HOUR_METER);
    expect(prisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sku: 'MAQ-RET-01',
        type: ItemType.MACHINERY,
        meterType: MeterType.HOUR_METER,
      }),
      include: {
        category: true,
      },
    });
  });

  it('debe permitir crear una MACHINERY con meterType KILOMETER', async () => {
    vi.spyOn(prisma.item, 'findUnique').mockResolvedValue(null);
    vi.spyOn(prisma.item, 'create').mockResolvedValue({
      id: 'maq-2',
      sku: 'MAQ-VOL-01',
      name: 'Camion Volquete',
      baseUnit: 'UNIDAD',
      type: ItemType.MACHINERY,
      meterType: MeterType.KILOMETER,
      minStockAlert: 1,
      isPerishable: false,
    } as any);

    const result = await service.create({
      sku: 'maq-vol-01',
      name: 'Camion Volquete',
      baseUnit: 'UNIDAD',
      type: ItemType.MACHINERY,
      meterType: MeterType.KILOMETER,
      minStockAlert: 1,
    });

    expect(result.meterType).toBe(MeterType.KILOMETER);
    expect(prisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sku: 'MAQ-VOL-01',
        type: ItemType.MACHINERY,
        meterType: MeterType.KILOMETER,
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

  describe('Actualizacion de baseUnit y control de doble confirmacion', () => {
    it('debe lanzar BadRequestException (REQUIRES_DOUBLE_CONFIRMATION) si el item tiene stock > 0 y no se envia confirmUnitChange', async () => {
      vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({
        id: 'item-1',
        sku: 'CEM-01',
        name: 'Cemento',
        baseUnit: 'BOLSA',
        type: ItemType.CONSUMABLE,
        stocks: [],
      } as any);
      vi.spyOn(prisma.stock, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
        code: 'KG',
        name: 'Kilogramo',
        isActive: true,
      } as any);

      await expect(
        service.update('item-1', {
          baseUnit: 'KG',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe permitir cambiar baseUnit si se envia confirmUnitChange: true aunque tenga movimientos o stock', async () => {
      vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({
        id: 'item-1',
        sku: 'CEM-01',
        name: 'Cemento',
        baseUnit: 'BOLSA',
        type: ItemType.CONSUMABLE,
        stocks: [],
      } as any);
      vi.spyOn(prisma.stock, 'count').mockResolvedValue(2);
      vi.spyOn(prisma.movementItem, 'count').mockResolvedValue(5);
      vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
        code: 'KG',
        name: 'Kilogramo',
        isActive: true,
      } as any);
      vi.spyOn(prisma.item, 'update').mockResolvedValue({
        id: 'item-1',
        baseUnit: 'KG',
      } as any);

      const result = await service.update('item-1', {
        baseUnit: 'KG',
        confirmUnitChange: true,
      });

      expect(result.baseUnit).toBe('KG');
      expect(prisma.item.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({
            baseUnit: 'KG',
          }),
        }),
      );
    });

    it('debe permitir cambiar baseUnit sin confirmUnitChange si el item no tiene transacciones ni existencias', async () => {
      vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({
        id: 'item-new',
        sku: 'NEW-01',
        name: 'Insumo Nuevo',
        baseUnit: 'UND',
        type: ItemType.CONSUMABLE,
        stocks: [],
      } as any);
      vi.spyOn(prisma.stock, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.movementItem, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.purchaseDetail, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.transferItem, 'count').mockResolvedValue(0);
      vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
        code: 'CIENTO',
        name: 'Ciento',
        isActive: true,
      } as any);
      vi.spyOn(prisma.item, 'update').mockResolvedValue({
        id: 'item-new',
        baseUnit: 'CIENTO',
      } as any);

      const result = await service.update('item-new', {
        baseUnit: 'CIENTO',
      });

      expect(result.baseUnit).toBe('CIENTO');
    });

    it('debe lanzar BadRequestException si la unidad de medida seleccionada esta inactiva en el catalogo', async () => {
      vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({
        id: 'item-1',
        baseUnit: 'BOLSA',
        type: ItemType.CONSUMABLE,
        stocks: [],
      } as any);
      vi.spyOn(prisma.measurementUnit, 'findUnique').mockResolvedValue({
        code: 'DESUSO',
        name: 'En Desuso',
        isActive: false,
      } as any);

      await expect(
        service.update('item-1', {
          baseUnit: 'DESUSO',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
