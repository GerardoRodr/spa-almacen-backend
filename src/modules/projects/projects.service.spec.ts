import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectStatus,
  Role,
  WarehouseType,
  TransferStatus,
  ItemType,
} from '@prisma/client';
import { ProjectsService } from './projects.service.js';
import { S10ParserService } from './s10-parser.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('ProjectsService', () => {
  let service: ProjectsService;
  let s10ParserService: S10ParserService;
  let prisma: {
    project: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    warehouse: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    userWarehouse: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    projectRequirement: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    item: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
    itemAlias: {
      findMany: ReturnType<typeof vi.fn>;
    };
    stock: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    toolCustody: {
      count: ReturnType<typeof vi.fn>;
    };
    transfer: {
      count: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      project: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      warehouse: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      userWarehouse: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      projectRequirement: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      item: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      itemAlias: {
        findMany: vi.fn(),
      },
      stock: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      toolCustody: {
        count: vi.fn(),
      },
      transfer: {
        count: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    s10ParserService = new S10ParserService();
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      s10ParserService,
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('debe listar todas las obras si el usuario es ADMIN', async () => {
      prisma.project.findMany.mockResolvedValue([
        { id: 'p1', name: 'Obra 1', status: ProjectStatus.ACTIVE },
      ]);

      const result = await service.findAll({}, { id: 'admin1', role: Role.ADMIN });
      expect(result).toHaveLength(1);
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          warehouse: { select: { id: true, name: true, type: true, isActive: true } },
          _count: { select: { requirements: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('debe restringir por almacenes asignados si es WAREHOUSE_KEEPER', async () => {
      prisma.userWarehouse.findMany.mockResolvedValue([{ warehouseId: 'wh-1' }]);
      prisma.project.findMany.mockResolvedValue([]);

      await service.findAll({}, { id: 'keeper1', role: Role.WAREHOUSE_KEEPER });
      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: {
          warehouse: {
            id: { in: ['wh-1'] },
          },
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('debe retornar detalle de proyecto para ADMIN', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        name: 'Obra 1',
        warehouse: { id: 'wh-1', name: 'Almacen Obra 1' },
        requirements: [],
      });

      const res = await service.findOne('p1', { id: 'admin1', role: Role.ADMIN });
      expect(res.id).toBe('p1');
    });

    it('debe lanzar NotFoundException si el proyecto no existe', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(
        service.findOne('p-none', { id: 'admin1', role: Role.ADMIN }),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe lanzar ForbiddenException si el almacenero no tiene acceso al almacen de la obra', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        name: 'Obra 1',
        warehouse: { id: 'wh-1' },
      });
      prisma.userWarehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('p1', { id: 'k1', role: Role.WAREHOUSE_KEEPER }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('debe lanzar ConflictException si el nombre del proyecto ya existe', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'p1', name: 'Obra 1' });
      await expect(
        service.create({ name: 'Obra 1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('debe crear el proyecto y su almacen temporal en transaccion atomica', async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      prisma.warehouse.findFirst.mockResolvedValue(null);
      prisma.project.create.mockResolvedValue({
        id: 'p1',
        name: 'Obra Los Sauces',
        budgetCode: 'S10-01',
        status: ProjectStatus.PLANNING,
      });
      prisma.warehouse.create.mockResolvedValue({
        id: 'wh-site-1',
        name: 'Almacen Obra Los Sauces',
        type: WarehouseType.PROJECT_SITE,
        isTemporary: true,
        isActive: true,
        projectId: 'p1',
      });

      const result = await service.create({
        name: 'Obra Los Sauces',
        budgetCode: 'S10-01',
      });

      expect(result.id).toBe('p1');
      expect(result.warehouse.name).toBe('Almacen Obra Los Sauces');
      expect(prisma.warehouse.create).toHaveBeenCalledWith({
        data: {
          name: 'Almacen Obra Los Sauces',
          type: WarehouseType.PROJECT_SITE,
          isTemporary: true,
          isActive: true,
          projectId: 'p1',
        },
      });
    });
  });

  describe('ingestS10', () => {
    it('debe rechazar ingesta si la obra ya fue liquidada', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.LIQUIDATED,
      });

      await expect(
        service.ingestS10('p1', { resources: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe mapear insumos por alias, aplicar factor de conversion y reportar no mapeados', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.ACTIVE,
      });
      prisma.itemAlias.findMany.mockResolvedValue([
        {
          id: 'alias1',
          itemId: 'item-cemento',
          s10RawName: 'CEMENTO PORTLAND TIPO I',
          conversionFactor: 1.0,
        },
        {
          id: 'alias2',
          itemId: 'item-arena',
          s10RawName: 'ARENA GRUESA EN METROS',
          s10Code: '0205010002',
          conversionFactor: 1.25, // factor de conversion hacia baseUnit
        },
      ]);
      prisma.item.findMany.mockResolvedValue([
        { id: 'item-cemento', name: 'Cemento Tipo I', sku: 'CEM-01' },
        { id: 'item-arena', name: 'Arena Gruesa', sku: 'ARE-01' },
      ]);
      prisma.projectRequirement.findUnique.mockResolvedValue(null);
      prisma.projectRequirement.create.mockResolvedValue({});

      const result = await service.ingestS10('p1', {
        resources: [
          // Partida de Mano de Obra: debe descartarse automaticamente
          { s10Code: '010101', s10RawName: 'OPERARIO', quantity: 100 },
          // Mapeado por alias 1
          { s10Code: '020101', s10RawName: 'CEMENTO PORTLAND TIPO I', quantity: 50 },
          // Mapeado por alias 2 con factor 1.25 (50 * 1.25 = 62.5)
          { s10Code: '0205010002', s10RawName: 'ARENA GRUESA EN METROS', quantity: 50 },
          // No mapeado
          { s10Code: '020999', s10RawName: 'ADITIVO DESCONOCIDO S10', quantity: 10 },
        ],
      });

      expect(result.mappedCount).toBe(2);
      expect(result.unmappedCount).toBe(1);
      expect(result.unmappedItems[0].s10RawName).toBe('ADITIVO DESCONOCIDO S10');
      expect(result.requirementsCreatedOrUpdated).toBe(2);

      expect(prisma.projectRequirement.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p1',
          itemId: 'item-cemento',
          requiredQty: 50,
          allocatedQty: 0,
          consumedQty: 0,
        },
      });

      expect(prisma.projectRequirement.create).toHaveBeenCalledWith({
        data: {
          projectId: 'p1',
          itemId: 'item-arena',
          requiredQty: 62.5,
          allocatedQty: 0,
          consumedQty: 0,
        },
      });
    });
  });

  describe('getGapAnalysis', () => {
    it('debe calcular correctamente porcentajes de cumplimiento y deficit de compra', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', name: 'Obra 1' });
      prisma.projectRequirement.findMany.mockResolvedValue([
        {
          id: 'req1',
          projectId: 'p1',
          itemId: 'item1',
          requiredQty: 2500,
          allocatedQty: 500,
          consumedQty: 1200,
          item: {
            id: 'item1',
            sku: 'CEM-01',
            name: 'Cemento',
            baseUnit: 'BOL',
            type: ItemType.CONSUMABLE,
          },
          project: { id: 'p1', name: 'Obra 1' },
        },
      ]);
      prisma.warehouse.findMany.mockResolvedValue([{ id: 'wh-central' }]);
      // Almacen Central tiene 1500 fisico y 500 reservado -> disponible = 1000
      prisma.stock.findMany.mockResolvedValue([
        {
          warehouseId: 'wh-central',
          itemId: 'item1',
          physicalQty: 1500,
          reservedQty: 500,
        },
      ]);

      const result = await service.getGapAnalysis('p1', { id: 'admin1', role: Role.ADMIN });
      expect(result.analysis).toHaveLength(1);
      const row = result.analysis[0];

      // Requerido: 2500. Reservado: 500. Consumido: 1200. Pendiente: 2500 - 500 - 1200 = 800.
      expect(row.pendingToSupply).toBe('800.0000');
      // Cumplimiento: (500 + 1200) / 2500 = 68.0%
      expect(row.fulfillmentPercentage).toBe(68.0);
      // Disponible central: 1500 - 500 = 1000
      expect(row.centralAvailableStock).toBe('1000.0000');
      // Deficit: max(0, 800 - 1000) = 0
      expect(row.purchaseDeficit).toBe('0.0000');
    });
  });

  describe('allocateStock', () => {
    it('debe fallar si el almacen no es de tipo CENTRAL', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', status: ProjectStatus.ACTIVE });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-site',
        type: WarehouseType.PROJECT_SITE,
        isActive: true,
      });

      await expect(
        service.allocateStock('p1', {
          centralWarehouseId: 'wh-site',
          itemId: 'item1',
          quantityToAllocate: 100,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe fallar si no hay suficiente stock disponible en Almacen Central', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', status: ProjectStatus.ACTIVE });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.projectRequirement.findUnique.mockResolvedValue({
        id: 'req1',
        allocatedQty: 0,
      });
      prisma.stock.findUnique.mockResolvedValue({
        physicalQty: 100,
        reservedQty: 80, // disponible = 20
      });

      await expect(
        service.allocateStock('p1', {
          centralWarehouseId: 'wh-central',
          itemId: 'item1',
          quantityToAllocate: 50, // pide 50 > 20 disponible
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe incrementar reservedQty en Central y allocatedQty en el proyecto', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', status: ProjectStatus.ACTIVE });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
        isActive: true,
      });
      prisma.projectRequirement.findUnique.mockResolvedValue({
        id: 'req1',
        allocatedQty: 100,
      });
      prisma.stock.findUnique.mockResolvedValue({
        physicalQty: 500,
        reservedQty: 100, // disponible = 400
      });

      const res = await service.allocateStock('p1', {
        centralWarehouseId: 'wh-central',
        itemId: 'item1',
        quantityToAllocate: 200,
      });

      expect(res.allocatedQty).toBe('300.0000');
      expect(prisma.stock.update).toHaveBeenCalledWith({
        where: {
          warehouseId_itemId: {
            warehouseId: 'wh-central',
            itemId: 'item1',
          },
        },
        data: { reservedQty: 300 },
      });
      expect(prisma.projectRequirement.update).toHaveBeenCalledWith({
        where: { id: 'req1' },
        data: { allocatedQty: 300 },
      });
    });
  });

  describe('releaseStock', () => {
    it('debe fallar si la cantidad a liberar supera la reserva asignada al proyecto', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
      });
      prisma.projectRequirement.findUnique.mockResolvedValue({
        id: 'req1',
        allocatedQty: 50,
      });

      await expect(
        service.releaseStock('p1', {
          centralWarehouseId: 'wh-central',
          itemId: 'item1',
          quantityToRelease: 100, // pide 100 > 50
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe decrementar reservedQty en Central y allocatedQty en el proyecto', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.warehouse.findUnique.mockResolvedValue({
        id: 'wh-central',
        type: WarehouseType.CENTRAL,
      });
      prisma.projectRequirement.findUnique.mockResolvedValue({
        id: 'req1',
        allocatedQty: 100,
      });
      prisma.stock.findUnique.mockResolvedValue({
        reservedQty: 150,
      });

      const res = await service.releaseStock('p1', {
        centralWarehouseId: 'wh-central',
        itemId: 'item1',
        quantityToRelease: 40,
      });

      expect(res.allocatedQty).toBe('60.0000');
      expect(res.releasedQty).toBe('40.0000');
      expect(prisma.stock.update).toHaveBeenCalledWith({
        where: {
          warehouseId_itemId: {
            warehouseId: 'wh-central',
            itemId: 'item1',
          },
        },
        data: { reservedQty: 110 },
      });
    });
  });

  describe('liquidate', () => {
    it('debe lanzar ConflictException si el proyecto ya estaba liquidado', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.LIQUIDATED,
      });
      await expect(service.liquidate('p1')).rejects.toThrow(ConflictException);
    });

    it('debe rechazar liquidacion si no cumple las 3 condiciones de consistencia', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.ACTIVE,
        warehouse: { id: 'wh-site' },
      });

      // 1. Stock fisico remanente: 15 unidades
      prisma.stock.findMany.mockResolvedValue([{ physicalQty: 15 }]);
      // 2. Herramientas prestadas sin retornar: 2 vales
      prisma.toolCustody.count.mockResolvedValue(2);
      // 3. Transferencias en transito: 1
      prisma.transfer.count.mockResolvedValue(1);

      let caughtError: unknown;
      try {
        await service.liquidate('p1');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(BadRequestException);
      const res = (caughtError as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(res.message).toHaveLength(3);
      expect(res.message[0]).toContain('15 unidades de stock fisico remanente');
      expect(res.message[1]).toContain('2 vales de herramientas pendientes');
      expect(res.message[2]).toContain('1 transferencias en transito');
    });

    it('debe liquidar la obra y desactivar el almacen si cumple las 3 condiciones', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1',
        status: ProjectStatus.ACTIVE,
        warehouse: { id: 'wh-site', isActive: true },
      });

      // 1. Stock fisico cero
      prisma.stock.findMany.mockResolvedValue([]);
      // 2. Cero herramientas prestadas
      prisma.toolCustody.count.mockResolvedValue(0);
      // 3. Cero transferencias en transito
      prisma.transfer.count.mockResolvedValue(0);

      prisma.project.update.mockResolvedValue({
        id: 'p1',
        name: 'Obra Liquidada',
        status: ProjectStatus.LIQUIDATED,
      });
      prisma.warehouse.update.mockResolvedValue({
        id: 'wh-site',
        isActive: false,
      });

      const res = await service.liquidate('p1', {
        liquidationNotes: 'Obra concluida formalmente',
      });

      expect(res.status).toBe(ProjectStatus.LIQUIDATED);
      expect(res.warehouseDeactivated?.isActive).toBe(false);
      expect(prisma.warehouse.update).toHaveBeenCalledWith({
        where: { id: 'wh-site' },
        data: { isActive: false },
      });
    });
  });
});
