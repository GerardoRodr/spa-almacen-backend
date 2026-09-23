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
import { AdjustmentDirection } from './dto/inventory-adjustment-item.dto.js';
import { MovementFilterDto } from './dto/movement-filter.dto.js';

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

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

    // 2. Validar existencia del proyecto civil
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException('Proyecto civil no encontrado');
    }

    // 3. Validar duplicados de items en el payload
    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en la misma salida de consumo',
      );
    }

    // 4. Validar existencia en catalogo y que todos sean CONSUMABLE
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
          `El item ${itemInfo.sku} (${itemInfo.name}) es de tipo ASSET_TOOL. Solo los insumos de tipo CONSUMABLE pueden registrarse en salidas por consumo definitivo. Las herramientas deben gestionarse mediante custodia.`,
        );
      }
    }

    // 5. Validar disponibilidad de stock fisico en el almacen
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

    // 6. Transaccion atomica de salida por consumo
    return this.prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const movPrefix = `MOV-${currentYear}-`;

      const lastMov = await tx.movement.findFirst({
        where: { movementNumber: { startsWith: movPrefix } },
        orderBy: { movementNumber: 'desc' },
        select: { movementNumber: true },
      });
      let nextSeq = 1;
      if (lastMov) {
        const match = lastMov.movementNumber.match(/MOV-\d{4}-(\d+)/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      const movementNumber = `${movPrefix}${String(nextSeq).padStart(5, '0')}`;

      const movementItemsData = [];

      for (const itemDto of dto.items) {
        const stock = stockMap.get(itemDto.itemId)!;
        const dispatchedQty = Number(itemDto.quantity);
        const unitCostSnapshot = Number(stock.averageCost);
        const currentPhysical = Number(stock.physicalQty);
        const newPhysical = Number(
          (currentPhysical - dispatchedQty).toFixed(4),
        );

        // Decrementar stock fisico en almacen
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

        // Imputar consumo al presupuesto del proyecto si existe el requerimiento
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

      // Crear registro inmutable de movimiento CONSUMPTION_EXIT
      const movement = await tx.movement.create({
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

      return movement;
    });
  }

  // Registrar salida por merma o desecho fortuito (SHRINKAGE_EXIT)
  async createShrinkageExit(dto: CreateShrinkageExitDto, userId: string) {
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

    // 2. Validar que no haya items duplicados
    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en el reporte de merma',
      );
    }

    // 3. Validar existencia en catalogo maestro
    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }
    const itemMap = new Map(existingItems.map((i) => [i.id, i]));

    // 4. Validar existencia y disponibilidad de stock fisico en el almacen
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

    // 5. Transaccion atomica de baja por merma
    return this.prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const movPrefix = `MOV-${currentYear}-`;

      const lastMov = await tx.movement.findFirst({
        where: { movementNumber: { startsWith: movPrefix } },
        orderBy: { movementNumber: 'desc' },
        select: { movementNumber: true },
      });
      let nextSeq = 1;
      if (lastMov) {
        const match = lastMov.movementNumber.match(/MOV-\d{4}-(\d+)/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      const movementNumber = `${movPrefix}${String(nextSeq).padStart(5, '0')}`;

      const movementItemsData = [];

      for (const itemDto of dto.items) {
        const stock = stockMap.get(itemDto.itemId)!;
        const shrinkageQty = Number(itemDto.quantity);
        const unitCostSnapshot = Number(stock.averageCost);
        const currentPhysical = Number(stock.physicalQty);
        const newPhysical = Number(
          (currentPhysical - shrinkageQty).toFixed(4),
        );

        // Descontar stock fisico del almacen
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

      // Crear registro inmutable de movimiento SHRINKAGE_EXIT
      const movement = await tx.movement.create({
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
      const currentYear = new Date().getFullYear();
      const movPrefix = `MOV-${currentYear}-`;

      const lastMov = await tx.movement.findFirst({
        where: { movementNumber: { startsWith: movPrefix } },
        orderBy: { movementNumber: 'desc' },
        select: { movementNumber: true },
      });
      let nextSeq = 1;
      if (lastMov) {
        const match = lastMov.movementNumber.match(/MOV-\d{4}-(\d+)/);
        if (match) {
          nextSeq = parseInt(match[1], 10) + 1;
        }
      }
      const movementNumber = `${movPrefix}${String(nextSeq).padStart(5, '0')}`;

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
            if (prevQty <= 0) {
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
}
