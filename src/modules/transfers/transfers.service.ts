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
import { SequenceGeneratorService } from '../../common/services/sequence-generator.service.js';
import { DispatchTransferDto } from './dto/dispatch-transfer.dto.js';
import { ReceiveTransferDto } from './dto/receive-transfer.dto.js';
import { TransferFilterDto } from './dto/transfer-filter.dto.js';
import { CancelTransferDto } from './dto/cancel-transfer.dto.js';
import {
  RevertReceptionMode,
  RevertTransferReceptionDto,
} from './dto/revert-transfer-reception.dto.js';
import { UpdateTransferMetadataDto } from './dto/update-transfer-metadata.dto.js';
import { ReplaceTransferDto } from './dto/replace-transfer.dto.js';

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

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

    if (filter.includeReverted === false) {
      const notCancelled: Prisma.TransferWhereInput = {
        status: { not: TransferStatus.CANCELLED },
      };
      if (where.AND) {
        (where.AND as Prisma.TransferWhereInput[]).push(notCancelled);
      } else {
        where.AND = [notCancelled];
      }
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
    const itemMap = await this.validateDispatchStatic(dto);

    // Validar disponibilidad de stock fisico en el almacen de origen
    const itemIds = dto.items.map((i) => i.itemId);
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

    // Ejecutar transaccion atomica de despacho
    return this.prisma.$transaction((tx) =>
      this.executeDispatchInTx(tx, dto, userId, itemMap, stockMap),
    );
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
        receiptMovementNumber = await this.sequenceGenerator.getNextCode(
          tx,
          'MOV',
        );
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
        shrinkageMovementNumber = await this.sequenceGenerator.getNextCode(
          tx,
          'MOV',
        );
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

  // Nivel 1A: Cancelar una transferencia que aun esta en transito (IN_TRANSIT)
  async cancel(
    id: string,
    dto: CancelTransferDto,
    user: { id: string; role: Role },
  ) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transfer) {
      throw new NotFoundException('Transferencia no encontrada');
    }

    if (transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException('Esta transferencia ya fue anulada');
    }

    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException(
        'Solo se pueden cancelar transferencias en estado IN_TRANSIT',
      );
    }

    await this.assertWarehouseAccess(
      user,
      [transfer.originWarehouseId],
      'No tiene autorizacion para cancelar despachos del almacen de origen',
    );

    const restoreAlloc = dto.restoreProjectAllocation ?? true;

    return this.prisma.$transaction((tx) =>
      this.restoreOriginStockAndCancelInTx(
        tx,
        transfer,
        user.id,
        dto.cancellationReason,
        restoreAlloc,
      ),
    );
  }

  // Nivel 1B: Revertir recepcion en destino (vuelve a IN_TRANSIT o cancela por completo)
  async revertReception(
    id: string,
    dto: RevertTransferReceptionDto,
    user: { id: string; role: Role },
  ) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transfer) {
      throw new NotFoundException('Transferencia no encontrada');
    }

    if (transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException('Esta transferencia ya fue anulada');
    }

    if (
      transfer.status !== TransferStatus.COMPLETED &&
      transfer.status !== TransferStatus.DISCREPANCY
    ) {
      throw new BadRequestException(
        'Solo se pueden revertir recepciones de transferencias en estado COMPLETED o DISCREPANCY',
      );
    }

    const mode = dto.mode ?? RevertReceptionMode.BACK_TO_TRANSIT;

    if (mode === RevertReceptionMode.CANCEL_COMPLETELY) {
      await this.assertWarehouseAccess(
        user,
        [transfer.destWarehouseId, transfer.originWarehouseId],
        'No tiene autorizacion para revertir la recepcion y cancelar en origen',
      );
    } else {
      await this.assertWarehouseAccess(
        user,
        [transfer.destWarehouseId],
        'No tiene autorizacion para revertir recepciones en el almacen de destino',
      );
    }

    const reason = dto.reversalReason.trim();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Verificar disponibilidad y revertir stock ingresado en almacen destino
      const reversalExitItems: Array<{
        itemId: string;
        quantity: number;
        unitCostSnapshot: number;
        totalCostSnapshot: number;
      }> = [];
      const shrinkageReversalItems: Array<{
        itemId: string;
        quantity: number;
        unitCostSnapshot: number;
        totalCostSnapshot: number;
      }> = [];

      for (const transferItem of transfer.items) {
        const receivedQty = Number(transferItem.receivedQty ?? 0);
        const discrepancyQty = Number(transferItem.discrepancyQty ?? 0);
        const unitCostSnapshot = Number(transferItem.unitCostSnapshot);

        if (receivedQty > 0) {
          const destStock = await tx.stock.findUnique({
            where: {
              warehouseId_itemId: {
                warehouseId: transfer.destWarehouseId,
                itemId: transferItem.itemId,
              },
            },
          });

          const availableQty = destStock
            ? Number(destStock.physicalQty) -
              Number(destStock.reservedQty) -
              Number(destStock.loanedQty)
            : 0;

          if (!destStock || availableQty < receivedQty) {
            throw new BadRequestException(
              `Stock disponible insuficiente en el almacen de destino para revertir la recepcion del item ${transferItem.itemId}. Disponible: ${availableQty}, Recibido a revertir: ${receivedQty}`,
            );
          }

          const currentQty = Number(destStock.physicalQty);
          const currentAvg = Number(destStock.averageCost);
          const newQty = Number((currentQty - receivedQty).toFixed(4));
          const newAvg =
            newQty <= 0
              ? 0
              : Number(
                  (
                    Math.max(
                      0,
                      currentQty * currentAvg - receivedQty * unitCostSnapshot,
                    ) / newQty
                  ).toFixed(4),
                );

          await tx.stock.update({
            where: {
              warehouseId_itemId: {
                warehouseId: transfer.destWarehouseId,
                itemId: transferItem.itemId,
              },
            },
            data: {
              physicalQty: newQty,
              averageCost: newAvg,
            },
          });

          reversalExitItems.push({
            itemId: transferItem.itemId,
            quantity: receivedQty,
            unitCostSnapshot,
            totalCostSnapshot: Number(
              (receivedQty * unitCostSnapshot).toFixed(2),
            ),
          });
        }

        if (discrepancyQty > 0) {
          shrinkageReversalItems.push({
            itemId: transferItem.itemId,
            quantity: discrepancyQty,
            unitCostSnapshot,
            totalCostSnapshot: Number(
              (discrepancyQty * unitCostSnapshot).toFixed(2),
            ),
          });
        }

        // Limpiar cantidades de recepcion en el renglon
        await tx.transferItem.update({
          where: { id: transferItem.id },
          data: {
            receivedQty: null,
            discrepancyQty: 0,
          },
        });
      }

      // 2. Revertir movimiento TRANSFER_RECEIPT si existio
      if (reversalExitItems.length > 0) {
        const receiptMov = await tx.movement.findFirst({
          where: {
            transferId: transfer.id,
            type: MovementType.TRANSFER_RECEIPT,
            isReverted: false,
          },
        });
        if (receiptMov) {
          await tx.movement.update({
            where: { id: receiptMov.id },
            data: {
              isReverted: true,
              revertedAt: now,
              revertedById: user.id,
              reversalReason: reason,
            },
          });
        }

        const revExitCode = await this.sequenceGenerator.getNextCode(tx, 'MOV');
        await tx.movement.create({
          data: {
            movementNumber: revExitCode,
            type: MovementType.REVERSAL_EXIT,
            originWarehouseId: transfer.destWarehouseId,
            projectId: transfer.projectId,
            userId: user.id,
            transferId: transfer.id,
            reversesMovementId: receiptMov?.id ?? null,
            observation: `Reversion de recepcion ${transfer.transferNumber}: ${reason}`,
            items: {
              create: reversalExitItems,
            },
          },
        });
      }

      // 3. Revertir movimiento SHRINKAGE_EXIT de merma en ruta si hubo discrepancia
      if (shrinkageReversalItems.length > 0) {
        const shrinkageMov = await tx.movement.findFirst({
          where: {
            transferId: transfer.id,
            type: MovementType.SHRINKAGE_EXIT,
            isReverted: false,
          },
        });
        if (shrinkageMov) {
          await tx.movement.update({
            where: { id: shrinkageMov.id },
            data: {
              isReverted: true,
              revertedAt: now,
              revertedById: user.id,
              reversalReason: reason,
            },
          });

          const revShrinkageCode = await this.sequenceGenerator.getNextCode(
            tx,
            'MOV',
          );
          await tx.movement.create({
            data: {
              movementNumber: revShrinkageCode,
              type: MovementType.REVERSAL_ENTRY,
              projectId: transfer.projectId,
              userId: user.id,
              transferId: transfer.id,
              reversesMovementId: shrinkageMov.id,
              observation: `Anulacion contable de merma en ruta ${transfer.transferNumber}: ${reason}`,
              items: {
                create: shrinkageReversalItems,
              },
            },
          });
        }
      }

      // 4. Modo BACK_TO_TRANSIT vs CANCEL_COMPLETELY
      if (mode === RevertReceptionMode.BACK_TO_TRANSIT) {
        return tx.transfer.update({
          where: { id: transfer.id },
          data: {
            status: TransferStatus.IN_TRANSIT,
            receivedById: null,
            receivedAt: null,
            receptionNotes: null,
          },
        });
      }

      await tx.transfer.update({
        where: { id: transfer.id },
        data: {
          receivedById: null,
          receivedAt: null,
          receptionNotes: null,
        },
      });

      return this.restoreOriginStockAndCancelInTx(
        tx,
        transfer,
        user.id,
        reason,
        true,
      );
    });
  }

  // Nivel 2: Edicion de notas de despacho y/o recepcion
  async updateMetadata(
    id: string,
    dto: UpdateTransferMetadataDto,
    user: { id: string; role: Role },
  ) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
    });

    if (!transfer) {
      throw new NotFoundException('Transferencia no encontrada');
    }

    if (transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException(
        'No se pueden editar metadatos de una transferencia anulada',
      );
    }

    if (
      dto.receptionNotes !== undefined &&
      transfer.status === TransferStatus.IN_TRANSIT
    ) {
      throw new BadRequestException(
        'No se pueden editar notas de recepcion mientras la transferencia esta en transito',
      );
    }

    await this.assertWarehouseAccess(
      user,
      [transfer.originWarehouseId, transfer.destWarehouseId],
      'No tiene autorizacion para editar esta transferencia',
      false,
    );

    const data: Prisma.TransferUpdateInput = {};
    if (dto.dispatchNotes !== undefined) {
      data.dispatchNotes = dto.dispatchNotes.trim();
    }
    if (dto.receptionNotes !== undefined) {
      data.receptionNotes = dto.receptionNotes.trim();
    }

    return this.prisma.transfer.update({
      where: { id },
      data,
    });
  }

  // Nivel 3: Reemplazo atomico de transferencia IN_TRANSIT (cancela original y despacha nueva)
  async replace(
    id: string,
    dto: ReplaceTransferDto,
    user: { id: string; role: Role },
  ) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!transfer) {
      throw new NotFoundException('Transferencia no encontrada');
    }

    if (transfer.status === TransferStatus.CANCELLED) {
      throw new BadRequestException('Esta transferencia ya fue anulada');
    }

    if (transfer.status !== TransferStatus.IN_TRANSIT) {
      throw new BadRequestException(
        'Solo se pueden reemplazar transferencias en estado IN_TRANSIT',
      );
    }

    await this.assertWarehouseAccess(
      user,
      [transfer.originWarehouseId, dto.originWarehouseId],
      'No tiene autorizacion para reemplazar transferencias sobre este almacen de origen',
    );

    const itemMap = await this.validateDispatchStatic(dto);

    return this.prisma.$transaction(async (tx) => {
      const cancelledTransfer = await this.restoreOriginStockAndCancelInTx(
        tx,
        transfer,
        user.id,
        dto.cancellationReason,
        true,
      );

      const replacementTransfer = await this.executeDispatchInTx(
        tx,
        dto,
        user.id,
        itemMap,
      );

      await tx.transfer.update({
        where: { id: transfer.id },
        data: { replacedById: replacementTransfer.id },
      });

      return {
        cancelledTransfer,
        replacementTransfer,
      };
    });
  }

  private async assertWarehouseAccess(
    user: { id: string; role: Role },
    requiredWarehouseIds: string[],
    errorMessage: string,
    matchAll = true,
  ) {
    if (user.role !== Role.WAREHOUSE_KEEPER) {
      return;
    }

    const userWarehouses = await this.prisma.userWarehouse.findMany({
      where: { userId: user.id },
      select: { warehouseId: true },
    });
    const allowedSet = new Set(userWarehouses.map((w) => w.warehouseId));

    const hasAccess = matchAll
      ? requiredWarehouseIds.every((wid) => allowedSet.has(wid))
      : requiredWarehouseIds.some((wid) => allowedSet.has(wid));

    if (!hasAccess) {
      throw new ForbiddenException(errorMessage);
    }
  }

  private async validateDispatchStatic(dto: DispatchTransferDto) {
    if (dto.originWarehouseId === dto.destWarehouseId) {
      throw new BadRequestException(
        'El almacen de origen y destino no pueden ser el mismo',
      );
    }

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

    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
      });
      if (!project) {
        throw new NotFoundException('Proyecto civil no encontrado');
      }
    }

    const itemIds = dto.items.map((i) => i.itemId);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new BadRequestException(
        'No se permiten items duplicados en la misma transferencia',
      );
    }

    const existingItems = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, sku: true, name: true, baseUnit: true },
    });
    if (existingItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Uno o mas items especificados no existen en el catalogo maestro',
      );
    }

    return new Map(existingItems.map((i) => [i.id, i]));
  }

  private async executeDispatchInTx(
    tx: Prisma.TransactionClient,
    dto: DispatchTransferDto,
    userId: string,
    itemMap: Map<string, { id: string; sku: string; name: string; baseUnit: string }>,
    preloadedStockMap?: Map<string, Awaited<ReturnType<PrismaService['stock']['findMany']>>[number]>,
  ) {
    let stockMap = preloadedStockMap;
    if (!stockMap) {
      const itemIds = dto.items.map((i) => i.itemId);
      const originStocks = await tx.stock.findMany({
        where: {
          warehouseId: dto.originWarehouseId,
          itemId: { in: itemIds },
        },
      });
      stockMap = new Map(originStocks.map((s) => [s.itemId, s]));

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
    }

    const transferNumber = await this.sequenceGenerator.getNextCode(tx, 'TR');
    const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');

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

      const transferItem = await tx.transferItem.create({
        data: {
          transferId: transfer.id,
          itemId: itemDto.itemId,
          dispatchedQty,
          unitCostSnapshot,
        },
      });
      createdItems.push(transferItem);

      const currentPhysical = Number(stock.physicalQty);
      const newPhysical = Number((currentPhysical - dispatchedQty).toFixed(4));

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

      movementItemsData.push({
        itemId: itemDto.itemId,
        quantity: dispatchedQty,
        unitCostSnapshot,
        totalCostSnapshot: Number(
          (dispatchedQty * unitCostSnapshot).toFixed(2),
        ),
      });
    }

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
  }

  private async restoreOriginStockAndCancelInTx(
    tx: Prisma.TransactionClient,
    transfer: {
      id: string;
      transferNumber: string;
      originWarehouseId: string;
      projectId: string | null;
      items: Array<{
        itemId: string;
        dispatchedQty: Prisma.Decimal | number;
        unitCostSnapshot: Prisma.Decimal | number;
      }>;
    },
    userId: string,
    rawReason: string,
    restoreProjectAllocation: boolean,
  ) {
    const reason = rawReason.trim();
    const now = new Date();
    const reversalItemsData: Array<{
      itemId: string;
      quantity: number;
      unitCostSnapshot: number;
      totalCostSnapshot: number;
    }> = [];

    for (const transferItem of transfer.items) {
      const qty = Number(transferItem.dispatchedQty);
      const unitCost = Number(transferItem.unitCostSnapshot);

      const originStock = await tx.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId: transfer.originWarehouseId,
            itemId: transferItem.itemId,
          },
        },
      });

      const currentQty = originStock ? Number(originStock.physicalQty) : 0;
      const currentAvg = originStock ? Number(originStock.averageCost) : 0;
      const newQty = Number((currentQty + qty).toFixed(4));
      const newAvg =
        currentQty <= 0
          ? unitCost
          : Number(
              ((currentQty * currentAvg + qty * unitCost) / newQty).toFixed(4),
            );

      let newReserved = originStock ? Number(originStock.reservedQty) : 0;

      if (transfer.projectId && restoreProjectAllocation) {
        const req = await tx.projectRequirement.findUnique({
          where: {
            projectId_itemId: {
              projectId: transfer.projectId,
              itemId: transferItem.itemId,
            },
          },
        });
        if (req) {
          const maxAllocatable = Math.max(
            0,
            Number(req.requiredQty) -
              Number(req.consumedQty) -
              Number(req.allocatedQty),
          );
          const restoreQty = Number(Math.min(qty, maxAllocatable).toFixed(4));
          if (restoreQty > 0) {
            await tx.projectRequirement.update({
              where: { id: req.id },
              data: {
                allocatedQty: Number(
                  (Number(req.allocatedQty) + restoreQty).toFixed(4),
                ),
              },
            });
            newReserved = Number((newReserved + restoreQty).toFixed(4));
          }
        }
      }

      await tx.stock.upsert({
        where: {
          warehouseId_itemId: {
            warehouseId: transfer.originWarehouseId,
            itemId: transferItem.itemId,
          },
        },
        update: {
          physicalQty: newQty,
          averageCost: newAvg,
          reservedQty: newReserved,
        },
        create: {
          warehouseId: transfer.originWarehouseId,
          itemId: transferItem.itemId,
          physicalQty: newQty,
          averageCost: newAvg,
          reservedQty: newReserved,
        },
      });

      reversalItemsData.push({
        itemId: transferItem.itemId,
        quantity: qty,
        unitCostSnapshot: unitCost,
        totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
      });
    }

    const dispatchMovement = await tx.movement.findFirst({
      where: {
        transferId: transfer.id,
        type: MovementType.TRANSFER_DISPATCH,
        isReverted: false,
      },
    });

    if (dispatchMovement) {
      await tx.movement.update({
        where: { id: dispatchMovement.id },
        data: {
          isReverted: true,
          revertedAt: now,
          revertedById: userId,
          reversalReason: reason,
        },
      });
    }

    const reversalMovCode = await this.sequenceGenerator.getNextCode(tx, 'MOV');
    await tx.movement.create({
      data: {
        movementNumber: reversalMovCode,
        type: MovementType.REVERSAL_ENTRY,
        destWarehouseId: transfer.originWarehouseId,
        projectId: transfer.projectId,
        userId,
        transferId: transfer.id,
        reversesMovementId: dispatchMovement?.id ?? null,
        observation: `Reversion de despacho ${transfer.transferNumber}: ${reason}`,
        items: {
          create: reversalItemsData,
        },
      },
    });

    return tx.transfer.update({
      where: { id: transfer.id },
      data: {
        status: TransferStatus.CANCELLED,
        cancelledAt: now,
        cancelledById: userId,
        cancellationReason: reason,
      },
    });
  }
}
