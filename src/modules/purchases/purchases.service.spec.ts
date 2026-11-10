import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Currency,
  MovementType,
  WarehouseType,
  Role,
} from '@prisma/client';
import { PurchasesService } from './purchases.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SequenceGeneratorService } from '../../common/services/sequence-generator.service.js';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let sequenceGenerator: {
    getNextCode: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    userWarehouse: {
      findMany: ReturnType<typeof vi.fn>;
    };
    supplier: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    item: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    stock: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      update?: ReturnType<typeof vi.fn>;
    };
    purchaseDetail: {
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update?: ReturnType<typeof vi.fn>;
    };
    purchase: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update?: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    sequenceGenerator = {
      getNextCode: vi.fn().mockImplementation((_tx, prefix, targetYear) => {
        const year = targetYear ?? 2026;
        return `${prefix}-${year}-00001`;
      }),
    };

    prisma = {
      userWarehouse: {
        findMany: vi.fn().mockResolvedValue([{ warehouseId: 'wh-central' }]),
      },
      supplier: {
        findUnique: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      item: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      stock: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      purchaseDetail: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      purchase: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: SequenceGeneratorService,
          useValue: sequenceGenerator,
        },
      ],
    }).compile();

    service = module.get<PurchasesService>(PurchasesService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar listado paginado de facturas de compra', async () => {
      const mockPurchases = [
        {
          id: 'purch-1',
          invoiceSeries: 'F001-001',
          supplier: { id: 'sup-1', businessName: 'ACEROS AREQUIPA' },
          _count: { details: 1, documents: 0 },
        },
      ];

      prisma.purchase.count.mockResolvedValue(1);
      prisma.purchase.findMany.mockResolvedValue(mockPurchases);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toEqual(mockPurchases);
      expect(result.meta.total).toBe(1);
    });

    it('debe filtrar por almacenes autorizados si el usuario es WAREHOUSE_KEEPER', async () => {
      prisma.purchase.count.mockResolvedValue(1);
      prisma.purchase.findMany.mockResolvedValue([]);

      await service.findAll(
        { page: 1, limit: 10 },
        { id: 'user-keeper', role: Role.WAREHOUSE_KEEPER },
      );

      expect(prisma.purchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            warehouseId: { in: ['wh-central'] },
          }),
        }),
      );
    });

    it('debe lanzar ForbiddenException si WAREHOUSE_KEEPER filtra por un almacen no asignado', async () => {
      await expect(
        service.findAll(
          { warehouseId: 'wh-otra-obra' },
          { id: 'user-keeper', role: Role.WAREHOUSE_KEEPER },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('debe retornar el detalle de la compra si existe', async () => {
      const mockPurchase = {
        id: 'purch-1',
        warehouseId: 'wh-central',
        invoiceSeries: 'F001-001',
        details: [],
        supplier: {},
        documents: [],
      };

      prisma.purchase.findUnique.mockResolvedValue(mockPurchase);

      const result = await service.findOne('purch-1');
      expect(result).toEqual(mockPurchase);
    });

    it('debe permitir consultar a WAREHOUSE_KEEPER si la compra pertenece a su sede asignada', async () => {
      const mockPurchase = {
        id: 'purch-1',
        warehouseId: 'wh-central',
        invoiceSeries: 'F001-001',
      };
      prisma.purchase.findUnique.mockResolvedValue(mockPurchase);

      const result = await service.findOne('purch-1', {
        id: 'user-keeper',
        role: Role.WAREHOUSE_KEEPER,
      });
      expect(result).toEqual(mockPurchase);
    });

    it('debe lanzar ForbiddenException si WAREHOUSE_KEEPER consulta una compra de otra sede', async () => {
      const mockPurchase = {
        id: 'purch-2',
        warehouseId: 'wh-otra-obra',
        invoiceSeries: 'F001-002',
      };
      prisma.purchase.findUnique.mockResolvedValue(mockPurchase);

      await expect(
        service.findOne('purch-2', {
          id: 'user-keeper',
          role: Role.WAREHOUSE_KEEPER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe lanzar NotFoundException si la compra no existe', async () => {
      prisma.purchase.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create - Validaciones previas', () => {
    const baseDto = {
      supplierId: 'sup-1',
      centralWarehouseId: 'wh-central',
      invoiceSeries: 'F001-0004523',
      currency: Currency.PEN,
      exchangeRate: 1.0,
      issueDate: '2026-09-22T10:00:00.000Z',
      subtotalPEN: 28500.0,
      igvAmountPEN: 5130.0,
      totalAmountPEN: 33630.0,
      items: [
        {
          itemId: 'item-cemento',
          purchaseUnit: 'BOLSA',
          conversionFactor: 1.0,
          purchaseQty: 1000,
          unitPriceOriginal: 28.5,
        },
      ],
    };

    it('debe lanzar NotFoundException si el proveedor no existe', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(service.create(baseDto, 'user-admin')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar NotFoundException si el almacen no existe', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.create(baseDto, 'user-admin')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe registrar exitosamente compra si el almacen es de tipo PROJECT_SITE', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        type: WarehouseType.PROJECT_SITE,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);

      const mockTx = {
        movement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args) => ({ id: 'mov-1', ...args.data })),
        },
        purchase: {
          create: vi.fn().mockImplementation((args) => ({ id: 'purch-1', ...args.data })),
        },
        purchaseDetail: {
          create: vi.fn().mockImplementation((args) => ({ id: 'detail-1', ...args.data })),
        },
        stock: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => callback(mockTx));

      const result = await service.create(
        { ...baseDto, warehouseId: 'wh-obra', centralWarehouseId: undefined },
        'user-admin',
      );

      expect(result.id).toBe('purch-1');
      expect(mockTx.movement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            destWarehouseId: 'wh-obra',
          }),
        }),
      );
    });

    it('debe lanzar BadRequestException si algun item no existe en catalogo', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([]); // Vacio: item no encontrado

      await expect(service.create(baseDto, 'user-admin')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si hasIgv es false pero igvAmountPEN es mayor a cero', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);

      const invalidDto = {
        ...baseDto,
        hasIgv: false,
        igvAmountPEN: 100,
        subtotalPEN: 1000,
        totalAmountPEN: 1000,
      };

      await expect(service.create(invalidDto, 'user-admin')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si hasIgv es false pero totalAmountPEN difiere de subtotalPEN', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);

      const invalidDto = {
        ...baseDto,
        hasIgv: false,
        igvAmountPEN: 0,
        subtotalPEN: 1000,
        totalAmountPEN: 1180,
      };

      await expect(service.create(invalidDto, 'user-admin')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si hasIgv es true pero totalAmountPEN no coincide con subtotal + igv', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);

      const invalidDto = {
        ...baseDto,
        hasIgv: true,
        subtotalPEN: 1000,
        igvAmountPEN: 180,
        totalAmountPEN: 1500, // Inconsistente
      };

      await expect(service.create(invalidDto, 'user-admin')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('create - Calculo de CPP y Transaccion Atomica', () => {
    it('debe recalcular CPP correctamente cuando existe stock previo', async () => {
      const dto = {
        supplierId: 'sup-1',
        centralWarehouseId: 'wh-central',
        invoiceSeries: 'F001-0004523',
        currency: Currency.PEN,
        exchangeRate: 1.0,
        issueDate: '2026-09-22T10:00:00.000Z',
        subtotalPEN: 28500.0,
        igvAmountPEN: 5130.0,
        totalAmountPEN: 33630.0,
        items: [
          {
            itemId: 'item-cemento',
            purchaseUnit: 'BOLSA',
            conversionFactor: 1.0,
            purchaseQty: 1000,
            unitPriceOriginal: 28.5,
          },
        ],
      };

      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', sku: 'CEM-PORT-T1', name: 'Cemento Portland' },
      ]);

      // Mock de transaccion
      const mockTx = {
        movement: {
          findFirst: vi.fn().mockResolvedValue(null), // Ningun movimiento previo -> MOV-2026-00001
          create: vi.fn().mockImplementation((args) => ({
            id: 'mov-1',
            ...args.data,
          })),
        },
        purchase: {
          create: vi.fn().mockImplementation((args) => ({
            id: 'purch-1',
            ...args.data,
          })),
        },
        purchaseDetail: {
          create: vi.fn().mockImplementation((args) => ({
            id: 'detail-1',
            ...args.data,
          })),
        },
        stock: {
          // Stock previo: 500 bolsas a CPP 27.00
          findUnique: vi.fn().mockResolvedValue({
            warehouseId: 'wh-central',
            itemId: 'item-cemento',
            physicalQty: 500,
            averageCost: 27.0,
          }),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.create(dto, 'user-admin');

      expect(result.id).toBe('purch-1');
      expect(result.movementNumber).toMatch(/^MOV-\d{4}-00001$/);
      // Calculo: ((500 * 27) + (1000 * 28.5)) / (500 + 1000) = (13500 + 28500) / 1500 = 42000 / 1500 = 28.00
      expect(result.details[0].newWarehouseAverageCost).toBe(28.0);
      expect(result.details[0].newWarehousePhysicalQty).toBe(1500);

      // Verificar upsert en stock
      expect(mockTx.stock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            physicalQty: 1500,
            averageCost: 28.0,
          },
        }),
      );

      // Verificar creacion de movimiento inmutable
      expect(mockTx.movement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MovementType.PURCHASE_ENTRY,
            destWarehouseId: 'wh-central',
            originWarehouseId: null,
            userId: 'user-admin',
          }),
        }),
      );
    });

    it('debe calcular CPP directo cuando no existe stock previo (primer ingreso)', async () => {
      const dto = {
        supplierId: 'sup-1',
        centralWarehouseId: 'wh-central',
        invoiceSeries: 'F001-0004524',
        currency: Currency.PEN,
        exchangeRate: 1.0,
        issueDate: '2026-09-22T10:00:00.000Z',
        subtotalPEN: 10000.0,
        totalAmountPEN: 11800.0,
        items: [
          {
            itemId: 'item-disco',
            purchaseUnit: 'UND',
            conversionFactor: 1.0,
            purchaseQty: 200,
            unitPriceOriginal: 50.0,
          },
        ],
      };

      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-disco', sku: 'HERR-DISC-07', name: 'Disco de Corte' },
      ]);

      const mockTx = {
        movement: {
          findFirst: vi.fn().mockResolvedValue({ movementNumber: 'MOV-2026-00001' }),
          create: vi.fn().mockImplementation((args) => ({ id: 'mov-2', ...args.data })),
        },
        purchase: {
          create: vi.fn().mockImplementation((args) => ({ id: 'purch-2', ...args.data })),
        },
        purchaseDetail: {
          create: vi.fn().mockImplementation((args) => ({ id: 'detail-2', ...args.data })),
        },
        stock: {
          findUnique: vi.fn().mockResolvedValue(null), // Sin stock previo
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      sequenceGenerator.getNextCode.mockResolvedValueOnce('MOV-2026-00002');

      const result = await service.create(dto, 'user-admin');

      expect(result.movementNumber).toBe('MOV-2026-00002');
      // Primer ingreso: nuevo CPP = unitCostBasePEN = 50.00
      expect(result.details[0].newWarehouseAverageCost).toBe(50.0);
      expect(result.details[0].newWarehousePhysicalQty).toBe(200);
    });

    it('debe manejar compras en USD aplicando el tipo de cambio', async () => {
      const dto = {
        supplierId: 'sup-1',
        centralWarehouseId: 'wh-central',
        invoiceSeries: 'E001-0001',
        currency: Currency.USD,
        exchangeRate: 3.8, // Tipo de cambio 3.80 PEN por USD
        issueDate: '2026-09-22T10:00:00.000Z',
        subtotalPEN: 3800.0,
        totalAmountPEN: 3800.0,
        items: [
          {
            itemId: 'item-herramienta',
            purchaseUnit: 'UND',
            conversionFactor: 1.0,
            purchaseQty: 10,
            unitPriceOriginal: 100.0, // 100 USD = 380 PEN
          },
        ],
      };

      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-herramienta', sku: 'HERR-ROTO-01', name: 'Rotomartillo' },
      ]);

      const mockTx = {
        movement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args) => ({ id: 'mov-3', ...args.data })),
        },
        purchase: {
          create: vi.fn().mockImplementation((args) => ({ id: 'purch-3', ...args.data })),
        },
        purchaseDetail: {
          create: vi.fn().mockImplementation((args) => ({ id: 'detail-3', ...args.data })),
        },
        stock: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.create(dto, 'user-admin');

      // 100 USD * 3.80 = 380.00 PEN
      expect(result.details[0].unitCostBasePEN).toBe(380.0);
      expect(result.details[0].newWarehouseAverageCost).toBe(380.0);
    });

    it('debe manejar unidades de compra con factor de conversion', async () => {
      const dto = {
        supplierId: 'sup-1',
        centralWarehouseId: 'wh-central',
        invoiceSeries: 'F001-0005',
        currency: Currency.PEN,
        exchangeRate: 1.0,
        issueDate: '2026-09-22T10:00:00.000Z',
        subtotalPEN: 10000.0,
        totalAmountPEN: 11800.0,
        items: [
          {
            itemId: 'item-cemento',
            purchaseUnit: 'PALLET', // 1 PALLET = 40 BOLSAS
            conversionFactor: 40.0,
            purchaseQty: 10, // 10 Pallets = 400 Bolsas
            unitPriceOriginal: 1000.0, // 1000 PEN por Pallet -> 1000 / 40 = 25 PEN por Bolsa
          },
        ],
      };

      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', sku: 'CEM-PORT-T1', name: 'Cemento' },
      ]);

      const mockTx = {
        movement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args) => ({ id: 'mov-4', ...args.data })),
        },
        purchase: {
          create: vi.fn().mockImplementation((args) => ({ id: 'purch-4', ...args.data })),
        },
        purchaseDetail: {
          create: vi.fn().mockImplementation((args) => ({ id: 'detail-4', ...args.data })),
        },
        stock: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.create(dto, 'user-admin');

      expect(result.details[0].baseQty).toBe(400); // 10 * 40
      expect(result.details[0].unitCostBasePEN).toBe(25.0); // 1000 / 40
      expect(result.details[0].newWarehouseAverageCost).toBe(25.0);
    });

    it('debe registrar exitosamente una compra sin IGV con voucherType y computar costo directo integro al CPP', async () => {
      const dto = {
        supplierId: 'sup-1',
        centralWarehouseId: 'wh-central',
        invoiceSeries: 'RH01-00012',
        voucherType: 'RECIBO',
        hasIgv: false,
        currency: Currency.PEN,
        exchangeRate: 1.0,
        issueDate: '2026-09-22T10:00:00.000Z',
        subtotalPEN: 1500.0,
        igvAmountPEN: 0,
        totalAmountPEN: 1500.0,
        items: [
          {
            itemId: 'item-arena',
            purchaseUnit: 'M3',
            conversionFactor: 1.0,
            purchaseQty: 30,
            unitPriceOriginal: 50.0,
          },
        ],
      };

      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-arena', sku: 'MAT-ARE-001', name: 'Arena Gruesa' },
      ]);

      const mockTx = {
        movement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args) => ({ id: 'mov-5', ...args.data })),
        },
        purchase: {
          create: vi.fn().mockImplementation((args) => ({ id: 'purch-5', ...args.data })),
        },
        purchaseDetail: {
          create: vi.fn().mockImplementation((args) => ({ id: 'detail-5', ...args.data })),
        },
        stock: {
          findUnique: vi.fn().mockResolvedValue(null),
          upsert: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.create(dto, 'user-admin');

      expect(result.id).toBe('purch-5');
      expect(result.hasIgv).toBe(false);
      expect(result.voucherType).toBe('RECIBO');
      expect(result.igvAmountPEN).toBe(0);
      expect(result.totalAmountPEN).toBe(1500.0);
      expect(result.details[0].unitCostBasePEN).toBe(50.0);
      expect(result.details[0].newWarehouseAverageCost).toBe(50.0);
    });
  });

  describe('Filtros avanzados en findAll() y Cuadro Comparativo de Precios', () => {
    it('debe filtrar compras por warehouseId, itemId e itemSearch en findAll', async () => {
      prisma.purchase.count.mockResolvedValue(1);
      prisma.purchase.findMany.mockResolvedValue([
        { id: 'purch-1', warehouseId: 'wh-obra', details: [] },
      ]);

      await service.findAll({
        warehouseId: 'wh-obra',
        itemId: 'item-cemento',
        itemSearch: 'cemento',
      });

      expect(prisma.purchase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            warehouseId: 'wh-obra',
            details: expect.objectContaining({
              some: expect.objectContaining({
                itemId: 'item-cemento',
                item: expect.objectContaining({
                  OR: [
                    { name: { contains: 'cemento', mode: 'insensitive' } },
                    { sku: { contains: 'cemento', mode: 'insensitive' } },
                  ],
                }),
              }),
            }),
          }),
        }),
      );
    });

    it('debe lanzar BadRequestException si getPriceComparison no recibe ni itemId ni search', async () => {
      await expect(service.getPriceComparison({})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar NotFoundException si el insumo no existe en el catalogo', async () => {
      vi.spyOn(prisma.item, 'findUnique').mockResolvedValue(null);

      await expect(
        service.getPriceComparison({ itemId: 'item-inexistente' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe generar cuadro comparativo ordenado por unitCostBasePEN ascendente con resumen estadistico', async () => {
      vi.spyOn(prisma.item, 'findUnique').mockResolvedValue({
        id: 'item-cemento',
        sku: 'CEM-01',
        name: 'Cemento Portland Tipo I',
        baseUnit: 'BOLSA',
        type: 'CONSUMABLE',
        isPerishable: true,
        category: null,
      } as any);

      prisma.stock = {
        findMany: vi.fn().mockResolvedValue([
          {
            physicalQty: 100,
            averageCost: 27.5,
            warehouse: { id: 'wh-1', name: 'Central', type: 'CENTRAL' },
          },
        ]),
      } as any;

      prisma.purchaseDetail = {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'pd-1',
            purchaseId: 'p-1',
            purchaseQty: 50,
            purchaseUnit: 'BOLSA',
            conversionFactor: 1,
            baseQty: 50,
            unitPriceOriginal: 26.0,
            unitCostBasePEN: 26.0,
            subtotalPEN: 1300,
            notes: 'Lote A vence 2026-12',
            purchase: {
              id: 'p-1',
              issueDate: new Date('2026-09-01'),
              invoiceSeries: 'F001-01',
              voucherType: 'FACTURA',
              hasIgv: true,
              currency: 'PEN',
              exchangeRate: 1,
              notes: 'Observacion general',
              supplierId: 'sup-1',
              supplier: {
                businessName: 'PROVEEDOR BARATO',
                taxId: '20100000001',
              },
              warehouseId: 'wh-1',
              warehouse: { id: 'wh-1', name: 'Central', type: 'CENTRAL' },
            },
          },
          {
            id: 'pd-2',
            purchaseId: 'p-2',
            purchaseQty: 100,
            purchaseUnit: 'BOLSA',
            conversionFactor: 1,
            baseQty: 100,
            unitPriceOriginal: 29.0,
            unitCostBasePEN: 29.0,
            subtotalPEN: 2900,
            notes: null,
            purchase: {
              id: 'p-2',
              issueDate: new Date('2026-09-10'),
              invoiceSeries: 'F001-02',
              voucherType: 'FACTURA',
              hasIgv: true,
              currency: 'PEN',
              exchangeRate: 1,
              notes: null,
              supplierId: 'sup-2',
              supplier: {
                businessName: 'PROVEEDOR CARO',
                taxId: '20100000002',
              },
              warehouseId: 'wh-1',
              warehouse: { id: 'wh-1', name: 'Central', type: 'CENTRAL' },
            },
          },
        ]),
      } as any;

      const result = await service.getPriceComparison({ itemId: 'item-cemento' });

      expect(result.item.sku).toBe('CEM-01');
      expect(result.summary.totalPurchasesCount).toBe(2);
      expect(result.summary.minUnitCostPEN).toBe(26.0);
      expect(result.summary.maxUnitCostPEN).toBe(29.0);
      expect(result.summary.bestSupplierName).toBe('PROVEEDOR BARATO');
      expect(result.summary.bestSupplierTaxId).toBe('20100000001');
      expect(result.summary.currentWeightedAverageCostPEN).toBe(27.5);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].unitCostBasePEN).toBe(26.0);
      expect(result.entries[0].notes).toBe('Lote A vence 2026-12');
      expect(result.entries[1].unitCostBasePEN).toBe(29.0);
    });
  });

  describe('create - Compras con precio cero y rol WAREHOUSE_KEEPER', () => {
    it('debe rechazar registro si WAREHOUSE_KEEPER no tiene asignado el almacen destino', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-ajeno',
        isActive: true,
      });

      await expect(
        service.create(
          {
            supplierId: 'sup-1',
            warehouseId: 'wh-ajeno',
            invoiceSeries: 'G001-001',
            subtotalPEN: 0,
            totalAmountPEN: 0,
            hasIgv: false,
            issueDate: '2026-09-22T10:00:00.000Z',
            items: [],
          } as any,
          { id: 'user-keeper', role: Role.WAREHOUSE_KEEPER },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe preservar CPP previo cuando una compra ingresa a costo cero (guia de remision)', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);

      const mockTx = {
        purchase: {
          create: vi.fn().mockResolvedValue({
            id: 'purch-zero',
            voucherType: 'GUIA',
            hasIgv: false,
          }),
        },
        purchaseDetail: {
          create: vi.fn().mockResolvedValue({
            id: 'detail-zero',
            notes: null,
          }),
        },
        stock: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'st-1',
            physicalQty: 100,
            averageCost: 28.5,
          }),
          upsert: vi.fn().mockResolvedValue({}),
        },
        movement: {
          create: vi.fn().mockResolvedValue({
            id: 'mov-1',
            movementNumber: 'MOV-2026-00001',
          }),
        },
      };

      prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

      const result = await service.create(
        {
          supplierId: 'sup-1',
          warehouseId: 'wh-central',
          invoiceSeries: 'GR-001',
          voucherType: 'GUIA',
          subtotalPEN: 0,
          totalAmountPEN: 0,
          hasIgv: false,
          issueDate: '2026-09-22T10:00:00.000Z',
          items: [
            {
              itemId: 'item-cemento',
              purchaseUnit: 'BOLSA',
              conversionFactor: 1,
              purchaseQty: 50,
              unitPriceOriginal: 0,
            },
          ],
        } as any,
        { id: 'user-keeper', role: Role.WAREHOUSE_KEEPER },
      );

      // Debe actualizar stock preservando averageCost en 28.5 (no diluido a 19.0)
      expect(mockTx.stock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            physicalQty: 150,
            averageCost: 28.5,
          }),
        }),
      );

      // Para WAREHOUSE_KEEPER no debe exponer newWarehouseAverageCost en details
      expect(result.details[0].newWarehouseAverageCost).toBeUndefined();
      expect(result.details[0].newWarehousePhysicalQty).toBe(150);
    });
  });

  describe('valuatePurchase', () => {
    it('debe lanzar NotFoundException si la compra no existe', async () => {
      prisma.purchase.findUnique.mockResolvedValue(null);

      await expect(
        service.valuatePurchase('p-inexistente', {
          subtotalPEN: 100,
          totalAmountPEN: 118,
          items: [{ detailId: 'd-1', unitPriceOriginal: 10 }],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si la compra ya estaba completamente valorizada', async () => {
      prisma.purchase.findUnique.mockResolvedValue({
        id: 'p-1',
        totalAmountPEN: 118,
        details: [{ id: 'd-1', unitPriceOriginal: 10, subtotalPEN: 100 }],
      });

      await expect(
        service.valuatePurchase('p-1', {
          subtotalPEN: 100,
          totalAmountPEN: 118,
          items: [{ detailId: 'd-1', unitPriceOriginal: 10 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe valorizar compra pendiente y recalcular averageCost en Stock sin duplicar stock fisico', async () => {
      prisma.purchase.findUnique.mockResolvedValue({
        id: 'p-zero',
        invoiceSeries: 'GR-001',
        voucherType: 'GUIA',
        currency: Currency.PEN,
        exchangeRate: 1.0,
        hasIgv: false,
        subtotalPEN: 0,
        totalAmountPEN: 0,
        warehouseId: 'wh-central',
        details: [
          {
            id: 'd-zero',
            itemId: 'item-cemento',
            conversionFactor: 1,
            baseQty: 50,
            unitPriceOriginal: 0,
            subtotalPEN: 0,
          },
        ],
      });

      const mockTx = {
        purchase: {
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({
            id: 'p-zero',
            invoiceSeries: 'F001-00099',
            voucherType: 'FACTURA',
            totalAmountPEN: 1475,
            details: [
              {
                id: 'd-zero',
                unitPriceOriginal: 25,
                unitCostBasePEN: 25,
                subtotalPEN: 1250,
              },
            ],
          }),
        },
        purchaseDetail: {
          update: vi.fn().mockResolvedValue({}),
        },
        stock: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'st-1',
            physicalQty: 150, // 100 previas a 28.5 + 50 que entraron en costo 0
            averageCost: 28.5,
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (cb) => cb(mockTx));

      const result = await service.valuatePurchase('p-zero', {
        invoiceSeries: 'F001-00099',
        voucherType: 'FACTURA',
        hasIgv: true,
        subtotalPEN: 1250,
        igvAmountPEN: 225,
        totalAmountPEN: 1475,
        items: [
          {
            detailId: 'd-zero',
            unitPriceOriginal: 25,
          },
        ],
      });

      // Recalculo: (100 * 28.5 + 50 * 25) / 150 = (2850 + 1250) / 150 = 4100 / 150 = 27.3333
      expect(mockTx.stock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            averageCost: 27.3333,
          }),
        }),
      );
      expect(result.invoiceSeries).toBe('F001-00099');
    });
  });
});
