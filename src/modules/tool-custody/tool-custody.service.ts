import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ItemType,
  MovementType,
  Prisma,
  Role,
  ToolCondition,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DispatchToolCustodyDto } from './dto/dispatch-tool-custody.dto.js';
import { ReturnToolCustodyDto } from './dto/return-tool-custody.dto.js';
import { ToolCustodyFilterDto } from './dto/tool-custody-filter.dto.js';

@Injectable()
export class ToolCustodyService {
  constructor(private readonly prisma: PrismaService) {}

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

  // Obtener detalle completo de un vale de custodia
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
        documents: true,
      },
    });

    if (!custody) {
      throw new NotFoundException('Vale de custodia no encontrado');
    }

    return custody;
  }

  // Despachar herramienta en prestamo (LOAN_DISPATCH)
  async dispatch(dto: DispatchToolCustodyDto, userId: string) {
    // 1. Validar existencia y estado del almacen
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException('El almacen no se encuentra activo');
    }

    // 2. Validar que el item exista y sea ASSET_TOOL
    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });
    if (!item) {
      throw new NotFoundException('Item no encontrado');
    }
    if (item.type !== ItemType.ASSET_TOOL) {
      throw new BadRequestException(
        'Solo los items clasificados como ASSET_TOOL pueden ser despachados en prestamo y custodia',
      );
    }

    const qty = Number(dto.quantity ?? 1);

    // 3. Validar disponibilidad de stock en caseta: physicalQty - loanedQty >= qty
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

    // 4. Ejecutar transaccion atomica
    return this.prisma.$transaction(async (tx) => {
      const currentYear = new Date().getFullYear();

      // Generar correlativo inmutable VALE-YYYY-NNNNN
      const valePrefix = `VALE-${currentYear}-`;
      const lastVale = await tx.toolCustody.findFirst({
        where: { custodyNumber: { startsWith: valePrefix } },
        orderBy: { custodyNumber: 'desc' },
        select: { custodyNumber: true },
      });
      let nextValeSeq = 1;
      if (lastVale) {
        const match = lastVale.custodyNumber.match(/VALE-\d{4}-(\d+)/);
        if (match) {
          nextValeSeq = parseInt(match[1], 10) + 1;
        }
      }
      const custodyNumber = `${valePrefix}${String(nextValeSeq).padStart(5, '0')}`;

      // Generar correlativo inmutable MOV-YYYY-NNNNN
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

      // Incrementar Stock.loanedQty
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

      // Crear registro de custodia
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

      // Registrar movimiento inmutable LOAN_DISPATCH
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
    });
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
      const currentYear = returnDate.getFullYear();
      const qty = Number(custody.quantity);

      // Generar correlativo inmutable MOV-YYYY-NNNNN
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
}
