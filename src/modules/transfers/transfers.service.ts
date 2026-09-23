import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  MovementType,
  Prisma,
  Role,
  TransferStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DispatchTransferDto } from './dto/dispatch-transfer.dto.js';
import { ReceiveTransferDto } from './dto/receive-transfer.dto.js';
import { TransferFilterDto } from './dto/transfer-filter.dto.js';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  // Listar transferencias con filtros y paginacion
  async findAll(
    filter: TransferFilterDto,
    user: { id: string; role: Role },
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TransferWhereInput = {};

    // Segregacion por rol: almacenero solo ve transferencias donde interviene su almacen
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

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.originWarehouseId) {
      where.originWarehouseId = filter.originWarehouseId;
    }

    if (filter.destWarehouseId) {
      where.destWarehouseId = filter.destWarehouseId;
    }

    if (filter.projectId) {
      where.projectId = filter.projectId;
    }

    const [total, data] = await Promise.all([
      this.prisma.transfer.count({ where }),
      this.prisma.transfer.findMany({
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
          dispatchedBy: {
            select: { id: true, fullName: true, email: true },
          },
          receivedBy: {
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
          _count: {
            select: { items: true, movements: true, documents: true },
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

  // Listar transferencias en transito pendientes de recepcion
  async findInTransit(
    destWarehouseId: string | undefined,
    user: { id: string; role: Role },
  ) {
    return this.findAll(
      {
        status: TransferStatus.IN_TRANSIT,
        destWarehouseId,
      },
      user,
    );
  }

  // Obtener detalle completo de una orden de transferencia
  async findOne(id: string, user: { id: string; role: Role }) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        originWarehouse: true,
        destWarehouse: true,
        project: true,
        dispatchedBy: {
          select: { id: true, fullName: true, email: true },
        },
        receivedBy: {
          select: { id: true, fullName: true, email: true },
        },
        items: {
          include: {
            item: true,
          },
        },
        movements: {
          include: {
            items: {
              include: {
                item: {
                  select: { id: true, sku: true, name: true, baseUnit: true },
                },
              },
            },
          },
        },
        documents: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transferencia no encontrada');
    }

    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouses = await this.prisma.userWarehouse.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const allowedIds = userWarehouses.map((w) => w.warehouseId);
      if (
        !allowedIds.includes(transfer.originWarehouseId) &&
        !allowedIds.includes(transfer.destWarehouseId)
      ) {
        throw new ForbiddenException(
          'No tiene autorizacion para acceder a esta transferencia',
        );
      }
    }

    return transfer;
  }

  // Despachar transferencia en origen (Fase 1 - TRANSFER_DISPATCH)
  async dispatch(dto: DispatchTransferDto, userId: string) {
    // 1. Validar que el almacen de origen y destino sean distintos
    if (dto.originWarehouseId === dto.destWarehouseId) {
      throw new BadRequestException(
        'El almacen de origen y destino no pueden ser el mismo',
      );
    }

    // 2. Validar existencia y operatividad de almacenes
    const [originWarehouse, destWarehouse] = await Promise.all([
      this.prisma.warehouse.findUnique({
        where: { id: dto.originWarehouseId },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: dto.destWarehouseId },
      }),
    ]);

    if (!originWarehouse) {
      throw new NotFoundException('Almacen de origen no encontrado');
    }
    if (!destWarehouse) {
      throw new NotFoundException('Almacen de destino no encontrado');
    }
    if (!originWarehouse.isActive) {
      throw new BadRequestException(
        'El almacen de origen no se encuentra activo',
      );
    }
    if (!destWarehouse.isActive) {
      throw new BadRequestException(
        'El almacen de destino no se encuentra activo',
      );
    }

    // 3. Validar proyecto civil si fue provisto
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project) {
        throw new NotFoundException('Proyecto civil no encontrado');
      }
    }

    // 4. Validar que no haya items duplicados en el envio
    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en la misma transferencia',
      );
    }

    // 5. Validar existencia de todos los items en el catalogo maestro
    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, sku: true, name: true, baseUnit: true },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }
    const itemMap = new Map(existingItems.map((i) => [i.id, i]));

    // 6. Validar disponibilidad de stock fisico en el almacen de origen
    const originStocks = await this.prisma.stock.findMany({
      where: {
        warehouseId: dto.originWarehouseId,
        itemId: { in: itemIds },
      },
    });
    const stockMap = new Map(originStocks.map((s) => [s.itemId, s]));

    for (const itemDto of dto.items) {
      const stock = stockMap.get(itemDto.itemId);
      const itemInfo = itemMap.get(itemDto.itemId)!;
      const physicalQty = stock ? Number(stock.physicalQty) : 0;

      if (!stock || physicalQty < itemDto.quantity) {
        throw new BadRequestException(
          `Stock fisico insuficiente en el almacen de origen para el item ${itemInfo.sku} (${itemInfo.name}). Disponible: ${physicalQty}, Solicitado: ${itemDto.quantity}`,
        );
      }
    }

    // 7. Ejecutar transaccion atomica de despacho
    return this.prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();

      // Generar correlativo inmutable de transferencia TR-YYYY-NNNNN
      const trPrefix = `TR-${currentYear}-`;
      const lastTransfer = await tx.transfer.findFirst({
        where: { transferNumber: { startsWith: trPrefix } },
        orderBy: { transferNumber: 'desc' },
        select: { transferNumber: true },
      });
      let nextTrSeq = 1;
      if (lastTransfer) {
        const match = lastTransfer.transferNumber.match(/TR-\d{4}-(\d+)/);
        if (match) {
          nextTrSeq = parseInt(match[1], 10) + 1;
        }
      }
      const transferNumber = `${trPrefix}${String(nextTrSeq).padStart(5, '0')}`;

      // Generar correlativo inmutable de movimiento MOV-YYYY-NNNNN
      const movPrefix = `MOV-${currentYear}-`;
      const lastMov = await tx.movement.findFirst({
        where: { movementNumber: { startsWith: movPrefix } },
        orderBy: { movementNumber: 'desc' },
        select: { movementNumber: true },
      });
      let nextMovSeq = 1;
      if (lastMov) {
        const match = lastMov.movementNumber.match(/MOV-\d{4}-(\d+)/);
        if (match) {
          nextMovSeq = parseInt(match[1], 10) + 1;
        }
      }
      const movementNumber = `${movPrefix}${String(nextMovSeq).padStart(5, '0')}`;

      // Crear registro encabezado de transferencia
      const transfer = await tx.transfer.create({
        data: {
          transferNumber,
          originWarehouseId: dto.originWarehouseId,
          destWarehouseId: dto.destWarehouseId,
          projectId: dto.projectId ?? null,
          status: TransferStatus.IN_TRANSIT,
          dispatchedById: userId,
          dispatchedAt: new Date(),
          dispatchNotes: dto.dispatchNotes?.trim() ?? null,
        },
      });

      const createdItems = [];
      const movementItemsData = [];

      for (const itemDto of dto.items) {
        const stock = stockMap.get(itemDto.itemId)!;
        const unitCostSnapshot = Number(stock.averageCost);
        const dispatchedQty = Number(itemDto.quantity);

        // Crear TransferItem con unitCostSnapshot congelado
        const transferItem = await tx.transferItem.create({
          data: {
            transferId: transfer.id,
            itemId: itemDto.itemId,
            dispatchedQty,
            unitCostSnapshot,
          },
        });
        createdItems.push(transferItem);

        // Decrementar stock fisico en origen
        const currentPhysical = Number(stock.physicalQty);
        const newPhysical = Number(
          (currentPhysical - dispatchedQty).toFixed(4),
        );

        // Si la carga corresponde a un proyecto, liberar reserva proporcional
        let newReserved = Number(stock.reservedQty);
        if (dto.projectId) {
          const req = await tx.projectRequirement.findUnique({
            where: {
              projectId_itemId: {
                projectId: dto.projectId,
                itemId: itemDto.itemId,
              },
            },
          });
          if (req && Number(req.allocatedQty) > 0) {
            const allocated = Number(req.allocatedQty);
            const releaseQty = Math.min(allocated, dispatchedQty);
            await tx.projectRequirement.update({
              where: { id: req.id },
              data: {
                allocatedQty: Number((allocated - releaseQty).toFixed(4)),
              },
            });
            newReserved = Math.max(
              0,
              Number((newReserved - releaseQty).toFixed(4)),
            );
          }
        }

        await tx.stock.update({
          where: {
            warehouseId_itemId: {
              warehouseId: dto.originWarehouseId,
              itemId: itemDto.itemId,
            },
          },
          data: {
            physicalQty: newPhysical,
            reservedQty: newReserved,
          },
        });

        // Detalle de movimiento para Kardex
        movementItemsData.push({
          itemId: itemDto.itemId,
          quantity: dispatchedQty,
          unitCostSnapshot,
          totalCostSnapshot: Number(
            (dispatchedQty * unitCostSnapshot).toFixed(2),
          ),
        });
      }

      // Crear movimiento inmutable de Kardex TRANSFER_DISPATCH
      await tx.movement.create({
        data: {
          movementNumber,
          type: MovementType.TRANSFER_DISPATCH,
          originWarehouseId: dto.originWarehouseId,
          destWarehouseId: dto.destWarehouseId,
          projectId: dto.projectId ?? null,
          userId,
          transferId: transfer.id,
          observation:
            dto.dispatchNotes?.trim() ??
            'Despacho de transferencia entre almacenes',
          items: {
            create: movementItemsData,
          },
        },
      });

      return {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        status: transfer.status,
        movementNumber,
        originWarehouseId: transfer.originWarehouseId,
        destWarehouseId: transfer.destWarehouseId,
        dispatchedAt: transfer.dispatchedAt,
        items: createdItems,
      };
    });
  }

  // Recepcionar e inspeccionar transferencia en destino (Fase 2 - TRANSFER_RECEIPT)
  async receive(
    id: string,
    dto: ReceiveTransferDto,
    user: { id: string; role: Role },
  ) {
    // 1. Validar existencia de la transferencia y estado IN_TRANSIT
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: {
        items: true,
        destWarehouse: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transferencia no encontrada');
    }

    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException(
        'Solo se pueden recibir transferencias en estado IN_TRANSIT',
      );
    }

    // 2. Segregacion para almacenero: autorizacion en almacen destino
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouses = await this.prisma.userWarehouse.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const allowedIds = userWarehouses.map((w) => w.warehouseId);
      if (!allowedIds.includes(transfer.destWarehouseId)) {
        throw new ForbiddenException(
          'No tiene autorizacion para recibir en el almacen de destino',
        );
      }
    }

    // 3. Validar correspondencia y coherencia de items reportados
    const transferItemMap = new Map(transfer.items.map((i) => [i.id, i]));

    for (const itemDto of dto.items) {
      const transferItem = transferItemMap.get(itemDto.transferItemId);
      if (!transferItem) {
        throw new BadRequestException(
          `El renglon ${itemDto.transferItemId} no pertenece a esta transferencia`,
        );
      }
      if (itemDto.receivedQty < 0) {
        throw new BadRequestException(
          'La cantidad recibida no puede ser negativa',
        );
      }
      const dispatchedQty = Number(transferItem.dispatchedQty);
      if (itemDto.receivedQty > dispatchedQty) {
        throw new BadRequestException(
          `La cantidad recibida (${itemDto.receivedQty}) supera la cantidad despachada (${dispatchedQty})`,
        );
      }
    }

    if (dto.items.length !== transfer.items.length) {
      throw new BadRequestException(
        'Debe reportar la recepcion de todos los renglones de la transferencia',
      );
    }

    // 4. Ejecutar transaccion atomica de recepcion
    return this.prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();
      const movPrefix = `MOV-${currentYear}-`;

      // Obtener secuencia base para correlativos MOV-YYYY-NNNNN
      const lastMov = await tx.movement.findFirst({
        where: { movementNumber: { startsWith: movPrefix } },
        orderBy: { movementNumber: 'desc' },
        select: { movementNumber: true },
      });
      let nextMovSeq = 1;
      if (lastMov) {
        const match = lastMov.movementNumber.match(/MOV-\d{4}-(\d+)/);
        if (match) {
          nextMovSeq = parseInt(match[1], 10) + 1;
        }
      }

      const updatedItems = [];
      const receiptMovementItems = [];
      const shrinkageMovementItems = [];

      for (const itemDto of dto.items) {
        const transferItem = transferItemMap.get(itemDto.transferItemId)!;
        const dispatchedQty = Number(transferItem.dispatchedQty);
        const receivedQty = Number(itemDto.receivedQty);
        const discrepancyQty = Number(
          (dispatchedQty - receivedQty).toFixed(4),
        );
        const unitCostSnapshot = Number(transferItem.unitCostSnapshot);

        // Actualizar renglon de transferencia con lo recibido y discrepancia
        const updatedItem = await tx.transferItem.update({
          where: { id: transferItem.id },
          data: {
            receivedQty,
            discrepancyQty: discrepancyQty > 0 ? discrepancyQty : 0,
          },
        });
        updatedItems.push(updatedItem);

        // Si se recibieron unidades conformes, incrementar stock en destino y recalcular CPP
        if (receivedQty > 0) {
          const destStock = await tx.stock.findUnique({
            where: {
              warehouseId_itemId: {
                warehouseId: transfer.destWarehouseId,
                itemId: transferItem.itemId,
              },
            },
          });

          const prevQty = destStock ? Number(destStock.physicalQty) : 0;
          const prevCPP = destStock ? Number(destStock.averageCost) : 0;

          let newCPP: number;
          if (prevQty <= 0) {
            newCPP = unitCostSnapshot;
          } else {
            const prevTotalVal = prevQty * prevCPP;
            const incomingVal = receivedQty * unitCostSnapshot;
            newCPP = Number(
              ((prevTotalVal + incomingVal) / (prevQty + receivedQty)).toFixed(
                4,
              ),
            );
          }

          const newPhysicalQty = Number((prevQty + receivedQty).toFixed(4));

          await tx.stock.upsert({
            where: {
              warehouseId_itemId: {
                warehouseId: transfer.destWarehouseId,
                itemId: transferItem.itemId,
              },
            },
            update: {
              physicalQty: newPhysicalQty,
              averageCost: newCPP,
            },
            create: {
              warehouseId: transfer.destWarehouseId,
              itemId: transferItem.itemId,
              physicalQty: newPhysicalQty,
              averageCost: newCPP,
            },
          });

          receiptMovementItems.push({
            itemId: transferItem.itemId,
            quantity: receivedQty,
            unitCostSnapshot,
            totalCostSnapshot: Number(
              (receivedQty * unitCostSnapshot).toFixed(2),
            ),
          });
        }

        // Si hubo faltantes en ruta, registrar para movimiento de merma
        if (discrepancyQty > 0) {
          shrinkageMovementItems.push({
            itemId: transferItem.itemId,
            quantity: discrepancyQty,
            unitCostSnapshot,
            totalCostSnapshot: Number(
              (discrepancyQty * unitCostSnapshot).toFixed(2),
            ),
          });
        }
      }

      // Determinar estado final: DISCREPANCY si hubo mermas, o COMPLETED
      const hasDiscrepancy = shrinkageMovementItems.length > 0;
      const finalStatus = hasDiscrepancy
        ? TransferStatus.DISCREPANCY
        : TransferStatus.COMPLETED;

      const receivedAt = new Date();

      // Sellar la orden de transferencia
      await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          status: finalStatus,
          receivedById: user.id,
          receivedAt,
          receptionNotes: dto.receptionNotes?.trim() ?? null,
        },
      });

      let receiptMovementNumber: string | undefined;
      let shrinkageMovementNumber: string | undefined;

      // 1. Movimiento de ingreso fisico TRANSFER_RECEIPT si hubo unidades conformes
      if (receiptMovementItems.length > 0) {
        receiptMovementNumber = `${movPrefix}${String(nextMovSeq).padStart(5, '0')}`;
        nextMovSeq++;
        await tx.movement.create({
          data: {
            movementNumber: receiptMovementNumber,
            type: MovementType.TRANSFER_RECEIPT,
            originWarehouseId: transfer.originWarehouseId,
            destWarehouseId: transfer.destWarehouseId,
            projectId: transfer.projectId,
            userId: user.id,
            transferId: transfer.id,
            observation:
              dto.receptionNotes?.trim() ??
              'Recepcion fisica conforme de transferencia',
            items: {
              create: receiptMovementItems,
            },
          },
        });
      }

      // 2. Movimiento automatico de merma SHRINKAGE_EXIT si hubo discrepancias en transporte
      if (hasDiscrepancy) {
        shrinkageMovementNumber = `${movPrefix}${String(nextMovSeq).padStart(5, '0')}`;
        nextMovSeq++;
        await tx.movement.create({
          data: {
            movementNumber: shrinkageMovementNumber,
            type: MovementType.SHRINKAGE_EXIT,
            originWarehouseId: transfer.originWarehouseId,
            destWarehouseId: transfer.destWarehouseId,
            projectId: transfer.projectId,
            userId: user.id,
            transferId: transfer.id,
            shrinkageReason: 'Perdida o rotura en transporte durante traslado',
            observation:
              dto.receptionNotes?.trim() ??
              'Merma automatica asentada por faltantes en recepcion',
            items: {
              create: shrinkageMovementItems,
            },
          },
        });
      }

      return {
        id: transfer.id,
        transferNumber: transfer.transferNumber,
        status: finalStatus,
        receiptMovementNumber,
        shrinkageMovementNumber,
        receivedAt,
        items: updatedItems,
      };
    });
  }
}
