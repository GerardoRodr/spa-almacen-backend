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
  ToolCondition,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SequenceGeneratorService } from '../../common/services/sequence-generator.service.js';
import { DispatchToolCustodyDto } from './dto/dispatch-tool-custody.dto.js';
import { ReturnToolCustodyDto } from './dto/return-tool-custody.dto.js';
import { ToolCustodyFilterDto } from './dto/tool-custody-filter.dto.js';
import { RevertCustodyDto } from './dto/revert-custody.dto.js';
import { UpdateToolCustodyMetadataDto } from './dto/update-tool-custody-metadata.dto.js';
import { ReplaceToolCustodyDto } from './dto/replace-tool-custody.dto.js';

@Injectable()
export class ToolCustodyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

  // Listar vales de prestamo con paginacion y filtros
  async findAll(
    filter: ToolCustodyFilterDto,
    user: { id: string; role: Role },
  ) {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ToolCustodyWhereInput = {};

    // Segregacion por rol: almacenero solo ve almacenes asignados
    if (user.role === Role.WAREHOUSE_KEEPER) {
      const userWarehouses = await this.prisma.userWarehouse.findMany({
        where: { userId: user.id },
        select: { warehouseId: true },
      });
      const allowedIds = userWarehouses.map((w) => w.warehouseId);

      if (filter.warehouseId) {
        if (!allowedIds.includes(filter.warehouseId)) {
          return {
            data: [],
            meta: { total: 0, page, limit, totalPages: 1 },
          };
        }
        where.warehouseId = filter.warehouseId;
      } else {
        where.warehouseId = { in: allowedIds };
      }
    } else if (filter.warehouseId) {
      where.warehouseId = filter.warehouseId;
    }

    if (filter.assignedToDni) {
      where.assignedToDni = filter.assignedToDni.trim();
    }

    if (filter.itemId) {
      where.itemId = filter.itemId;
    }

    if (filter.onlyPending) {
      where.returnDate = null;
      where.isReverted = false;
    } else if (filter.includeReverted === false) {
      where.isReverted = false;
    }

    const [total, data] = await Promise.all([
      this.prisma.toolCustody.count({ where }),
      this.prisma.toolCustody.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dispatchDate: 'desc' },
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
          warehouse: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          dispatchedBy: {
            select: {
              id: true,
              fullName: true,
            },
          },
          receivedBy: {
            select: {
              id: true,
              fullName: true,
            },
          },
          documents: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    const enrichedData = data.map((custody) => {
      const documents = custody.documents || [];
      const dispatchDocuments = documents.filter(
        (doc) => doc.proofType === 'DISPATCH',
      );
      const returnDocuments = documents.filter(
        (doc) => doc.proofType === 'RETURN',
      );

      return {
        ...custody,
        documents,
        dispatchDocuments,
        returnDocuments,
      };
    });

    return {
      data: enrichedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  // Obtener detalle completo de un vale de custodia con evidencias clasificadas
  async findOne(id: string) {
    const custody = await this.prisma.toolCustody.findUnique({
      where: { id },
      include: {
        item: true,
        warehouse: true,
        dispatchedBy: {
          select: { id: true, fullName: true, email: true },
        },
        receivedBy: {
          select: { id: true, fullName: true, email: true },
        },
        documents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!custody) {
      throw new NotFoundException('Vale de custodia no encontrado');
    }

    const documents = custody.documents || [];
    const dispatchDocuments = documents.filter(
      (doc) => doc.proofType === 'DISPATCH',
    );
    const returnDocuments = documents.filter(
      (doc) => doc.proofType === 'RETURN',
    );

    return {
      ...custody,
      documents,
      dispatchDocuments,
      returnDocuments,
    };
  }

  // Despachar herramienta en prestamo (LOAN_DISPATCH)
  async dispatch(dto: DispatchToolCustodyDto, userId: string) {
    await this.validateDispatchStatic(dto);

    const qty = Number(dto.quantity ?? 1);

    // Validar disponibilidad de stock en caseta: physicalQty - loanedQty >= qty
    const stock = await this.prisma.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId: dto.warehouseId,
          itemId: dto.itemId,
        },
      },
    });

    if (!stock) {
      throw new BadRequestException(
        'No existe stock registrado para este item en el almacen especificado',
      );
    }

    const physicalQty = Number(stock.physicalQty);
    const loanedQty = Number(stock.loanedQty);
    const available = physicalQty - loanedQty;

    if (available < qty) {
      throw new BadRequestException(
        `Stock insuficiente disponible para prestamo en caseta. Disponibles: ${available}, Solicitados: ${qty}`,
      );
    }

    // Ejecutar transaccion atomica
    return this.prisma.$transaction((tx) =>
      this.executeDispatchInTx(tx, dto, userId, stock),
    );
  }

  // Procesar devolucion y calificacion fisica de herramienta
  async processReturn(
    id: string,
    dto: ReturnToolCustodyDto,
    userId: string,
  ) {
    const custody = await this.prisma.toolCustody.findUnique({
      where: { id },
      include: { item: true },
    });

    if (!custody) {
      throw new NotFoundException('Vale de custodia no encontrado');
    }

    if (custody.isReverted) {
      throw new BadRequestException(
        'No se puede registrar devolucion de un vale anulado',
      );
    }

    if (custody.returnDate !== null) {
      throw new BadRequestException(
        'Este vale de custodia ya ha sido sellado como devuelto anteriormente',
      );
    }

    const stock = await this.prisma.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId: custody.warehouseId,
          itemId: custody.itemId,
        },
      },
    });

    if (!stock) {
      throw new NotFoundException(
        'No se encontro registro de stock para el almacen y herramienta del vale',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const returnDate = new Date();
      const qty = Number(custody.quantity);

      // Generar correlativo inmutable MOV-YYYY-NNNNN
      const movementNumber = await this.sequenceGenerator.getNextCode(
        tx,
        'MOV',
      );

      // Actualizar registro de ToolCustody
      const updatedCustody = await tx.toolCustody.update({
        where: { id },
        data: {
          returnDate,
          conditionOnReturn: dto.conditionOnReturn,
          receivedById: userId,
          returnNotes: dto.returnNotes ? dto.returnNotes.trim() : null,
        },
      });

      const currentLoaned = Number(stock.loanedQty);
      const currentPhysical = Number(stock.physicalQty);
      const unitCost = Number(stock.averageCost);

      const isConformingReturn =
        dto.conditionOnReturn === ToolCondition.NEW ||
        dto.conditionOnReturn === ToolCondition.OPERATIVE ||
        dto.conditionOnReturn === ToolCondition.DAMAGED_USABLE ||
        dto.conditionOnReturn === ToolCondition.MAINTENANCE_REQUIRED;

      if (isConformingReturn) {
        // Retorno conforme: solo decrementa loanedQty
        const newLoanedQty = Math.max(0, Number((currentLoaned - qty).toFixed(4)));
        await tx.stock.update({
          where: { id: stock.id },
          data: { loanedQty: newLoanedQty },
        });

        // Movimiento inmutable LOAN_RETURN
        await tx.movement.create({
          data: {
            movementNumber,
            type: MovementType.LOAN_RETURN,
            originWarehouseId: null,
            destWarehouseId: custody.warehouseId,
            userId,
            recipientName: custody.assignedToName,
            recipientDni: custody.assignedToDni,
            observation: `Devolucion segun vale ${custody.custodyNumber} en condicion ${dto.conditionOnReturn}`,
            items: {
              create: [
                {
                  itemId: custody.itemId,
                  quantity: qty,
                  unitCostSnapshot: unitCost,
                  totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
                },
              ],
            },
          },
        });
      } else {
        // Retorno con perdida o dano irreparable (DAMAGED_UNUSABLE o LOST):
        // Baja patrimonial: decrementa loanedQty y physicalQty
        const newLoanedQty = Math.max(0, Number((currentLoaned - qty).toFixed(4)));
        const newPhysicalQty = Math.max(
          0,
          Number((currentPhysical - qty).toFixed(4)),
        );

        await tx.stock.update({
          where: { id: stock.id },
          data: {
            loanedQty: newLoanedQty,
            physicalQty: newPhysicalQty,
          },
        });

        // Movimiento inmutable SHRINKAGE_EXIT
        const defaultReason =
          dto.conditionOnReturn === ToolCondition.LOST
            ? 'Herramienta extraviada en obra'
            : 'Herramienta rota / dano irreparable';

        await tx.movement.create({
          data: {
            movementNumber,
            type: MovementType.SHRINKAGE_EXIT,
            originWarehouseId: custody.warehouseId,
            destWarehouseId: null,
            userId,
            recipientName: custody.assignedToName,
            recipientDni: custody.assignedToDni,
            shrinkageReason: dto.returnNotes
              ? dto.returnNotes.trim()
              : defaultReason,
            observation: `Baja patrimonial por devolucion en condicion ${dto.conditionOnReturn} segun vale ${custody.custodyNumber}`,
            items: {
              create: [
                {
                  itemId: custody.itemId,
                  quantity: qty,
                  unitCostSnapshot: unitCost,
                  totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
                },
              ],
            },
          },
        });
      }

      return {
        id: updatedCustody.id,
        custodyNumber: updatedCustody.custodyNumber,
        returnDate: updatedCustody.returnDate,
        conditionOnReturn: updatedCustody.conditionOnReturn,
        returnNotes: updatedCustody.returnNotes,
        movementNumber,
        action: isConformingReturn ? 'CONFORMING_RETURN' : 'PATRIMONIAL_SHRINKAGE',
      };
    });
  }

  // Consultar herramientas actualmente en poder de un operario por DNI
  async getWorkerDebt(dni: string) {
    const loans = await this.prisma.toolCustody.findMany({
      where: {
        assignedToDni: dni.trim(),
        returnDate: null,
        isReverted: false,
      },
      include: {
        item: {
          select: {
            id: true,
            sku: true,
            name: true,
            baseUnit: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { dispatchDate: 'asc' },
    });

    return {
      workerDni: dni.trim(),
      pendingCount: loans.length,
      loans: loans.map((loan) => ({
        id: loan.id,
        custodyNumber: loan.custodyNumber,
        quantity: loan.quantity,
        serialOrCode: loan.serialOrCode,
        assignedToName: loan.assignedToName,
        dispatchDate: loan.dispatchDate,
        expectedReturnDate: loan.expectedReturnDate,
        conditionOnDispatch: loan.conditionOnDispatch,
        item: loan.item,
        warehouse: loan.warehouse,
      })),
    };
  }

  // Nivel 1A: Anular despacho de vale de custodia sin devolucion registrada
  async revertDispatch(
    id: string,
    dto: RevertCustodyDto,
    user: { id: string; role: Role },
  ) {
    const custody = await this.prisma.toolCustody.findUnique({
      where: { id },
    });

    if (!custody) {
      throw new NotFoundException('Vale de custodia no encontrado');
    }

    if (custody.isReverted) {
      throw new BadRequestException('Este vale de custodia ya fue anulado');
    }

    if (custody.returnDate !== null) {
      throw new BadRequestException(
        'No se puede anular el despacho porque ya existe una devolucion registrada; revierta primero la devolucion',
      );
    }

    await this.assertCustodyWarehouseAccess(user, custody.warehouseId);

    return this.prisma.$transaction((tx) =>
      this.revertDispatchInTx(tx, custody, user.id, dto.reason),
    );
  }

  // Nivel 1B: Revertir devolucion registrada en vale de custodia (conforme o baja patrimonial)
  async revertReturn(
    id: string,
    dto: RevertCustodyDto,
    user: { id: string; role: Role },
  ) {
    const custody = await this.prisma.toolCustody.findUnique({
      where: { id },
    });

    if (!custody) {
      throw new NotFoundException('Vale de custodia no encontrado');
    }

    if (custody.isReverted) {
      throw new BadRequestException(
        'No se puede revertir la devolucion de un vale anulado',
      );
    }

    if (custody.returnDate === null || custody.conditionOnReturn === null) {
      throw new BadRequestException(
        'El vale de custodia no tiene una devolucion registrada para revertir',
      );
    }

    await this.assertCustodyWarehouseAccess(user, custody.warehouseId);

    const reason = dto.reason.trim();
    const now = new Date();
    const qty = Number(custody.quantity);

    const wasConforming =
      custody.conditionOnReturn === ToolCondition.NEW ||
      custody.conditionOnReturn === ToolCondition.OPERATIVE ||
      custody.conditionOnReturn === ToolCondition.DAMAGED_USABLE ||
      custody.conditionOnReturn === ToolCondition.MAINTENANCE_REQUIRED;

    return this.prisma.$transaction(async (tx) => {
      const stock = await tx.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId: custody.warehouseId,
            itemId: custody.itemId,
          },
        },
      });

      if (!stock) {
        throw new NotFoundException(
          'No se encontro registro de stock para revertir la devolucion del vale',
        );
      }

      const unitCost = Number(stock.averageCost);
      const currentLoaned = Number(stock.loanedQty);
      const currentPhysical = Number(stock.physicalQty);

      if (wasConforming) {
        const availableForLoan =
          currentPhysical - Number(stock.reservedQty) - currentLoaned;
        if (availableForLoan < qty) {
          throw new BadRequestException(
            `Stock disponible insuficiente para reabrir el prestamo del vale ${custody.custodyNumber}. Disponible: ${availableForLoan}, Requerido: ${qty}`,
          );
        }

        await tx.stock.update({
          where: {
            warehouseId_itemId: {
              warehouseId: custody.warehouseId,
              itemId: custody.itemId,
            },
          },
          data: {
            loanedQty: Number((currentLoaned + qty).toFixed(4)),
          },
        });

        const returnMov = await tx.movement.findFirst({
          where: {
            type: MovementType.LOAN_RETURN,
            destWarehouseId: custody.warehouseId,
            isReverted: false,
            observation: { contains: custody.custodyNumber },
          },
        });

        if (returnMov) {
          await tx.movement.update({
            where: { id: returnMov.id },
            data: {
              isReverted: true,
              revertedAt: now,
              revertedById: user.id,
              reversalReason: reason,
            },
          });
        }

        const movCode = await this.sequenceGenerator.getNextCode(tx, 'MOV');
        await tx.movement.create({
          data: {
            movementNumber: movCode,
            type: MovementType.REVERSAL_EXIT,
            originWarehouseId: custody.warehouseId,
            userId: user.id,
            reversesMovementId: returnMov?.id ?? null,
            observation: `Reversion de devolucion ${custody.custodyNumber}: ${reason}`,
            items: {
              create: [
                {
                  itemId: custody.itemId,
                  quantity: qty,
                  unitCostSnapshot: unitCost,
                  totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
                },
              ],
            },
          },
        });
      } else {
        // Devolucion por perdida o dano irreparable habia descontado physicalQty y loanedQty
        await tx.stock.update({
          where: {
            warehouseId_itemId: {
              warehouseId: custody.warehouseId,
              itemId: custody.itemId,
            },
          },
          data: {
            physicalQty: Number((currentPhysical + qty).toFixed(4)),
            loanedQty: Number((currentLoaned + qty).toFixed(4)),
          },
        });

        const shrinkageMov = await tx.movement.findFirst({
          where: {
            type: MovementType.SHRINKAGE_EXIT,
            originWarehouseId: custody.warehouseId,
            isReverted: false,
            observation: { contains: custody.custodyNumber },
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
        }

        const movCode = await this.sequenceGenerator.getNextCode(tx, 'MOV');
        await tx.movement.create({
          data: {
            movementNumber: movCode,
            type: MovementType.REVERSAL_ENTRY,
            destWarehouseId: custody.warehouseId,
            userId: user.id,
            reversesMovementId: shrinkageMov?.id ?? null,
            observation: `Reversion de baja patrimonial ${custody.custodyNumber}: ${reason}`,
            items: {
              create: [
                {
                  itemId: custody.itemId,
                  quantity: qty,
                  unitCostSnapshot: unitCost,
                  totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
                },
              ],
            },
          },
        });
      }

      return tx.toolCustody.update({
        where: { id: custody.id },
        data: {
          returnDate: null,
          conditionOnReturn: null,
          receivedById: null,
          returnNotes: null,
        },
      });
    });
  }

  // Nivel 2: Editar metadatos no contables del vale de custodia
  async updateMetadata(
    id: string,
    dto: UpdateToolCustodyMetadataDto,
    user: { id: string; role: Role },
  ) {
    const custody = await this.prisma.toolCustody.findUnique({
      where: { id },
    });

    if (!custody) {
      throw new NotFoundException('Vale de custodia no encontrado');
    }

    if (custody.isReverted) {
      throw new BadRequestException(
        'No se pueden editar metadatos de un vale anulado',
      );
    }

    if (dto.returnNotes !== undefined && custody.returnDate === null) {
      throw new BadRequestException(
        'No se pueden editar notas de devolucion en un vale aun pendiente',
      );
    }

    await this.assertCustodyWarehouseAccess(user, custody.warehouseId);

    const data: Prisma.ToolCustodyUpdateInput = {};
    if (dto.assignedToName !== undefined) {
      data.assignedToName = dto.assignedToName.trim();
    }
    if (dto.assignedToDni !== undefined) {
      data.assignedToDni = dto.assignedToDni.trim();
    }
    if (dto.serialOrCode !== undefined) {
      data.serialOrCode = dto.serialOrCode.trim();
    }
    if (dto.expectedReturnDate !== undefined) {
      data.expectedReturnDate = new Date(dto.expectedReturnDate);
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes.trim();
    }
    if (dto.returnNotes !== undefined) {
      data.returnNotes = dto.returnNotes.trim();
    }

    return this.prisma.toolCustody.update({
      where: { id },
      data,
    });
  }

  // Nivel 3: Reemplazar atomicamente un vale de custodia pendiente sin devolucion
  async replace(
    id: string,
    dto: ReplaceToolCustodyDto,
    user: { id: string; role: Role },
  ) {
    const custody = await this.prisma.toolCustody.findUnique({
      where: { id },
    });

    if (!custody) {
      throw new NotFoundException('Vale de custodia no encontrado');
    }

    if (custody.isReverted) {
      throw new BadRequestException('Este vale de custodia ya fue anulado');
    }

    if (custody.returnDate !== null) {
      throw new BadRequestException(
        'No se puede reemplazar un vale que ya tiene devolucion registrada',
      );
    }

    await this.assertCustodyWarehouseAccess(user, custody.warehouseId);
    if (dto.warehouseId !== custody.warehouseId) {
      await this.assertCustodyWarehouseAccess(user, dto.warehouseId);
    }

    await this.validateDispatchStatic(dto);

    return this.prisma.$transaction(async (tx) => {
      const revertedCustody = await this.revertDispatchInTx(
        tx,
        custody,
        user.id,
        dto.reversalReason,
      );

      const replacementCustody = await this.executeDispatchInTx(
        tx,
        dto,
        user.id,
      );

      await tx.toolCustody.update({
        where: { id: custody.id },
        data: { replacedById: replacementCustody.id },
      });

      return {
        revertedCustody,
        replacementCustody,
      };
    });
  }

  private async assertCustodyWarehouseAccess(
    user: { id: string; role: Role },
    warehouseId: string,
  ) {
    if (user.role !== Role.WAREHOUSE_KEEPER) {
      return;
    }

    const userWarehouses = await this.prisma.userWarehouse.findMany({
      where: { userId: user.id },
      select: { warehouseId: true },
    });
    const allowedIds = userWarehouses.map((w) => w.warehouseId);
    if (!allowedIds.includes(warehouseId)) {
      throw new ForbiddenException(
        'No tiene autorizacion para operar sobre vales de este almacen',
      );
    }
  }

  private async validateDispatchStatic(dto: DispatchToolCustodyDto) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('El almacen no se encuentra activo');
    }

    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException('Item no encontrado');
    }
    const allowedCustodyTypes: ItemType[] = [ItemType.TOOL, ItemType.EQUIPMENT];
    if (!allowedCustodyTypes.includes(item.type)) {
      throw new BadRequestException(
        'Solo los items clasificados como TOOL o EQUIPMENT pueden ser despachados en prestamo y custodia',
      );
    }
  }

  private async executeDispatchInTx(
    tx: Prisma.TransactionClient,
    dto: DispatchToolCustodyDto,
    userId: string,
    preloadedStock?: NonNullable<
      Awaited<ReturnType<PrismaService['stock']['findUnique']>>
    >,
  ) {
    const qty = Number(dto.quantity ?? 1);
    const stock =
      preloadedStock ??
      (await tx.stock.findUnique({
        where: {
          warehouseId_itemId: {
            warehouseId: dto.warehouseId,
            itemId: dto.itemId,
          },
        },
      }));

    if (!stock) {
      throw new BadRequestException(
        'No existe stock registrado para este item en el almacen especificado',
      );
    }

    const physicalQty = Number(stock.physicalQty);
    const loanedQty = Number(stock.loanedQty);
    const available = physicalQty - loanedQty;

    if (available < qty) {
      throw new BadRequestException(
        `Stock insuficiente disponible para prestamo en caseta. Disponibles: ${available}, Solicitados: ${qty}`,
      );
    }

    const custodyNumber = await this.sequenceGenerator.getNextCode(tx, 'VALE');
    const movementNumber = await this.sequenceGenerator.getNextCode(tx, 'MOV');

    const newLoanedQty = Number((loanedQty + qty).toFixed(4));
    await tx.stock.update({
      where: {
        warehouseId_itemId: {
          warehouseId: dto.warehouseId,
          itemId: dto.itemId,
        },
      },
      data: {
        loanedQty: newLoanedQty,
      },
    });

    const custody = await tx.toolCustody.create({
      data: {
        custodyNumber,
        itemId: dto.itemId,
        warehouseId: dto.warehouseId,
        quantity: qty,
        serialOrCode: dto.serialOrCode ? dto.serialOrCode.trim() : null,
        assignedToName: dto.assignedToName.trim(),
        assignedToDni: dto.assignedToDni.trim(),
        dispatchedById: userId,
        expectedReturnDate: dto.expectedReturnDate
          ? new Date(dto.expectedReturnDate)
          : null,
        conditionOnDispatch: dto.conditionOnDispatch ?? ToolCondition.OPERATIVE,
        notes: dto.notes ? dto.notes.trim() : null,
      },
      include: {
        item: { select: { sku: true, name: true, baseUnit: true } },
        warehouse: { select: { name: true } },
      },
    });

    const unitCost = Number(stock.averageCost);
    await tx.movement.create({
      data: {
        movementNumber,
        type: MovementType.LOAN_DISPATCH,
        originWarehouseId: dto.warehouseId,
        destWarehouseId: null,
        userId,
        recipientName: dto.assignedToName.trim(),
        recipientDni: dto.assignedToDni.trim(),
        observation: `Prestamo en custodia segun vale ${custodyNumber}${
          dto.serialOrCode ? ` - Serie: ${dto.serialOrCode.trim()}` : ''
        }`,
        items: {
          create: [
            {
              itemId: dto.itemId,
              quantity: qty,
              unitCostSnapshot: unitCost,
              totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
            },
          ],
        },
      },
    });

    return {
      id: custody.id,
      custodyNumber: custody.custodyNumber,
      movementNumber,
      assignedToName: custody.assignedToName,
      assignedToDni: custody.assignedToDni,
      quantity: custody.quantity,
      dispatchDate: custody.dispatchDate,
      conditionOnDispatch: custody.conditionOnDispatch,
      item: custody.item,
      warehouse: custody.warehouse,
    };
  }

  private async revertDispatchInTx(
    tx: Prisma.TransactionClient,
    custody: {
      id: string;
      custodyNumber: string;
      warehouseId: string;
      itemId: string;
      quantity: Prisma.Decimal | number;
    },
    userId: string,
    rawReason: string,
  ) {
    const reason = rawReason.trim();
    const now = new Date();
    const qty = Number(custody.quantity);

    const stock = await tx.stock.findUnique({
      where: {
        warehouseId_itemId: {
          warehouseId: custody.warehouseId,
          itemId: custody.itemId,
        },
      },
    });

    const unitCost = stock ? Number(stock.averageCost) : 0;
    if (stock) {
      const currentLoaned = Number(stock.loanedQty);
      await tx.stock.update({
        where: {
          warehouseId_itemId: {
            warehouseId: custody.warehouseId,
            itemId: custody.itemId,
          },
        },
        data: {
          loanedQty: Math.max(0, Number((currentLoaned - qty).toFixed(4))),
        },
      });
    }

    const dispatchMov = await tx.movement.findFirst({
      where: {
        type: MovementType.LOAN_DISPATCH,
        originWarehouseId: custody.warehouseId,
        isReverted: false,
        observation: { contains: custody.custodyNumber },
      },
    });

    if (dispatchMov) {
      await tx.movement.update({
        where: { id: dispatchMov.id },
        data: {
          isReverted: true,
          revertedAt: now,
          revertedById: userId,
          reversalReason: reason,
        },
      });
    }

    const movCode = await this.sequenceGenerator.getNextCode(tx, 'MOV');
    await tx.movement.create({
      data: {
        movementNumber: movCode,
        type: MovementType.REVERSAL_ENTRY,
        destWarehouseId: custody.warehouseId,
        userId,
        reversesMovementId: dispatchMov?.id ?? null,
        observation: `Anulacion de prestamo ${custody.custodyNumber}: ${reason}`,
        items: {
          create: [
            {
              itemId: custody.itemId,
              quantity: qty,
              unitCostSnapshot: unitCost,
              totalCostSnapshot: Number((qty * unitCost).toFixed(2)),
            },
          ],
        },
      },
    });

    return tx.toolCustody.update({
      where: { id: custody.id },
      data: {
        isReverted: true,
        revertedAt: now,
        revertedById: userId,
        reversalReason: reason,
      },
    });
  }
}
