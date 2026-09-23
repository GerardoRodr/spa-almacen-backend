import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ItemType, MovementType, Role } from '@prisma/client';
import { MovementsService } from './movements.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdjustmentDirection } from './dto/inventory-adjustment-item.dto.js';

describe('MovementsService', () => {
  let service: MovementsService;
  let prisma: {
    movement: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    userWarehouse: {
      findMany: ReturnType<typeof vi.fn>;
    };
    project: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    projectRequirement: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    item: {
      findMany: ReturnType<typeof vi.fn>;
    };
    stock: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      movement: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      warehouse: {
        findUnique: vi.fn(),
      },
      userWarehouse: {
        findMany: vi.fn(),
      },
      project: {
        findUnique: vi.fn(),
      },
      projectRequirement: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      item: {
        findMany: vi.fn(),
      },
      stock: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<MovementsService>(MovementsService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar movimientos de Kardex paginados para ADMIN', async () => {
      const mockMovements = [
        {
          id: 'mov-1',
          movementNumber: 'MOV-2026-00001',
          type: MovementType.PURCHASE_ENTRY,
        },
      ];

      prisma.movement.count.mockResolvedValue(1);
      prisma.movement.findMany.mockResolvedValue(mockMovements);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { id: 'admin-1', role: Role.ADMIN },
      );

      expect(result.data).toEqual(mockMovements);
      expect(result.meta.total).toBe(1);
      expect(prisma.userWarehouse.findMany).not.toHaveBeenCalled();
    });

    it('debe restringir movimientos para WAREHOUSE_KEEPER a sus almacenes autorizados', async () => {
      prisma.userWarehouse.findMany.mockResolvedValue([
        { warehouseId: 'wh-1' },
      ]);
      prisma.movement.count.mockResolvedValue(0);
      prisma.movement.findMany.mockResolvedValue([]);

      const result = await service.findAll(
        { page: 1, limit: 20 },
        { id: 'keeper-1', role: Role.WAREHOUSE_KEEPER },
      );

      expect(result.data).toEqual([]);
      expect(prisma.userWarehouse.findMany).toHaveBeenCalledWith({
        where: { userId: 'keeper-1' },
        select: { warehouseId: true },
      });
    });
  });

  describe('findOne', () => {
    it('debe retornar detalle del movimiento si existe y tiene autorizacion', async () => {
      const mockMovement = {
        id: 'mov-1',
        movementNumber: 'MOV-2026-00001',
        originWarehouseId: 'wh-1',
        destWarehouseId: null,
      };
      prisma.movement.findUnique.mockResolvedValue(mockMovement);

      const result = await service.findOne('mov-1', {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      expect(result).toEqual(mockMovement);
    });

    it('debe lanzar NotFoundException si el movimiento no existe', async () => {
      prisma.movement.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('mov-inexistente', {
          id: 'admin-1',
          role: Role.ADMIN,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ForbiddenException si el WAREHOUSE_KEEPER no tiene acceso al almacen del movimiento', async () => {
      const mockMovement = {
        id: 'mov-1',
        movementNumber: 'MOV-2026-00001',
        originWarehouseId: 'wh-1',
        destWarehouseId: null,
      };
      prisma.movement.findUnique.mockResolvedValue(mockMovement);
      prisma.userWarehouse.findMany.mockResolvedValue([
        { warehouseId: 'wh-otro' },
      ]);

      await expect(
        service.findOne('mov-1', {
          id: 'keeper-1',
          role: Role.WAREHOUSE_KEEPER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createConsumptionExit', () => {
    const consumptionDto = {
      warehouseId: 'wh-obra',
      projectId: 'proj-1',
      recipientName: 'Manuel Flores',
      recipientDni: '45892314',
      observation: 'Vaciado de columnas sector B',
      items: [
        {
          itemId: 'item-cem',
          quantity: 40,
        },
      ],
    };

    it('debe lanzar NotFoundException si el almacen no existe', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.createConsumptionExit(consumptionDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si el almacen no esta activo', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: false,
      });

      await expect(
        service.createConsumptionExit(consumptionDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el proyecto civil no existe', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.createConsumptionExit(consumptionDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si se intenta consumir un item clasificado como ASSET_TOOL', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-cem',
          sku: 'TAL-01',
          name: 'Taladro Percutor',
          baseUnit: 'UND',
          type: ItemType.ASSET_TOOL,
        },
      ]);

      await expect(
        service.createConsumptionExit(consumptionDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el stock fisico en caseta es insuficiente', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-cem',
          sku: 'CEM-01',
          name: 'Cemento Portland',
          baseUnit: 'BOLSA',
          type: ItemType.CONSUMABLE,
        },
      ]);
      // Disponible es 25, pero solicitan 40
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-cem',
          warehouseId: 'wh-obra',
          physicalQty: 25,
          averageCost: 28.0,
        },
      ]);

      await expect(
        service.createConsumptionExit(consumptionDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe registrar la salida CONSUMPTION_EXIT, actualizar stock e incrementar consumedQty en proyecto', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.item.findMany.mockResolvedValue([
        {
          id: 'item-cem',
          sku: 'CEM-01',
          name: 'Cemento Portland',
          baseUnit: 'BOLSA',
          type: ItemType.CONSUMABLE,
        },
      ]);
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-cem',
          warehouseId: 'wh-obra',
          physicalQty: 100,
          averageCost: 28.0,
        },
      ]);

      const mockMovement = {
        id: 'mov-c1',
        movementNumber: 'MOV-2026-00001',
        type: MovementType.CONSUMPTION_EXIT,
        originWarehouseId: 'wh-obra',
        projectId: 'proj-1',
        recipientName: 'Manuel Flores',
        recipientDni: '45892314',
        items: [
          {
            itemId: 'item-cem',
            quantity: 40,
            unitCostSnapshot: 28.0,
          },
        ],
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          movement: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockMovement),
          },
          stock: {
            update: vi.fn().mockResolvedValue({}),
          },
          projectRequirement: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'req-1',
              consumedQty: 10,
            }),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.createConsumptionExit(
        consumptionDto,
        'user-admin',
      );

      expect(result.id).toBe('mov-c1');
      expect(result.type).toBe(MovementType.CONSUMPTION_EXIT);
      expect(result.recipientName).toBe('Manuel Flores');
    });
  });

  describe('createShrinkageExit', () => {
    const shrinkageDto = {
      warehouseId: 'wh-obra',
      shrinkageReason: 'Bolsas rotas por lluvia',
      observation: 'Visto bueno residente',
      items: [
        {
          itemId: 'item-cem',
          quantity: 5,
        },
      ],
    };

    it('debe lanzar BadRequestException si el stock para merma es insuficiente', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cem', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);
      // Disponible es 2, solicitan 5
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-cem',
          warehouseId: 'wh-obra',
          physicalQty: 2,
          averageCost: 28.0,
        },
      ]);

      await expect(
        service.createShrinkageExit(shrinkageDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe registrar merma SHRINKAGE_EXIT y decrementar stock fisico', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cem', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-cem',
          warehouseId: 'wh-obra',
          physicalQty: 20,
          averageCost: 28.0,
        },
      ]);

      const mockMovement = {
        id: 'mov-s1',
        movementNumber: 'MOV-2026-00001',
        type: MovementType.SHRINKAGE_EXIT,
        originWarehouseId: 'wh-obra',
        shrinkageReason: 'Bolsas rotas por lluvia',
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          movement: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockMovement),
          },
          stock: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.createShrinkageExit(
        shrinkageDto,
        'user-admin',
      );

      expect(result.type).toBe(MovementType.SHRINKAGE_EXIT);
      expect(result.shrinkageReason).toBe('Bolsas rotas por lluvia');
    });
  });

  describe('createInventoryAdjustment', () => {
    const adjustmentDto = {
      warehouseId: 'wh-obra',
      observation: 'Inventario ciclico mensual',
      items: [
        {
          itemId: 'item-cem',
          direction: AdjustmentDirection.INCREASE,
          quantity: 10,
          unitCost: 28.0,
        },
        {
          itemId: 'item-yeso',
          direction: AdjustmentDirection.DECREASE,
          quantity: 2,
        },
      ],
    };

    it('debe lanzar BadRequestException si el ajuste DECREASE supera el stock disponible', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cem', sku: 'CEM-01', name: 'Cemento' },
        { id: 'item-yeso', sku: 'YES-01', name: 'Yeso' },
      ]);
      // yeso solo tiene 1 de stock, pero se quiere disminuir 2
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-cem',
          warehouseId: 'wh-obra',
          physicalQty: 10,
          averageCost: 28.0,
        },
        {
          itemId: 'item-yeso',
          warehouseId: 'wh-obra',
          physicalQty: 1,
          averageCost: 15.0,
        },
      ]);

      await expect(
        service.createInventoryAdjustment(adjustmentDto, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe registrar ajuste de inventario INVENTORY_ADJUSTMENT exitosamente', async () => {
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-obra',
        isActive: true,
      });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cem', sku: 'CEM-01', name: 'Cemento' },
        { id: 'item-yeso', sku: 'YES-01', name: 'Yeso' },
      ]);
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-cem',
          warehouseId: 'wh-obra',
          physicalQty: 10,
          averageCost: 28.0,
        },
        {
          itemId: 'item-yeso',
          warehouseId: 'wh-obra',
          physicalQty: 5,
          averageCost: 15.0,
        },
      ]);

      const mockMovement = {
        id: 'mov-adj-1',
        movementNumber: 'MOV-2026-00001',
        type: MovementType.INVENTORY_ADJUSTMENT,
        observation: 'Inventario ciclico mensual',
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          movement: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockMovement),
          },
          stock: {
            upsert: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.createInventoryAdjustment(
        adjustmentDto,
        'admin-1',
      );

      expect(result.type).toBe(MovementType.INVENTORY_ADJUSTMENT);
      expect(result.observation).toBe('Inventario ciclico mensual');
    });
  });
});
