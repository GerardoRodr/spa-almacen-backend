import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ItemType,
  MovementType,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateConsumptionExitDto } from './dto/create-consumption-exit.dto.js';
import { CreateShrinkageExitDto } from './dto/create-shrinkage-exit.dto.js';
import {
  CreateInventoryAdjustmentDto,
} from './dto/create-inventory-adjustment.dto.js';
import { CreateInitialStockDto } from './dto/create-initial-stock.dto.js';
import { AdjustmentDirection } from './dto/inventory-adjustment-item.dto.js';
import { MovementFilterDto } from './dto/movement-filter.dto.js';
import {
  RevertAdjustmentItemDirectionDto,
  RevertMovementDto,
} from './dto/revert-movement.dto.js';
import { UpdateMovementMetadataDto } from './dto/update-movement-metadata.dto.js';
import { ReplaceConsumptionExitDto } from './dto/replace-consumption-exit.dto.js';
import { ReplaceShrinkageExitDto } from './dto/replace-shrinkage-exit.dto.js';
import { SequenceGeneratorService } from '../../common/services/sequence-generator.service.js';

@Injectable()
export class MovementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

  // Listar movimientos de inventario en Kardex con filtros y paginacion
  async findAll(
    filter: MovementFilterDto,
    user: { id: string; role: Role },
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MovementWhereInput = {};

    // Segregacion por rol: almacenero solo ve movimientos donde interviene su caseta
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouses = await this.prisma.userWarehouse.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const allowedIds = userWarehouses.map((w) => w.warehouseId);

      where.AND = [
        {
          OR: [
            { originWarehouseId: { in: allowedIds } },
            { destWarehouseId: { in: allowedIds } },
          ],
        },
      ];
    }

    if (filter.warehouseId) {
      const whCondition: Prisma.MovementWhereInput = {
        OR: [
          { originWarehouseId: filter.warehouseId },
          { destWarehouseId: filter.warehouseId },
        ],
      };
      if (where.AND) {
        (where.AND as Prisma.MovementWhereInput[]).push(whCondition);
      } else {
        where.AND = [whCondition];
      }
    }

    if (filter.itemId) {
      where.items = {
        some: { itemId: filter.itemId },
      };
    }

    if (filter.projectId) {
      where.projectId = filter.projectId;
    }

    if (filter.type) {
      where.type = filter.type;
    }

    if (filter.startDate || filter.endDate) {
      where.createdAt = {};
      if (filter.startDate) {
        where.createdAt.gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        where.createdAt.lte = new Date(filter.endDate);
      }
    }

    if (filter.includeReverted === false) {
      where.isReverted = false;
    }

    const [total, data] = await Promise.all([
      this.prisma.movement.count({ where }),
      this.prisma.movement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          originWarehouse: {
            select: { id: true, name: true, type: true },
          },
          destWarehouse: {
            select: { id: true, name: true, type: true },
          },
          project: {
            select: { id: true, name: true, budgetCode: true },
          },
          user: {
            select: { id: true, fullName: true, email: true },
          },
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  baseUnit: true,
                  type: true,
                },
              },
            },
          },
          transfer: {
            select: { id: true, transferNumber: true, status: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // Consultar detalle completo de un movimiento inmutable
  async findOne(id: string, user: { id: string; role: Role }) {
    const movement = await this.prisma.movement.findUnique({
      where: { id },
      include: {
        originWarehouse: true,
        destWarehouse: true,
        project: true,
        user: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            item: true,
          },
        },
        transfer: true,
        documents: true,
      },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado');
    }

    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouses = await this.prisma.userWarehouse.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const allowedIds = userWarehouses.map((w) => w.warehouseId);
      const isAllowed =
        (movement.originWarehouseId &&
          allowedIds.includes(movement.originWarehouseId)) ||
        (movement.destWarehouseId &&
          allowedIds.includes(movement.destWarehouseId));

      if (!isAllowed) {
        throw new ForbiddenException(
          'No tiene autorizacion para acceder a este movimiento',
        );
      }
    }

    return movement;
  }

  // Registrar salida por consumo definitivo en obra (CONSUMPTION_EXIT)
  async createConsumptionExit(dto: CreateConsumptionExitDto, userId: string) {
    const itemMap = await this.validateConsumptionStatic(dto);
    const itemIds = dto.items.map((i) => i.itemId);

    // Validar disponibilidad de stock fisico en el almacen
    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: dto.warehouseId,
        itemId: { in: itemIds },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.itemId, s]));

    for (const itemDto of dto.items) {
      const stock = stockMap.get(itemDto.itemId);
      const itemInfo = itemMap.get(itemDto.itemId)!;
      const physicalQty = stock ? Number(stock.physicalQty) : 0;

      if (!stock || physicalQty < itemDto.quantity) {
        throw new BadRequestException(
          `Stock fisico insuficiente en el almacen para el item ${itemInfo.sku} (${itemInfo.name}). Disponible: ${physicalQty}, Solicitado: ${itemDto.quantity}`,
        );
      }
    }

    // Transaccion atomica de salida por consumo
    return this.prisma.$transaction((tx) =>
      this.executeConsumptionInTx(tx, dto, userId, stockMap),
    );
  }

  // Registrar salida por merma o desecho fortuito (SHRINKAGE_EXIT)
  async createShrinkageExit(dto: CreateShrinkageExitDto, userId: string) {
    const itemMap = await this.validateShrinkageStatic(dto);
    const itemIds = dto.items.map((i) => i.itemId);

    // Validar existencia y disponibilidad de stock fisico en el almacen
    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: dto.warehouseId,
        itemId: { in: itemIds },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.itemId, s]));

    for (const itemDto of dto.items) {
      const stock = stockMap.get(itemDto.itemId);
      const itemInfo = itemMap.get(itemDto.itemId)!;
      const physicalQty = stock ? Number(stock.physicalQty) : 0;

      if (!stock || physicalQty < itemDto.quantity) {
        throw new BadRequestException(
          `Stock fisico insuficiente para dar de baja el item ${itemInfo.sku} (${itemInfo.name}). Disponible: ${physicalQty}, Solicitado para merma: ${itemDto.quantity}`,
        );
      }
    }

    // Transaccion atomica de baja por merma
    return this.prisma.$transaction((tx) =>
      this.executeShrinkageInTx(tx, dto, userId, stockMap),
    );
  }

  // Registrar toma o ingreso de stock fisico inicial (ADMIN o WAREHOUSE_KEEPER asignado)
  async registerInitialStock(
    dto: CreateInitialStockDto,
    user: { id: string; role: Role; assignedWarehouses?: Array<{ warehouseId: string }> },
  ) {
    // 1. Validar existencia y operatividad del almacen
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('El almacen no se encuentra activo');
    }

    // 2. Validar que no haya items duplicados en la lista
    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en la misma solicitud de stock inicial',
      );
    }

    // 3. Validar existencia de todos los items en catalogo maestro
    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }

    // 4. Obtener stocks actuales en el almacen
    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: dto.warehouseId,
        itemId: { in: itemIds },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.itemId, s]));

    const isKeeper = user.role === Role.WAREHOUSE_KEEPER;

    // 5. Transaccion atomica
    return this.prisma.$transaction(async (tx) => {
      const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');
      const movementItemsData = [];

      for (const itemDto of dto.items) {
        const stock = stockMap.get(itemDto.itemId);
        const prevQty = stock ? Number(stock.physicalQty) : 0;
        const prevCPP = stock ? Number(stock.averageCost) : 0;
        const adjQty = Number(itemDto.quantity);

        const newPhysicalQty = Number((prevQty + adjQty).toFixed(4));
        let newCPP = prevCPP;

        if (isKeeper) {
          // Si el almacenero ingresa stock, conserva costo previo o deja 0
          newCPP = prevCPP;
        } else if (itemDto.unitCost !== undefined && itemDto.unitCost !== null) {
          const costVal = Number(itemDto.unitCost);
          if (prevQty <= 0 || prevCPP <= 0) {
            newCPP = costVal;
          } else {
            newCPP = Number(
              ((prevQty * prevCPP + adjQty * costVal) / (prevQty + adjQty)).toFixed(4),
            );
          }
        }

        await tx.stock.upsert({
          where: {
            warehouseId_itemId: {
              warehouseId: dto.warehouseId,
              itemId: itemDto.itemId,
            },
          },
          update: {
            physicalQty: newPhysicalQty,
            averageCost: newCPP,
          },
          create: {
            warehouseId: dto.warehouseId,
            itemId: itemDto.itemId,
            physicalQty: newPhysicalQty,
            averageCost: newCPP,
          },
        });

        movementItemsData.push({
          itemId: itemDto.itemId,
          quantity: adjQty,
          unitCostSnapshot: newCPP,
          totalCostSnapshot: Number((adjQty * newCPP).toFixed(2)),
        });
      }

      const observation = dto.observation?.trim()
        ? `[STOCK INICIAL] ${dto.observation.trim()}`
        : `[STOCK INICIAL] Conteo de existencias fisicas en ${warehouse.name}`;

      const movement = await tx.movement.create({
        data: {
          movementNumber,
          type: MovementType.INVENTORY_ADJUSTMENT,
          originWarehouseId: dto.warehouseId,
          userId: user.id,
          observation,
          items: {
            create: movementItemsData,
          },
        },
        include: {
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  baseUnit: true,
                  type: true,
                },
              },
            },
          },
        },
      });

      return movement;
    });
  }

  // Registrar regularizacion por inventario fisico formal (INVENTORY_ADJUSTMENT - Exclusivo ADMIN)
  async createInventoryAdjustment(
    dto: CreateInventoryAdjustmentDto,
    userId: string,
  ) {
    // 1. Validar existencia y operatividad del almacen
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('El almacen no se encuentra activo');
    }

    // 2. Validar que no haya items duplicados en la lista de ajuste
    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en la misma solicitud de ajuste',
      );
    }

    // 3. Validar existencia de todos los items en catalogo maestro
    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }
    const itemMap = new Map(existingItems.map((i) => [i.id, i]));

    // 4. Validar existencia y stock previo para los items que disminuyen (DECREASE)
    const stocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: dto.warehouseId,
        itemId: { in: itemIds },
      },
    });
    const stockMap = new Map(stocks.map((s) => [s.itemId, s]));

    for (const itemDto of dto.items) {
      if (itemDto.direction === AdjustmentDirection.DECREASE) {
        const stock = stockMap.get(itemDto.itemId);
        const itemInfo = itemMap.get(itemDto.itemId)!;
        const physicalQty = stock ? Number(stock.physicalQty) : 0;

        if (!stock || physicalQty < itemDto.quantity) {
          throw new BadRequestException(
            `No es posible realizar un ajuste de disminucion para el item ${itemInfo.sku} (${itemInfo.name}) por superar el stock fisico existente. Disponible: ${physicalQty}, Ajuste solicitado: ${itemDto.quantity}`,
          );
        }
      }
    }

    // 5. Transaccion atomica de ajuste de inventario
    return this.prisma.$transaction(async (tx) => {
      const movementNumber = await this.sequenceGenerator.getNextCode(
        tx,
        'MOV',
      );

      const movementItemsData = [];

      for (const itemDto of dto.items) {
        const stock = stockMap.get(itemDto.itemId);
        const prevQty = stock ? Number(stock.physicalQty) : 0;
        const prevCPP = stock ? Number(stock.averageCost) : 0;
        const adjQty = Number(itemDto.quantity);

        let newPhysicalQty: number;
        let unitCostSnapshot: number;

        if (itemDto.direction === AdjustmentDirection.INCREASE) {
          newPhysicalQty = Number((prevQty + adjQty).toFixed(4));
          let newCPP = prevCPP;

          if (itemDto.unitCost !== undefined && itemDto.unitCost !== null) {
            const costVal = Number(itemDto.unitCost);
            if (prevQty <= 0 || prevCPP <= 0) {
              newCPP = costVal;
            } else {
              newCPP = Number(
                ((prevQty * prevCPP + adjQty * costVal) /
                  (prevQty + adjQty)).toFixed(4),
              );
            }
          }

          await tx.stock.upsert({
            where: {
              warehouseId_itemId: {
                warehouseId: dto.warehouseId,
                itemId: itemDto.itemId,
              },
            },
            update: {
              physicalQty: newPhysicalQty,
              averageCost: newCPP,
            },
            create: {
              warehouseId: dto.warehouseId,
              itemId: itemDto.itemId,
              physicalQty: newPhysicalQty,
              averageCost: newCPP,
            },
          });

          unitCostSnapshot = newCPP;
        } else {
          // DECREASE
          newPhysicalQty = Number((prevQty - adjQty).toFixed(4));
          unitCostSnapshot = prevCPP;

          await tx.stock.update({
            where: {
              warehouseId_itemId: {
                warehouseId: dto.warehouseId,
                itemId: itemDto.itemId,
              },
            },
            data: {
              physicalQty: newPhysicalQty,
            },
          });
        }

        movementItemsData.push({
          itemId: itemDto.itemId,
          quantity: adjQty,
          unitCostSnapshot,
          totalCostSnapshot: Number((adjQty * unitCostSnapshot).toFixed(2)),
        });
      }

      // Crear registro inmutable de movimiento INVENTORY_ADJUSTMENT
      const movement = await tx.movement.create({
        data: {
          movementNumber,
          type: MovementType.INVENTORY_ADJUSTMENT,
          originWarehouseId: dto.warehouseId,
          userId,
          observation: dto.observation.trim(),
          items: {
            create: movementItemsData,
          },
        },
        include: {
          items: {
            include: {
              item: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  baseUnit: true,
                  type: true,
                },
              },
            },
          },
        },
      });

      return movement;
    });
  }

  // Nivel 1: Revertir movimiento directo de Kardex (CONSUMPTION_EXIT, SHRINKAGE_EXIT directo, INVENTORY_ADJUSTMENT)
  async revertMovement(
    id: string,
    dto: RevertMovementDto,
    user: { id: string; role: Role },
  ) {
    const movement = await this.prisma.movement.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado en el Kardex');
    }

    if (movement.isReverted) {
      throw new BadRequestException('Este movimiento ya fue revertido');
    }

    this.assertDirectMovementRevertAllowed(movement, user);
    await this.assertMovementWarehouseAccess(user, movement);

    return this.prisma.$transaction((tx) =>
      this.revertMovementInTx(
        tx,
        movement,
        user.id,
        dto.reason,
        dto.adjustmentDirections,
      ),
    );
  }

  // Nivel 2: Actualizar metadatos no contables de movimiento directo
  async updateMetadata(
    id: string,
    dto: UpdateMovementMetadataDto,
    user: { id: string; role: Role },
  ) {
    const movement = await this.prisma.movement.findUnique({
      where: { id },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado en el Kardex');
    }

    if (movement.isReverted) {
      throw new BadRequestException(
        'No se pueden editar metadatos de un movimiento revertido',
      );
    }

    await this.assertMovementWarehouseAccess(user, movement);

    if (
      (dto.recipientName !== undefined || dto.recipientDni !== undefined) &&
      movement.type !== MovementType.CONSUMPTION_EXIT
    ) {
      throw new BadRequestException(
        'recipientName y recipientDni solo pueden editarse en movimientos CONSUMPTION_EXIT',
      );
    }

    if (
      dto.shrinkageReason !== undefined &&
      movement.type !== MovementType.SHRINKAGE_EXIT
    ) {
      throw new BadRequestException(
        'shrinkageReason solo puede editarse en movimientos SHRINKAGE_EXIT',
      );
    }

    const data: Prisma.MovementUpdateInput = {};
    if (dto.recipientName !== undefined) {
      data.recipientName = dto.recipientName.trim();
    }
    if (dto.recipientDni !== undefined) {
      data.recipientDni = dto.recipientDni.trim();
    }
    if (dto.shrinkageReason !== undefined) {
      data.shrinkageReason = dto.shrinkageReason.trim();
    }
    if (dto.observation !== undefined) {
      data.observation = dto.observation.trim();
    }

    return this.prisma.movement.update({
      where: { id },
      data,
    });
  }

  // Nivel 3A: Reemplazar atomicamente una salida por consumo (CONSUMPTION_EXIT)
  async replaceConsumptionExit(
    id: string,
    dto: ReplaceConsumptionExitDto,
    user: { id: string; role: Role },
  ) {
    const movement = await this.prisma.movement.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado en el Kardex');
    }

    if (movement.isReverted) {
      throw new BadRequestException('Este movimiento ya fue revertido');
    }

    if (movement.type !== MovementType.CONSUMPTION_EXIT) {
      throw new BadRequestException(
        'Solo se pueden reemplazar movimientos de tipo CONSUMPTION_EXIT con este endpoint',
      );
    }

    await this.assertMovementWarehouseAccess(user, movement);
    if (user.role === Role.WAREHOUSE_KEEPER) {
      await this.assertWarehouseIdAccess(user.id, dto.warehouseId);
    }

    const itemMap = await this.validateConsumptionStatic(dto);

    return this.prisma.$transaction(async (tx) => {
      const revertedMovement = await this.revertMovementInTx(
        tx,
        movement,
        user.id,
        dto.reversalReason,
      );

      const replacementMovement = await this.executeConsumptionInTx(
        tx,
        dto,
        user.id,
        undefined,
        itemMap,
      );

      await tx.movement.update({
        where: { id: movement.id },
        data: { replacedById: replacementMovement.id },
      });

      return {
        revertedMovement,
        replacementMovement,
      };
    });
  }

  // Nivel 3B: Reemplazar atomicamente una baja por merma directa (SHRINKAGE_EXIT)
  async replaceShrinkageExit(
    id: string,
    dto: ReplaceShrinkageExitDto,
    user: { id: string; role: Role },
  ) {
    const movement = await this.prisma.movement.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!movement) {
      throw new NotFoundException('Movimiento no encontrado en el Kardex');
    }

    if (movement.isReverted) {
      throw new BadRequestException('Este movimiento ya fue revertido');
    }

    if (movement.type !== MovementType.SHRINKAGE_EXIT) {
      throw new BadRequestException(
        'Solo se pueden reemplazar movimientos de tipo SHRINKAGE_EXIT con este endpoint',
      );
    }

    if (movement.transferId || movement.observation?.includes('segun vale CUS-')) {
      throw new BadRequestException(
        'Esta merma pertenece a una transferencia o custodia y debe gestionarse desde su modulo de origen',
      );
    }

    await this.assertMovementWarehouseAccess(user, movement);
    if (user.role === Role.WAREHOUSE_KEEPER) {
      await this.assertWarehouseIdAccess(user.id, dto.warehouseId);
    }

    const itemMap = await this.validateShrinkageStatic(dto);

    return this.prisma.$transaction(async (tx) => {
      const revertedMovement = await this.revertMovementInTx(
        tx,
        movement,
        user.id,
        dto.reversalReason,
      );

      const replacementMovement = await this.executeShrinkageInTx(
        tx,
        dto,
        user.id,
        undefined,
        itemMap,
      );

      await tx.movement.update({
        where: { id: movement.id },
        data: { replacedById: replacementMovement.id },
      });

      return {
        revertedMovement,
        replacementMovement,
      };
    });
  }

  private assertDirectMovementRevertAllowed(
    movement: {
      type: MovementType;
      transferId: string | null;
      observation: string | null;
    },
    user: { id: string; role: Role },
  ) {
    if (
      movement.type === MovementType.REVERSAL_ENTRY ||
      movement.type === MovementType.REVERSAL_EXIT
    ) {
      throw new BadRequestException(
        'No se puede revertir un movimiento compensatorio de reversion',
      );
    }

    if (movement.type === MovementType.PURCHASE_ENTRY) {
      throw new BadRequestException(
        'Las entradas por compra deben revertirse desde el modulo de compras (/purchases/:id/revert)',
      );
    }

    if (
      movement.type === MovementType.TRANSFER_DISPATCH ||
      movement.type === MovementType.TRANSFER_RECEIPT
    ) {
      throw new BadRequestException(
        'Los movimientos de transferencia deben revertirse desde el modulo de transferencias (/transfers)',
      );
    }

    if (
      movement.type === MovementType.LOAN_DISPATCH ||
      movement.type === MovementType.LOAN_RETURN
    ) {
      throw new BadRequestException(
        'Los movimientos de prestamo deben revertirse desde el modulo de custodia de herramientas (/tool-custody)',
      );
    }

    if (
      movement.type === MovementType.SHRINKAGE_EXIT &&
      (movement.transferId !== null ||
        movement.observation?.includes('segun vale CUS-'))
    ) {
      throw new BadRequestException(
        'Esta merma pertenece a una transferencia o custodia y debe revertirse desde su modulo de origen',
      );
    }

    if (
      movement.type === MovementType.INVENTORY_ADJUSTMENT &&
      !movement.observation?.startsWith('[STOCK INICIAL]') &&
      user.role === Role.WAREHOUSE_KEEPER
    ) {
      throw new ForbiddenException(
        'Solo ADMIN o MODERATOR pueden revertir ajustes formales de inventario',
      );
    }
  }

  private async assertMovementWarehouseAccess(
    user: { id: string; role: Role },
    movement: {
      originWarehouseId: string | null;
      destWarehouseId: string | null;
    },
  ) {
    if (user.role !== Role.WAREHOUSE_KEEPER) {
      return;
    }

    const userWarehouses = await this.prisma.userWarehouse.findMany({
      where: { userId: user.id },
      select: { warehouseId: true },
    });
    const allowedIds = userWarehouses.map((w) => w.warehouseId);

    const isAllowed =
      (movement.originWarehouseId &&
        allowedIds.includes(movement.originWarehouseId)) ||
      (movement.destWarehouseId &&
        allowedIds.includes(movement.destWarehouseId));

    if (!isAllowed) {
      throw new ForbiddenException(
        'No tiene autorizacion para operar sobre este movimiento',
      );
    }
  }

  private async assertWarehouseIdAccess(userId: string, warehouseId: string) {
    const userWarehouses = await this.prisma.userWarehouse.findMany({
      where: { userId },
      select: { warehouseId: true },
    });
    const allowedIds = userWarehouses.map((w) => w.warehouseId);
    if (!allowedIds.includes(warehouseId)) {
      throw new ForbiddenException(
        'No tiene autorizacion para operar en el almacen especificado',
      );
    }
  }

  private async validateConsumptionStatic(dto: CreateConsumptionExitDto) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('El almacen no se encuentra activo');
    }

    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en la misma salida de consumo',
      );
    }

    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }

    const itemMap = new Map(existingItems.map((i) => [i.id, i]));
    for (const itemDto of dto.items) {
      const itemInfo = itemMap.get(itemDto.itemId)!;
      if (itemInfo.type !== ItemType.CONSUMABLE) {
        throw new BadRequestException(
          `El item ${itemInfo.sku} (${itemInfo.name}) es de tipo ${itemInfo.type}. Solo los insumos de tipo CONSUMABLE pueden registrarse en salidas por consumo definitivo. Las herramientas y equipos deben gestionarse mediante custodia.`,
        );
      }
    }

    return itemMap;
  }

  private async executeConsumptionInTx(
    tx: Prisma.TransactionClient,
    dto: CreateConsumptionExitDto,
    userId: string,
    preloadedStockMap?: Map<string, Awaited<ReturnType<PrismaService['stock']['findMany']>>[number]>,
    itemMap?: Map<string, Awaited<ReturnType<PrismaService['item']['findMany']>>[number]>,
  ) {
    let stockMap = preloadedStockMap;
    if (!stockMap) {
      const itemIds = dto.items.map((i) => i.itemId);
      const stocks = await tx.stock.findMany({
        where: {
          warehouseId: dto.warehouseId,
          itemId: { in: itemIds },
        },
      });
      stockMap = new Map(stocks.map((s) => [s.itemId, s]));

      for (const itemDto of dto.items) {
        const stock = stockMap.get(itemDto.itemId);
        const itemInfo = itemMap?.get(itemDto.itemId);
        const physicalQty = stock ? Number(stock.physicalQty) : 0;

        if (!stock || physicalQty < itemDto.quantity) {
          throw new BadRequestException(
            `Stock fisico insuficiente en el almacen para el item ${itemInfo ? `${itemInfo.sku} (${itemInfo.name})` : itemDto.itemId}. Disponible: ${physicalQty}, Solicitado: ${itemDto.quantity}`,
          );
        }
      }
    }

    const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');
    const movementItemsData = [];

    for (const itemDto of dto.items) {
      const stock = stockMap.get(itemDto.itemId)!;
      const dispatchedQty = Number(itemDto.quantity);
      const unitCostSnapshot = Number(stock.averageCost);
      const currentPhysical = Number(stock.physicalQty);
      const newPhysical = Number(
        (currentPhysical - dispatchedQty).toFixed(4),
      );

      await tx.stock.update({
        where: {
          warehouseId_itemId: {
            warehouseId: dto.warehouseId,
            itemId: itemDto.itemId,
          },
        },
        data: {
          physicalQty: newPhysical,
        },
      });

      const req = await tx.projectRequirement.findUnique({
        where: {
          projectId_itemId: {
            projectId: dto.projectId,
            itemId: itemDto.itemId,
          },
        },
      });
      if (req) {
        const prevConsumed = Number(req.consumedQty);
        await tx.projectRequirement.update({
          where: { id: req.id },
          data: {
            consumedQty: Number((prevConsumed + dispatchedQty).toFixed(4)),
          },
        });
      }

      movementItemsData.push({
        itemId: itemDto.itemId,
        quantity: dispatchedQty,
        unitCostSnapshot,
        totalCostSnapshot: Number(
          (dispatchedQty * unitCostSnapshot).toFixed(2),
        ),
      });
    }

    return tx.movement.create({
      data: {
        movementNumber,
        type: MovementType.CONSUMPTION_EXIT,
        originWarehouseId: dto.warehouseId,
        projectId: dto.projectId,
        userId,
        recipientName: dto.recipientName.trim(),
        recipientDni: dto.recipientDni.trim(),
        observation: dto.observation?.trim() ?? null,
        items: {
          create: movementItemsData,
        },
      },
      include: {
        items: {
          include: {
            item: {
              select: {
                id: true,
                sku: true,
                name: true,
                baseUnit: true,
                type: true,
              },
            },
          },
        },
      },
    });
  }

  private async validateShrinkageStatic(dto: CreateShrinkageExitDto) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('El almacen no se encuentra activo');
    }

    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en el reporte de merma',
      );
    }

    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }

    return new Map(existingItems.map((i) => [i.id, i]));
  }

  private async executeShrinkageInTx(
    tx: Prisma.TransactionClient,
    dto: CreateShrinkageExitDto,
    userId: string,
    preloadedStockMap?: Map<string, Awaited<ReturnType<PrismaService['stock']['findMany']>>[number]>,
    itemMap?: Map<string, Awaited<ReturnType<PrismaService['item']['findMany']>>[number]>,
  ) {
    let stockMap = preloadedStockMap;
    if (!stockMap) {
      const itemIds = dto.items.map((i) => i.itemId);
      const stocks = await tx.stock.findMany({
        where: {
          warehouseId: dto.warehouseId,
          itemId: { in: itemIds },
        },
      });
      stockMap = new Map(stocks.map((s) => [s.itemId, s]));

      for (const itemDto of dto.items) {
        const stock = stockMap.get(itemDto.itemId);
        const itemInfo = itemMap?.get(itemDto.itemId);
        const physicalQty = stock ? Number(stock.physicalQty) : 0;

        if (!stock || physicalQty < itemDto.quantity) {
          throw new BadRequestException(
            `Stock fisico insuficiente para dar de baja el item ${itemInfo ? `${itemInfo.sku} (${itemInfo.name})` : itemDto.itemId}. Disponible: ${physicalQty}, Solicitado para merma: ${itemDto.quantity}`,
          );
        }
      }
    }

    const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');
    const movementItemsData = [];

    for (const itemDto of dto.items) {
      const stock = stockMap.get(itemDto.itemId)!;
      const shrinkageQty = Number(itemDto.quantity);
      const unitCostSnapshot = Number(stock.averageCost);
      const currentPhysical = Number(stock.physicalQty);
      const newPhysical = Number((currentPhysical - shrinkageQty).toFixed(4));

      await tx.stock.update({
        where: {
          warehouseId_itemId: {
            warehouseId: dto.warehouseId,
            itemId: itemDto.itemId,
          },
        },
        data: {
          physicalQty: newPhysical,
        },
      });

      movementItemsData.push({
        itemId: itemDto.itemId,
        quantity: shrinkageQty,
        unitCostSnapshot,
        totalCostSnapshot: Number(
          (shrinkageQty * unitCostSnapshot).toFixed(2),
        ),
      });
    }

    return tx.movement.create({
      data: {
        movementNumber,
        type: MovementType.SHRINKAGE_EXIT,
        originWarehouseId: dto.warehouseId,
        userId,
        shrinkageReason: dto.shrinkageReason.trim(),
        observation: dto.observation?.trim() ?? null,
        items: {
          create: movementItemsData,
        },
      },
      include: {
        items: {
          include: {
            item: {
              select: {
                id: true,
                sku: true,
                name: true,
                baseUnit: true,
                type: true,
              },
            },
          },
        },
      },
    });
  }

  private async revertMovementInTx(
    tx: Prisma.TransactionClient,
    movement: {
      id: string;
      movementNumber: string;
      type: MovementType;
      originWarehouseId: string | null;
      destWarehouseId: string | null;
      projectId: string | null;
      observation: string | null;
      items: Array<{
        itemId: string;
        quantity: Prisma.Decimal | number;
        unitCostSnapshot: Prisma.Decimal | number;
        totalCostSnapshot: Prisma.Decimal | number;
      }>;
    },
    userId: string,
    rawReason: string,
    adjustmentDirections?: RevertAdjustmentItemDirectionDto[],
  ) {
    const reason = rawReason.trim();
    const now = new Date();
    const warehouseId = movement.originWarehouseId ?? movement.destWarehouseId;

    if (!warehouseId) {
      throw new BadRequestException(
        'El movimiento no posee almacen asociado para compensar stock',
      );
    }

    const directionMap = new Map(
      (adjustmentDirections ?? []).map((d) => [d.itemId, d.direction]),
    );

    const reversalEntryItems: Array<{
      itemId: string;
      quantity: number;
      unitCostSnapshot: number;
      totalCostSnapshot: number;
    }> = [];
    const reversalExitItems: Array<{
      itemId: string;
      quantity: number;
      unitCostSnapshot: number;
      totalCostSnapshot: number;
    }> = [];

    for (const movItem of movement.items) {
      const qty = Number(movItem.quantity);
      const unitCost = Number(movItem.unitCostSnapshot);

      let restoreAsIncrease: boolean;
      if (
        movement.type === MovementType.CONSUMPTION_EXIT ||
        movement.type === MovementType.SHRINKAGE_EXIT
      ) {
        // Revertir una salida implica devolver existencias al stock (REVERSAL_ENTRY)
        restoreAsIncrease = true;
      } else {
        // INVENTORY_ADJUSTMENT: si originalmente ingreso stock, revertir implica restar (REVERSAL_EXIT)
        const explicitDir = directionMap.get(movItem.itemId);
        const wasOriginalIncrease = explicitDir
          ? explicitDir === AdjustmentDirection.INCREASE
          : movement.destWarehouseId !== null ||
            Boolean(movement.observation?.startsWith('[STOCK INICIAL]'));
        restoreAsIncrease = !wasOriginalIncrease;
      }

      const stock = await tx.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId,
            itemId: movItem.itemId,
          },
        },
      });

      const currentQty = stock ? Number(stock.physicalQty) : 0;
      const currentAvg = stock ? Number(stock.averageCost) : 0;

      if (restoreAsIncrease) {
        const newQty = Number((currentQty + qty).toFixed(4));
        const newAvg =
          currentQty <= 0
            ? unitCost
            : Number(
                ((currentQty * currentAvg + qty * unitCost) / newQty).toFixed(4),
              );

        await tx.stock.upsert({
          where: {
            warehouseId_itemId: {
              warehouseId,
              itemId: movItem.itemId,
            },
          },
          update: {
            physicalQty: newQty,
            averageCost: newAvg,
          },
          create: {
            warehouseId,
            itemId: movItem.itemId,
            physicalQty: newQty,
            averageCost: newAvg,
          },
        });

        if (movement.type === MovementType.CONSUMPTION_EXIT && movement.projectId) {
          const req = await tx.projectRequirement.findUnique({
            where: {
              projectId_itemId: {
                projectId: movement.projectId,
                itemId: movItem.itemId,
              },
            },
          });
          if (req) {
            await tx.projectRequirement.update({
              where: { id: req.id },
              data: {
                consumedQty: Math.max(
                  0,
                  Number((Number(req.consumedQty) - qty).toFixed(4)),
                ),
              },
            });
          }
        }

        reversalEntryItems.push({
          itemId: movItem.itemId,
          quantity: qty,
          unitCostSnapshot: unitCost,
          totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
        });
      } else {
        const availableQty = stock
          ? Number(stock.physicalQty) -
            Number(stock.reservedQty) -
            Number(stock.loanedQty)
          : 0;

        if (!stock || availableQty < qty) {
          throw new BadRequestException(
            `Stock disponible insuficiente para revertir ingreso de ajuste del item ${movItem.itemId}. Disponible: ${availableQty}, Cantidad a retirar: ${qty}`,
          );
        }

        const newQty = Number((currentQty - qty).toFixed(4));
        const newAvg =
          newQty <= 0
            ? 0
            : Number(
                (
                  Math.max(0, currentQty * currentAvg - qty * unitCost) / newQty
                ).toFixed(4),
              );

        await tx.stock.update({
          where: {
            warehouseId_itemId: {
              warehouseId,
              itemId: movItem.itemId,
            },
          },
          data: {
            physicalQty: newQty,
            averageCost: newAvg,
          },
        });

        reversalExitItems.push({
          itemId: movItem.itemId,
          quantity: qty,
          unitCostSnapshot: unitCost,
          totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
        });
      }
    }

    if (reversalEntryItems.length > 0) {
      const entryCode = await this.sequenceGenerator.getNextCode(tx, 'MOV');
      await tx.movement.create({
        data: {
          movementNumber: entryCode,
          type: MovementType.REVERSAL_ENTRY,
          destWarehouseId: warehouseId,
          projectId: movement.projectId,
          userId,
          reversesMovementId: movement.id,
          observation: `Reversion de ${movement.movementNumber}: ${reason}`,
          items: {
            create: reversalEntryItems,
          },
        },
      });
    }

    if (reversalExitItems.length > 0) {
      const exitCode = await this.sequenceGenerator.getNextCode(tx, 'MOV');
      await tx.movement.create({
        data: {
          movementNumber: exitCode,
          type: MovementType.REVERSAL_EXIT,
          originWarehouseId: warehouseId,
          projectId: movement.projectId,
          userId,
          reversesMovementId: movement.id,
          observation: `Reversion de ${movement.movementNumber}: ${reason}`,
          items: {
            create: reversalExitItems,
          },
        },
      });
    }

    return tx.movement.update({
      where: { id: movement.id },
      data: {
        isReverted: true,
        revertedAt: now,
        revertedById: userId,
        reversalReason: reason,
      },
    });
  }
}
