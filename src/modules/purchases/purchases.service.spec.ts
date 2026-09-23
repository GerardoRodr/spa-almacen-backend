import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Currency, MovementType, WarehouseType } from '@prisma/client';
import { PurchasesService } from './purchases.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let prisma: {
    supplier: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    item: {
      findMany: ReturnType<typeof vi.fn>;
    };
    purchase: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      supplier: {
        findUnique: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      item: {
        findMany: vi.fn(),
      },
      purchase: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
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
  });

  describe('findOne', () => {
    it('debe retornar el detalle de la compra si existe', async () => {
      const mockPurchase = {
        id: 'purch-1',
        invoiceSeries: 'F001-001',
        details: [],
        supplier: {},
        documents: [],
      };

      prisma.purchase.findUnique.mockResolvedValue(mockPurchase);

      const result = await service.findOne('purch-1');
      expect(result).toEqual(mockPurchase);
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

    it('debe lanzar BadRequestException si el almacen no es de tipo CENTRAL', async () => {
      prisma.supplier.findUnique.mockResolvedValue({ id: 'sup-1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        type: WarehouseType.PROJECT_SITE,
        isActive: true,
      });

      await expect(service.create(baseDto, 'user-admin')).rejects.toThrow(
        BadRequestException,
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
  });
});
