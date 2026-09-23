import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, TransferStatus } from '@prisma/client';
import { TransfersService } from './transfers.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('TransfersService', () => {
  let service: TransfersService;
  let prisma: {
    transfer: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    transferItem: {
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
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
    movement: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      transfer: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      transferItem: {
        create: vi.fn(),
        update: vi.fn(),
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
      movement: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransfersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<TransfersService>(TransfersService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe retornar transferencias paginadas para ADMIN sin restriccion de almacen', async () => {
      const mockTransfers = [
        {
          id: 'tr-1',
          transferNumber: 'TR-2026-00001',
          status: TransferStatus.IN_TRANSIT,
        },
      ];

      prisma.transfer.count.mockResolvedValue(1);
      prisma.transfer.findMany.mockResolvedValue(mockTransfers);

      const result = await service.findAll(
        { page: 1, limit: 10 },
        { id: 'admin-1', role: Role.ADMIN },
      );

      expect(result.data).toEqual(mockTransfers);
      expect(result.meta.total).toBe(1);
      expect(prisma.userWarehouse.findMany).not.toHaveBeenCalled();
    });

    it('debe restringir transferencias para WAREHOUSE_KEEPER a almacenes autorizados', async () => {
      prisma.userWarehouse.findMany.mockResolvedValue([
        { warehouseId: 'wh-dest' },
      ]);
      prisma.transfer.count.mockResolvedValue(0);
      prisma.transfer.findMany.mockResolvedValue([]);

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
    it('debe retornar detalle de transferencia si existe y tiene acceso', async () => {
      const mockTransfer = {
        id: 'tr-1',
        transferNumber: 'TR-2026-00001',
        originWarehouseId: 'wh-orig',
        destWarehouseId: 'wh-dest',
      };
      prisma.transfer.findUnique.mockResolvedValue(mockTransfer);

      const result = await service.findOne('tr-1', {
        id: 'admin-1',
        role: Role.ADMIN,
      });

      expect(result).toEqual(mockTransfer);
    });

    it('debe lanzar NotFoundException si la transferencia no existe', async () => {
      prisma.transfer.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('tr-inexistente', {
          id: 'admin-1',
          role: Role.ADMIN,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ForbiddenException si el WAREHOUSE_KEEPER no tiene acceso ni a origen ni a destino', async () => {
      const mockTransfer = {
        id: 'tr-1',
        transferNumber: 'TR-2026-00001',
        originWarehouseId: 'wh-orig',
        destWarehouseId: 'wh-dest',
      };
      prisma.transfer.findUnique.mockResolvedValue(mockTransfer);
      prisma.userWarehouse.findMany.mockResolvedValue([
        { warehouseId: 'otro-almacen' },
      ]);

      await expect(
        service.findOne('tr-1', {
          id: 'keeper-1',
          role: Role.WAREHOUSE_KEEPER,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('dispatch (Fase 1)', () => {
    const dispatchDto = {
      originWarehouseId: 'wh-orig',
      destWarehouseId: 'wh-dest',
      projectId: 'proj-1',
      dispatchNotes: 'Camioneta ABC-123',
      items: [
        {
          itemId: 'item-1',
          quantity: 50,
        },
      ],
    };

    it('debe lanzar BadRequestException si origen y destino son el mismo almacen', async () => {
      await expect(
        service.dispatch(
          {
            ...dispatchDto,
            originWarehouseId: 'wh-mismo',
            destWarehouseId: 'wh-mismo',
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar NotFoundException si el almacen de origen no existe', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'wh-dest', isActive: true });

      await expect(
        service.dispatch(dispatchDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar NotFoundException si el almacen de destino no existe', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce({ id: 'wh-orig', isActive: true })
        .mockResolvedValueOnce(null);

      await expect(
        service.dispatch(dispatchDto, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si el almacen de origen no esta activo', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce({ id: 'wh-orig', isActive: false })
        .mockResolvedValueOnce({ id: 'wh-dest', isActive: true });

      await expect(
        service.dispatch(dispatchDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si hay items duplicados en la peticion', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce({ id: 'wh-orig', isActive: true })
        .mockResolvedValueOnce({ id: 'wh-dest', isActive: true });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });

      await expect(
        service.dispatch(
          {
            ...dispatchDto,
            items: [
              { itemId: 'item-1', quantity: 10 },
              { itemId: 'item-1', quantity: 20 },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el stock fisico en origen es insuficiente', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce({ id: 'wh-orig', isActive: true })
        .mockResolvedValueOnce({ id: 'wh-dest', isActive: true });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-1', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);
      // Stock fisico disponible es 20, pero se solicitan 50
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-1',
          warehouseId: 'wh-orig',
          physicalQty: 20,
          averageCost: 25.5,
        },
      ]);

      await expect(
        service.dispatch(dispatchDto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe procesar el despacho correctamente, generar correlativo TR y movimiento TRANSFER_DISPATCH', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce({ id: 'wh-orig', isActive: true })
        .mockResolvedValueOnce({ id: 'wh-dest', isActive: true });
      prisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-1', sku: 'CEM-01', name: 'Cemento', baseUnit: 'BOLSA' },
      ]);
      prisma.stock.findMany.mockResolvedValue([
        {
          itemId: 'item-1',
          warehouseId: 'wh-orig',
          physicalQty: 100,
          reservedQty: 30,
          averageCost: 28.0,
        },
      ]);

      const mockCreatedTransfer = {
        id: 'tr-new-1',
        transferNumber: 'TR-2026-00001',
        status: TransferStatus.IN_TRANSIT,
        originWarehouseId: 'wh-orig',
        destWarehouseId: 'wh-dest',
        dispatchedAt: new Date(),
      };
      const mockCreatedItem = {
        id: 'tr-item-1',
        transferId: 'tr-new-1',
        itemId: 'item-1',
        dispatchedQty: 50,
        unitCostSnapshot: 28.0,
      };

      prisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          transfer: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockCreatedTransfer),
          },
          transferItem: {
            create: vi.fn().mockResolvedValue(mockCreatedItem),
          },
          movement: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'mov-1' }),
          },
          projectRequirement: {
            findUnique: vi.fn().mockResolvedValue({
              id: 'req-1',
              allocatedQty: 30,
            }),
            update: vi.fn().mockResolvedValue({}),
          },
          stock: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.dispatch(dispatchDto, 'user-admin');

      expect(result.id).toBe('tr-new-1');
      expect(result.transferNumber).toBe('TR-2026-00001');
      expect(result.status).toBe(TransferStatus.IN_TRANSIT);
      expect(result.movementNumber).toBe('MOV-2026-00001');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].unitCostSnapshot).toBe(28.0);
    });
  });

  describe('receive (Fase 2)', () => {
    const mockPendingTransfer = {
      id: 'tr-1',
      transferNumber: 'TR-2026-00001',
      status: TransferStatus.IN_TRANSIT,
      originWarehouseId: 'wh-orig',
      destWarehouseId: 'wh-dest',
      projectId: 'proj-1',
      items: [
        {
          id: 'tr-item-1',
          itemId: 'item-1',
          dispatchedQty: 100,
          unitCostSnapshot: 30.0,
        },
      ],
      destWarehouse: {
        id: 'wh-dest',
        name: 'Almacen Obra',
      },
    };

    it('debe lanzar NotFoundException si la transferencia no existe', async () => {
      prisma.transfer.findUnique.mockResolvedValue(null);

      await expect(
        service.receive(
          'tr-inexistente',
          { items: [{ transferItemId: 'tr-item-1', receivedQty: 100 }] },
          { id: 'admin-1', role: Role.ADMIN },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar BadRequestException si la transferencia no esta en estado IN_TRANSIT', async () => {
      prisma.transfer.findUnique.mockResolvedValue({
        ...mockPendingTransfer,
        status: TransferStatus.COMPLETED,
      });

      await expect(
        service.receive(
          'tr-1',
          { items: [{ transferItemId: 'tr-item-1', receivedQty: 100 }] },
          { id: 'admin-1', role: Role.ADMIN },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ForbiddenException si el WAREHOUSE_KEEPER no tiene asignado el almacen destino', async () => {
      prisma.transfer.findUnique.mockResolvedValue(mockPendingTransfer);
      prisma.userWarehouse.findMany.mockResolvedValue([
        { warehouseId: 'otro-almacen' },
      ]);

      await expect(
        service.receive(
          'tr-1',
          { items: [{ transferItemId: 'tr-item-1', receivedQty: 100 }] },
          { id: 'keeper-1', role: Role.WAREHOUSE_KEEPER },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('debe lanzar BadRequestException si la cantidad recibida supera la cantidad despachada', async () => {
      prisma.transfer.findUnique.mockResolvedValue(mockPendingTransfer);

      await expect(
        service.receive(
          'tr-1',
          { items: [{ transferItemId: 'tr-item-1', receivedQty: 120 }] },
          { id: 'admin-1', role: Role.ADMIN },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe procesar recepcion conforme al 100% y sellar estado como COMPLETED', async () => {
      prisma.transfer.findUnique.mockResolvedValue(mockPendingTransfer);

      prisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          movement: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'mov-receipt' }),
          },
          transferItem: {
            update: vi.fn().mockResolvedValue({
              id: 'tr-item-1',
              itemId: 'item-1',
              dispatchedQty: 100,
              receivedQty: 100,
              discrepancyQty: 0,
            }),
          },
          stock: {
            findUnique: vi.fn().mockResolvedValue({
              physicalQty: 20,
              averageCost: 25.0,
            }),
            upsert: vi.fn().mockResolvedValue({}),
          },
          transfer: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.receive(
        'tr-1',
        {
          receptionNotes: 'Recepcion completa conforme',
          items: [{ transferItemId: 'tr-item-1', receivedQty: 100 }],
        },
        { id: 'admin-1', role: Role.ADMIN },
      );

      expect(result.status).toBe(TransferStatus.COMPLETED);
      expect(result.receiptMovementNumber).toBe('MOV-2026-00001');
      expect(result.shrinkageMovementNumber).toBeUndefined();
      expect(result.items[0].receivedQty).toBe(100);
      expect(result.items[0].discrepancyQty).toBe(0);
    });

    it('debe procesar recepcion con faltantes, sellar DISCREPANCY y generar SHRINKAGE_EXIT', async () => {
      prisma.transfer.findUnique.mockResolvedValue(mockPendingTransfer);

      let createdMovements: any[] = [];
      prisma.$transaction.mockImplementation(async (callback) => {
        let movSeq = 1;
        const tx = {
          movement: {
            findFirst: vi.fn().mockImplementation(() => {
              if (createdMovements.length === 0) return null;
              return { movementNumber: `MOV-2026-${String(movSeq - 1).padStart(5, '0')}` };
            }),
            create: vi.fn().mockImplementation(({ data }) => {
              movSeq++;
              createdMovements.push(data);
              return { id: `mov-${data.type}` };
            }),
          },
          transferItem: {
            update: vi.fn().mockResolvedValue({
              id: 'tr-item-1',
              itemId: 'item-1',
              dispatchedQty: 100,
              receivedQty: 95,
              discrepancyQty: 5,
            }),
          },
          stock: {
            findUnique: vi.fn().mockResolvedValue(null),
            upsert: vi.fn().mockResolvedValue({}),
          },
          transfer: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      const result = await service.receive(
        'tr-1',
        {
          receptionNotes: '5 bolsas rotas durante transporte',
          items: [{ transferItemId: 'tr-item-1', receivedQty: 95 }],
        },
        { id: 'admin-1', role: Role.ADMIN },
      );

      expect(result.status).toBe(TransferStatus.DISCREPANCY);
      expect(result.receiptMovementNumber).toBe('MOV-2026-00001');
      expect(result.shrinkageMovementNumber).toBe('MOV-2026-00002');
      expect(result.items[0].receivedQty).toBe(95);
      expect(result.items[0].discrepancyQty).toBe(5);
    });
  });
});
