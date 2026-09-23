import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ItemType, MovementType, Role, ToolCondition } from '@prisma/client';
import { ToolCustodyService } from './tool-custody.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('ToolCustodyService', () => {
  let service: ToolCustodyService;
  let prisma: {
    toolCustody: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    userWarehouse: {
      findMany: ReturnType<typeof vi.fn>;
    };
    item: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    stock: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    movement: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      toolCustody: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      userWarehouse: {
        findMany: vi.fn(),
      },
      item: {
        findUnique: vi.fn(),
      },
      stock: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      movement: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolCustodyService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ToolCustodyService>(ToolCustodyService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar vales para usuario ADMIN sin restriccion de almacen', async () => {
      const mockLoans = [
        {
          id: 'vale-1',
          custodyNumber: 'VALE-2026-00001',
          assignedToName: 'Pedro Quispe',
          assignedToDni: '70123456',
        },
      ];

      prisma.toolCustody.count.mockResolvedValue(1);
      prisma.toolCustody.findMany.mockResolvedValue(mockLoans);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { id: 'admin-1', role: Role.ADMIN },
      );

      expect(result.data).toEqual(mockLoans);
      expect(result.meta.total).toBe(1);
    });

    it('debe filtrar por almacenes asignados para WAREHOUSE_KEEPER', async () => {
      prisma.userWarehouse.findMany.mockResolvedValue([
        { warehouseId: 'wh-obra-1' },
      ]);
      prisma.toolCustody.count.mockResolvedValue(0);
      prisma.toolCustody.findMany.mockResolvedValue([]);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { id: 'keeper-1', role: Role.WAREHOUSE_KEEPER },
      );

      expect(result.data).toEqual([]);
      expect(prisma.toolCustody.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            warehouseId: { in: ['wh-obra-1'] },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('debe retornar el detalle de un vale si existe', async () => {
      const mockCustody = {
        id: 'vale-1',
        custodyNumber: 'VALE-2026-00001',
        item: { sku: 'HERR-ROTO-01' },
      };

      prisma.toolCustody.findUnique.mockResolvedValue(mockCustody);

      const result = await service.findOne('vale-1');
      expect(result).toEqual(mockCustody);
    });

    it('debe lanzar NotFoundException si el vale no existe', async () => {
      prisma.toolCustody.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('dispatch - Validaciones', () => {
    const baseDto = {
      warehouseId: 'wh-obra-1',
      itemId: 'item-roto-1',
      quantity: 1,
      assignedToName: 'Pedro Quispe',
      assignedToDni: '70123456',
    };

    it('debe lanzar NotFoundException si el almacen no existe', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.dispatch(baseDto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar BadRequestException si el almacen esta inactivo', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra-1',
        isActive: false,
      });

      await expect(service.dispatch(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar NotFoundException si el item no existe', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra-1',
        isActive: true,
      });
      prisma.item.findUnique.mockResolvedValue(null);

      await expect(service.dispatch(baseDto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe lanzar BadRequestException si el item es de tipo CONSUMABLE', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra-1',
        isActive: true,
      });
      prisma.item.findUnique.mockResolvedValue({
        id: 'item-cemento',
        type: ItemType.CONSUMABLE,
      });

      await expect(service.dispatch(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si el stock disponible en caseta es menor a la cantidad solicitada', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra-1',
        isActive: true,
      });
      prisma.item.findUnique.mockResolvedValue({
        id: 'item-roto-1',
        type: ItemType.ASSET_TOOL,
      });
      // physicalQty: 5, loanedQty: 5 -> disponibles: 0
      prisma.stock.findUnique.mockResolvedValue({
        physicalQty: 5,
        loanedQty: 5,
        averageCost: 450,
      });

      await expect(service.dispatch(baseDto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('dispatch - Flujo Exitoso', () => {
    it('debe despachar herramienta, incrementar loanedQty y generar vale inmutable', async () => {
      const dto = {
        warehouseId: 'wh-obra-1',
        itemId: 'item-roto-1',
        quantity: 2,
        serialOrCode: 'ROTO-BOSCH-01',
        assignedToName: 'Pedro Quispe',
        assignedToDni: '70123456',
        conditionOnDispatch: ToolCondition.OPERATIVE,
      };

      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra-1',
        isActive: true,
      });
      prisma.item.findUnique.mockResolvedValue({
        id: 'item-roto-1',
        type: ItemType.ASSET_TOOL,
      });
      // physicalQty: 5, loanedQty: 1 -> disponibles: 4 >= 2
      prisma.stock.findUnique.mockResolvedValue({
        id: 'stock-1',
        warehouseId: 'wh-obra-1',
        itemId: 'item-roto-1',
        physicalQty: 5,
        loanedQty: 1,
        averageCost: 450,
      });

      const mockTx = {
        toolCustody: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args) => ({
            id: 'vale-1',
            ...args.data,
            item: { sku: 'HERR-ROTO-01', name: 'Rotomartillo' },
            warehouse: { name: 'Almacen Obra 1' },
          })),
        },
        movement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args) => ({
            id: 'mov-1',
            ...args.data,
          })),
        },
        stock: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.dispatch(dto, 'user-keeper-1');

      expect(result.id).toBe('vale-1');
      expect(result.custodyNumber).toMatch(/^VALE-\d{4}-00001$/);
      expect(result.movementNumber).toMatch(/^MOV-\d{4}-00001$/);

      // loanedQty debe ser 1 + 2 = 3
      expect(mockTx.stock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { loanedQty: 3 },
        }),
      );

      // Movimiento LOAN_DISPATCH
      expect(mockTx.movement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MovementType.LOAN_DISPATCH,
            originWarehouseId: 'wh-obra-1',
          }),
        }),
      );
    });
  });

  describe('processReturn', () => {
    it('debe procesar devolucion conforme decrementando unicamente loanedQty y generando LOAN_RETURN', async () => {
      const custody = {
        id: 'vale-1',
        custodyNumber: 'VALE-2026-00001',
        itemId: 'item-roto-1',
        warehouseId: 'wh-obra-1',
        quantity: 1,
        assignedToName: 'Pedro Quispe',
        assignedToDni: '70123456',
        returnDate: null,
      };

      prisma.toolCustody.findUnique.mockResolvedValue(custody);
      prisma.stock.findUnique.mockResolvedValue({
        id: 'stock-1',
        warehouseId: 'wh-obra-1',
        itemId: 'item-roto-1',
        physicalQty: 5,
        loanedQty: 2,
        averageCost: 450,
      });

      const mockTx = {
        toolCustody: {
          update: vi.fn().mockImplementation((args) => ({
            id: 'vale-1',
            custodyNumber: 'VALE-2026-00001',
            ...args.data,
          })),
        },
        movement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
        },
        stock: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.processReturn(
        'vale-1',
        {
          conditionOnReturn: ToolCondition.OPERATIVE,
          returnNotes: 'Devuelto en buen estado',
        },
        'user-keeper-1',
      );

      expect(result.action).toBe('CONFORMING_RETURN');
      // loanedQty se reduce de 2 a 1
      expect(mockTx.stock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { loanedQty: 1 },
        }),
      );

      expect(mockTx.movement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MovementType.LOAN_RETURN,
            destWarehouseId: 'wh-obra-1',
          }),
        }),
      );
    });

    it('debe procesar retorno por extravio (LOST) dando de baja loanedQty y physicalQty, emitiendo SHRINKAGE_EXIT', async () => {
      const custody = {
        id: 'vale-1',
        custodyNumber: 'VALE-2026-00001',
        itemId: 'item-roto-1',
        warehouseId: 'wh-obra-1',
        quantity: 1,
        assignedToName: 'Pedro Quispe',
        assignedToDni: '70123456',
        returnDate: null,
      };

      prisma.toolCustody.findUnique.mockResolvedValue(custody);
      prisma.stock.findUnique.mockResolvedValue({
        id: 'stock-1',
        warehouseId: 'wh-obra-1',
        itemId: 'item-roto-1',
        physicalQty: 5,
        loanedQty: 2,
        averageCost: 450,
      });

      const mockTx = {
        toolCustody: {
          update: vi.fn().mockImplementation((args) => ({
            id: 'vale-1',
            custodyNumber: 'VALE-2026-00001',
            ...args.data,
          })),
        },
        movement: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({}),
        },
        stock: {
          update: vi.fn().mockResolvedValue({}),
        },
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(mockTx);
      });

      const result = await service.processReturn(
        'vale-1',
        {
          conditionOnReturn: ToolCondition.LOST,
          returnNotes: 'Extraviado en obra durante demolicion',
        },
        'user-keeper-1',
      );

      expect(result.action).toBe('PATRIMONIAL_SHRINKAGE');
      // loanedQty se reduce de 2 a 1, physicalQty se reduce de 5 a 4
      expect(mockTx.stock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { loanedQty: 1, physicalQty: 4 },
        }),
      );

      expect(mockTx.movement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: MovementType.SHRINKAGE_EXIT,
            originWarehouseId: 'wh-obra-1',
          }),
        }),
      );
    });

    it('debe lanzar BadRequestException si el vale ya fue devuelto previamente', async () => {
      prisma.toolCustody.findUnique.mockResolvedValue({
        id: 'vale-1',
        returnDate: new Date(),
      });

      await expect(
        service.processReturn(
          'vale-1',
          { conditionOnReturn: ToolCondition.OPERATIVE },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getWorkerDebt', () => {
    it('debe retornar lista de herramientas activas por DNI', async () => {
      const mockLoans = [
        {
          id: 'vale-1',
          custodyNumber: 'VALE-2026-00001',
          quantity: 1,
          serialOrCode: 'ROTO-001',
          assignedToName: 'Pedro Quispe',
          dispatchDate: new Date(),
          expectedReturnDate: new Date(),
          conditionOnDispatch: ToolCondition.OPERATIVE,
          item: { sku: 'HERR-ROTO-01', name: 'Rotomartillo' },
          warehouse: { name: 'Almacen Obra 1' },
        },
      ];

      prisma.toolCustody.findMany.mockResolvedValue(mockLoans);

      const result = await service.getWorkerDebt('70123456');

      expect(result.workerDni).toBe('70123456');
      expect(result.pendingCount).toBe(1);
      expect(result.loans).toHaveLength(1);
    });
  });
});
